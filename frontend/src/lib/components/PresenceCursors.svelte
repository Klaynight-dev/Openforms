<script lang="ts">
  /**
   * Pointeurs des autres personnes ayant le même formulaire ouvert.
   *
   * Une position en pixels d'écran ne voudrait rien dire d'un poste à l'autre
   * (taille de fenêtre, défilement, largeur du tableur) : chaque pointeur est
   * donc exprimé par rapport à l'élément survolé qui porte un attribut
   * `data-cursor-anchor` (carte de question, cellule du tableur…), en fraction
   * de sa largeur et de sa hauteur. Hors de tout ancrage, il est repéré depuis
   * le centre de la zone `data-cursor-root`, là où la mise en page est centrée.
   */
  import { onMount } from "svelte";
  import {
    realtime,
    presenceTopic,
    type CursorPosition,
    type PresenceUser,
    type RealtimeEvent,
  } from "$lib/stores/realtime.svelte.ts";
  import { presenceColor, shortName } from "$lib/presence.ts";

  let { formId, view, selfId }: { formId: string; view: string; selfId: string | undefined } = $props();

  interface RemoteCursor extends CursorPosition {
    user: PresenceUser;
    seenAt: number;
  }

  /** Cadence d'envoi : assez fluide à l'œil sans inonder la socket. */
  const SEND_INTERVAL_MS = 50;
  /** Un pointeur immobile depuis ce délai disparaît (onglet oublié ouvert). */
  const IDLE_HIDE_MS = 60_000;

  let cursors = $state<Record<string, RemoteCursor>>({});
  /** Relu par `place` : l'incrémenter recalcule toutes les positions. */
  let layoutTick = $state(0);
  let now = $state(Date.now());

  $effect(() => {
    const id = formId;
    cursors = {};
    const unsubscribe = realtime.subscribe([presenceTopic(id)], handleEvent);
    return () => {
      realtime.sendCursor(id, { view, anchor: null, x: 0, y: 0, hidden: true });
      unsubscribe();
    };
  });

  function handleEvent(event: RealtimeEvent) {
    if (event.type === "cursor:move") {
      if (event.user.id === selfId) return;
      cursors[event.user.id] = {
        user: event.user,
        view: event.view,
        anchor: event.anchor,
        x: event.x,
        y: event.y,
        hidden: event.hidden,
        seenAt: Date.now(),
      };
    } else if (event.type === "presence:leave") {
      delete cursors[event.userId];
    }
  }

  // --- Envoi de notre propre pointeur ---

  let pointer: { x: number; y: number } | null = null;
  let lastSent = 0;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;

  function locate(clientX: number, clientY: number): CursorPosition | null {
    const target = document.elementFromPoint(clientX, clientY);
    const anchorEl = target?.closest<HTMLElement>("[data-cursor-anchor]");
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          view,
          anchor: anchorEl.dataset.cursorAnchor ?? null,
          x: (clientX - rect.left) / rect.width,
          y: (clientY - rect.top) / rect.height,
        };
      }
    }
    const root = document.querySelector("[data-cursor-root]");
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    return { view, anchor: null, x: clientX - (rect.left + rect.width / 2), y: clientY - rect.top };
  }

  function queueSend() {
    if (sendTimer) return;
    const wait = Math.max(0, SEND_INTERVAL_MS - (Date.now() - lastSent));
    sendTimer = setTimeout(() => {
      sendTimer = null;
      if (!pointer) return;
      const position = locate(pointer.x, pointer.y);
      if (!position) return;
      lastSent = Date.now();
      realtime.sendCursor(formId, position);
    }, wait);
  }

  function onPointerMove(event: PointerEvent) {
    // Au doigt, il n'y a pas de pointeur à suivre, seulement des appuis.
    if (event.pointerType === "touch") return;
    pointer = { x: event.clientX, y: event.clientY };
    queueSend();
  }

  function hideOwnCursor() {
    if (!pointer) return;
    pointer = null;
    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = null;
    realtime.sendCursor(formId, { view, anchor: null, x: 0, y: 0, hidden: true });
  }

  function onPointerOut(event: PointerEvent) {
    if (event.relatedTarget === null) hideOwnCursor();
  }

  let layoutRaf = 0;
  function onLayoutChange() {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      layoutTick++;
    });
    // Le contenu défile sous un pointeur immobile : sa position relative change.
    if (pointer) queueSend();
  }

  // Changer d'onglet déplace le pointeur dans une autre vue.
  $effect(() => {
    void view;
    if (pointer) queueSend();
  });

  onMount(() => {
    // Rattrape les changements de mise en page sans évènement (carte ajoutée,
    // tri du tableur) et fait disparaître les pointeurs inactifs.
    const interval = setInterval(() => {
      now = Date.now();
      layoutTick++;
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hideOwnCursor();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // En capture : le tableur défile dans son propre conteneur, pas la page.
    window.addEventListener("scroll", onLayoutChange, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onLayoutChange, { capture: true });
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (sendTimer) clearTimeout(sendTimer);
      if (layoutRaf) cancelAnimationFrame(layoutRaf);
    };
  });

  // --- Affichage des pointeurs distants ---

  const visible = $derived(
    Object.values(cursors).filter(
      (cursor) => !cursor.hidden && cursor.view === view && now - cursor.seenAt < IDLE_HIDE_MS,
    ),
  );

  function place(cursor: RemoteCursor): { left: number; top: number } | null {
    void layoutTick;
    let left: number;
    let top: number;
    if (cursor.anchor) {
      const el = document.querySelector(`[data-cursor-anchor="${CSS.escape(cursor.anchor)}"]`);
      // Ligne hors de la fenêtre virtuelle du tableur, question supprimée…
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      left = rect.left + cursor.x * rect.width;
      top = rect.top + cursor.y * rect.height;
    } else {
      const root = document.querySelector("[data-cursor-root]");
      if (!root) return null;
      const rect = root.getBoundingClientRect();
      left = rect.left + rect.width / 2 + cursor.x;
      top = rect.top + cursor.y;
    }
    if (left < -20 || top < -20 || left > window.innerWidth || top > window.innerHeight) return null;
    return { left, top };
  }
</script>

<svelte:window
  onpointermove={onPointerMove}
  onpointerout={onPointerOut}
  onblur={hideOwnCursor}
  onresize={onLayoutChange}
/>

<div class="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
  {#each visible as cursor (cursor.user.id)}
    {@const position = place(cursor)}
    {#if position}
      {@const color = presenceColor(cursor.user.id)}
      <div class="remote-cursor" style="transform: translate({position.left}px, {position.top}px);">
        <svg width="18" height="18" viewBox="0 0 18 18" class="drop-shadow-sm">
          <path d="M2 1.5 L2 15 L6 11.2 L8.6 17 L11 16 L8.5 10.3 L14 10.3 Z" fill={color} stroke="white" stroke-width="1.4" stroke-linejoin="round" />
        </svg>
        <span class="remote-cursor-label" style="background:{color}">{shortName(cursor.user.name)}</span>
      </div>
    {/if}
  {/each}
</div>

<style>
  .remote-cursor {
    position: absolute;
    left: 0;
    top: 0;
    transition: transform 90ms linear;
    will-change: transform;
  }
  .remote-cursor-label {
    position: absolute;
    left: 14px;
    top: 16px;
    padding: 2px 8px;
    border-radius: 999px;
    color: white;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.4;
    white-space: nowrap;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
  }
  @media (prefers-reduced-motion: reduce) {
    .remote-cursor {
      transition: none;
    }
  }
</style>
