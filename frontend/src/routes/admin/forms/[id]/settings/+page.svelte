<script lang="ts">
  import { getContext, onMount, untrack } from "svelte";
  import { EditHistory } from "$lib/editHistory.svelte.ts";
  import { api } from "$api/client.ts";
  import { toasts } from "$lib/stores/toast.svelte.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import { realtime, commentsTopic, type RealtimeEvent } from "$lib/stores/realtime.svelte.ts";
  import { IconCheck, IconWarning, IconShield, IconLock, IconLink, IconSettings, IconUsers, IconClose, IconTrash, IconCode } from "$lib/icons.ts";
  import Segmented from "$components/Segmented.svelte";
  import { EnvelopeSimple as IconEmail, CalendarBlank as IconCalendar, SlidersHorizontal as IconSliders, ChatCircle as IconComment } from "phosphor-svelte";
  import type { FormDetail, Permission, FormRole, FormComment, ApiKeyInfo } from "$lib/types.ts";

  const editorState = getContext<{
    form: FormDetail | null;
    permission: Permission;
    saving: boolean;
    saved: boolean;
    error: string | null;
    saveCallback: (() => Promise<void>) | null;
    triggerSave: () => Promise<void>;
    history: EditHistory<unknown> | null;
    markDirty: () => void;
  }>("form-editor-context");

  const canManageAccess = $derived(editorState.permission === "EDITOR");
  const canComment = $derived(editorState.permission === "COMMENTER" || editorState.permission === "EDITOR");

  // --- Partage (cercle 1 : viewer / commentateur / éditeur) ---
  let shareEmail = $state("");
  let shareRole = $state<FormRole>("VIEWER");
  let sharing = $state(false);

  async function addShare(e: Event) {
    e.preventDefault();
    if (!editorState.form || !shareEmail.trim()) return;
    sharing = true;
    try {
      const res = await api.shareForm(editorState.form.id, shareEmail.trim(), shareRole);
      const access = editorState.form.access ?? [];
      const idx = access.findIndex((a) => a.userId === res.access.userId);
      if (idx >= 0) access[idx] = res.access;
      else access.push(res.access);
      editorState.form.access = [...access];
      shareEmail = "";
      shareRole = "VIEWER";
      toasts.success("Accès accordé.");
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Impossible de partager ce formulaire.");
    } finally {
      sharing = false;
    }
  }

  async function removeShare(userId: string) {
    if (!editorState.form) return;
    try {
      await api.unshareForm(editorState.form.id, userId);
      editorState.form.access = (editorState.form.access ?? []).filter((a) => a.userId !== userId);
      toasts.success("Accès révoqué.");
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Révocation impossible.");
    }
  }

  const FORM_ROLE_LABEL: Record<FormRole, string> = {
    VIEWER: "Lecteur",
    COMMENTER: "Commentateur",
    EDITOR: "Éditeur",
  };

  // --- Commentaires ---
  let comments = $state<FormComment[]>([]);
  let commentsLoading = $state(true);
  let newComment = $state("");
  let postingComment = $state(false);

  async function loadComments(formId: string) {
    commentsLoading = true;
    try {
      const res = await api.listComments(formId);
      comments = res.comments;
    } catch {
      /* silencieux : un panneau de commentaires vide reste acceptable */
    } finally {
      commentsLoading = false;
    }
  }

  async function postComment(e: Event) {
    e.preventDefault();
    if (!editorState.form || !newComment.trim()) return;
    postingComment = true;
    try {
      const res = await api.addComment(editorState.form.id, newComment.trim());
      comments = [...comments, res.comment];
      newComment = "";
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Envoi du commentaire impossible.");
    } finally {
      postingComment = false;
    }
  }

  async function toggleResolved(c: FormComment) {
    try {
      const res = await api.resolveComment(c.id, !c.resolved);
      comments = comments.map((x) => (x.id === c.id ? res.comment : x));
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Action impossible.");
    }
  }

  async function removeComment(c: FormComment) {
    try {
      await api.deleteComment(c.id);
      comments = comments.filter((x) => x.id !== c.id);
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Suppression impossible.");
    }
  }

  /** Commentaires postés par les autres collaborateurs, sans rechargement. */
  function applyCommentEvent(event: RealtimeEvent) {
    if (event.type === "comment:created") {
      if (comments.some((c) => c.id === event.comment.id)) return;
      comments = [...comments, event.comment];
    } else if (event.type === "comment:updated") {
      comments = comments.map((c) => (c.id === event.comment.id ? event.comment : c));
    } else if (event.type === "comment:deleted") {
      comments = comments.filter((c) => c.id !== event.commentId);
    }
  }

  $effect(() => {
    const formId = editorState.form?.id;
    if (!formId) return;
    loadComments(formId);
    return realtime.subscribe([commentsTopic(formId)], applyCommentEvent);
  });

  /** Réglages éditables ici, dans la forme attendue par les champs du formulaire. */
  function settingsOf(form: FormDetail | null) {
    return {
      slug: form?.slug ?? "",
      requireConsent: form?.requireConsent ?? true,
      consentText: form?.consentText ?? "",
      privacyPolicyUrl: form?.privacyPolicyUrl ?? "",
      isAnonymized: form?.isAnonymized ?? false,
      encryptResponses: form?.encryptResponses ?? false,
      visibility: form?.visibility ?? "PUBLIC",
      allowedEmails: form?.allowedEmails ?? ([] as string[]),
      notifyOwner: form?.notifyOwner ?? false,
      sendConfirmationEmail: form?.sendConfirmationEmail ?? false,
      confirmationEmailText: form?.confirmationEmailText ?? "",
      webhookUrl: form?.webhookUrl ?? "",
      startsAt: (form?.startsAt ?? null) as string | null,
      endsAt: (form?.endsAt ?? null) as string | null,
      maxResponses: (form?.maxResponses ?? null) as number | null,
      embedEnabled: form?.embedEnabled ?? true,
      embedOrigins: form?.embedOrigins ?? ([] as string[]),
    };
  }

  // Local settings copy bound to inputs
  let settings = $state(settingsOf(null));

  // Sync state once the form loads in the parent layout
  $effect(() => {
    if (editorState.form) {
      settings = settingsOf(editorState.form);
    }
  });

  // --- Enregistrement automatique & annulation ---

  const history = new EditHistory({
    snapshot: () => $state.snapshot(settings),
    apply: (value) => {
      const restored = value as typeof settings;
      // Le lien public n'est jamais envoyé en cours de frappe (voir
      // `commitSlug`) : une annulation qui le rétablit doit le faire partir,
      // sinon l'écran et le serveur afficheraient deux liens différents.
      if (restored.slug !== settings.slug) slugCommitted = true;
      settings = restored;
    },
  });

  $effect(() => {
    editorState.history = history as EditHistory<unknown>;
    return () => {
      editorState.history = null;
      history.dispose();
    };
  });

  // `untrack` : l'instantané pris au chargement ferait sinon dépendre l'effet
  // de tous les réglages, et l'historique repartirait de zéro à chaque frappe.
  $effect(() => {
    if (!editorState.form?.id) return;
    untrack(() => history.reset());
  });

  /**
   * Le lien public est comparé à part : il ne part qu'une fois le champ quitté
   * (voir `commitSlug`), sinon l'URL publique changerait à chaque caractère
   * tapé.
   */
  const comparable = (value: ReturnType<typeof settingsOf>) => {
    const { slug, ...rest } = value;
    return JSON.stringify(rest);
  };

  const savedSignature = $derived(comparable(settingsOf(editorState.form)));

  $effect(() => {
    if (comparable(settings) === savedSignature) return;
    untrack(() => {
      history.record();
      editorState.markDirty();
    });
  });

  /** Le lien saisi n'est proposé au serveur qu'une fois la saisie terminée. */
  let slugCommitted = $state(false);

  function commitSlug() {
    if (!editorState.form || settings.slug === editorState.form.slug) return;
    slugCommitted = true;
    editorState.markDirty();
  }

  // Allowed emails text helper
  let allowedEmailsText = $derived((settings.allowedEmails ?? []).join("\n"));

  // --- Lien personnalisé ---
  let origin = $state("");
  onMount(() => {
    origin = window.location.origin;
  });
  let slugCopied = $state(false);
  let publicUrl = $derived(`${origin || ""}/f/${settings.slug || ""}`);

  // Normalize input as the admin types: lowercase, spaces/invalid chars -> hyphen
  function onSlugInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    settings.slug = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-{2,}/g, "-");
  }

  async function copyPublicUrl() {
    await navigator.clipboard.writeText(publicUrl);
    slugCopied = true;
    setTimeout(() => { slugCopied = false; }, 2000);
  }


  // --- Intégration sur un site tiers ---------------------------------------

  /** Onglet de code affiché : chacun correspond à une façon d'intégrer. */
  let embedTab = $state<"iframe" | "script" | "api">("iframe");
  let copiedSnippet = $state<string | null>(null);

  const EMBED_TABS = [
    { value: "iframe" as const, label: "iframe", title: "Un cadre isolé, à hauteur fixe" },
    { value: "script" as const, label: "Script", title: "Cadre dont la hauteur suit le formulaire" },
    { value: "api" as const, label: "API", title: "Votre propre interface, servie par l'API" },
  ];

  const ORIGINS_PLACEHOLDER = ["https://exemple.org", "https://*.partenaire.fr"].join("\n");

  /** Saisie libre des origines, une par ligne : plus lisible qu'une liste de champs. */
  let embedOriginsText = $state("");
  let embedOriginsTouched = $state(false);

  // Tant que l'administrateur n'a pas touché au champ, il suit le formulaire ;
  // ensuite c'est sa saisie qui fait foi, sinon la frappe serait écrasée.
  $effect(() => {
    const origins = settings.embedOrigins;
    if (embedOriginsTouched) return;
    untrack(() => {
      embedOriginsText = origins.join("\n");
    });
  });

  function commitEmbedOrigins() {
    settings.embedOrigins = embedOriginsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    embedOriginsTouched = false;
  }

  let embedUrl = $derived(`${origin || ""}/embed/${settings.slug || ""}`);

  /**
   * Les extraits sont construits à partir de l'origine courante : ils restent
   * valables tels quels une fois collés, y compris derrière un domaine
   * personnalisé.
   */
  let iframeSnippet = $derived(
    [
      "<iframe",
      `  src="${embedUrl}"`,
      `  title="${(editorState.form?.title ?? "Formulaire").replace(/"/g, "&quot;")}"`,
      '  style="width:100%;border:0;height:720px"',
      '  loading="lazy"',
      "></iframe>",
    ].join("\n"),
  );

  // Les balises de l'extrait sont assemblées morceau par morceau : le
  // compilateur Svelte lit ce bloc à travers un scanner HTML, et une balise
  // écrite en toutes lettres y ouvrirait ou refermerait le composant.
  const SCRIPT_OPEN = "<" + "script";
  const SCRIPT_CLOSE = "<" + "/script>";

  let scriptSnippet = $derived(
    [
      `<div data-openforms="${settings.slug}" data-openforms-mode="iframe"></div>`,
      `${SCRIPT_OPEN} src="${origin || ""}/embed.js" defer>${SCRIPT_CLOSE}`,
    ].join("\n"),
  );

  let apiSnippet = $derived(
    [
      "# Définition du formulaire",
      `curl ${origin || ""}/api/v1/forms/public/${settings.slug}`,
      "",
      "# Envoi d'une réponse",
      `curl -X POST ${origin || ""}/api/v1/responses/submit \\`,
      "  -H 'Content-Type: application/json' \\",
      `  -d '{"formId":"${editorState.form?.id ?? ""}","consent":true,"data":{}}'`,
    ].join("\n"),
  );

  let currentSnippet = $derived(
    embedTab === "iframe" ? iframeSnippet : embedTab === "script" ? scriptSnippet : apiSnippet,
  );

  async function copySnippet() {
    await navigator.clipboard.writeText(currentSnippet);
    copiedSnippet = embedTab;
    setTimeout(() => {
      copiedSnippet = null;
    }, 2000);
  }

  // --- Clés d'intégration ---------------------------------------------------
  // Une clé d'embed ne donne accès qu'à ce formulaire, en lecture et en
  // soumission : elle peut donc vivre en clair dans le code du site hôte.

  let embedKeys = $state<ApiKeyInfo[]>([]);
  let embedKeyName = $state("");
  let creatingKey = $state(false);
  /** Token en clair : affiché une seule fois, juste après sa création. */
  let freshKey = $state<string | null>(null);

  async function loadEmbedKeys(formId: string) {
    try {
      const res = await api.listApiKeys();
      embedKeys = res.keys.filter((k) => k.scope === "EMBED" && k.formId === formId);
    } catch {
      // Les clés appartiennent au compte : un collaborateur sans droit d'y
      // accéder voit simplement une liste vide.
      embedKeys = [];
    }
  }

  $effect(() => {
    const formId = editorState.form?.id;
    if (!formId) return;
    loadEmbedKeys(formId);
  });

  async function createEmbedKey(e: Event) {
    e.preventDefault();
    if (!editorState.form || !embedKeyName.trim()) return;
    creatingKey = true;
    try {
      const res = await api.createApiKey(embedKeyName.trim(), {
        scope: "EMBED",
        formId: editorState.form.id,
      });
      freshKey = res.token;
      embedKeyName = "";
      await loadEmbedKeys(editorState.form.id);
      toasts.success("Clé d'intégration créée.");
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      creatingKey = false;
    }
  }

  async function revokeEmbedKey(id: string) {
    try {
      await api.deleteApiKey(id);
      embedKeys = embedKeys.filter((k) => k.id !== id);
      toasts.success("Clé révoquée.");
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : "Révocation impossible.");
    }
  }

  // Date formatting helper
  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      const offset = d.getTimezoneOffset();
      const localDate = new Date(d.getTime() - offset * 60 * 1000);
      return localDate.toISOString().slice(0, 16);
    } catch {
      return "";
    }
  }

  // Save implementation
  async function save() {
    if (!editorState.form) return;
    
    const res = await api.updateForm(editorState.form.id, {
      title: editorState.form.title,
      slug: slugCommitted ? settings.slug : undefined,
      description: editorState.form.description ?? undefined,
      schema: editorState.form.schema,
      metaColumns: editorState.form.metaColumns,
      requireConsent: settings.requireConsent,
      // Les champs vidés partent tels quels : un `undefined` serait ignoré par
      // le serveur, et l'ancienne valeur resterait en base.
      consentText: settings.consentText,
      privacyPolicyUrl: settings.privacyPolicyUrl,
      isAnonymized: settings.isAnonymized,
      encryptResponses: settings.encryptResponses,
      visibility: settings.visibility,
      allowedEmails: settings.allowedEmails,
      notifyOwner: settings.notifyOwner,
      sendConfirmationEmail: settings.sendConfirmationEmail,
      confirmationEmailText: settings.confirmationEmailText,
      webhookUrl: settings.webhookUrl,
      startsAt: settings.startsAt,
      endsAt: settings.endsAt,
      maxResponses: settings.maxResponses ?? null,
      embedEnabled: settings.embedEnabled,
      embedOrigins: settings.embedOrigins,
    });

    // Update the parent's form object to keep layout title and details in sync
    editorState.form.slug = res.form.slug;
    settings.slug = res.form.slug;
    slugCommitted = false;
    editorState.form.requireConsent = settings.requireConsent;
    editorState.form.consentText = settings.consentText;
    editorState.form.privacyPolicyUrl = settings.privacyPolicyUrl;
    editorState.form.isAnonymized = settings.isAnonymized;
    editorState.form.encryptResponses = settings.encryptResponses;
    editorState.form.visibility = settings.visibility;
    editorState.form.allowedEmails = settings.allowedEmails;
    editorState.form.notifyOwner = settings.notifyOwner;
    editorState.form.sendConfirmationEmail = settings.sendConfirmationEmail;
    editorState.form.confirmationEmailText = settings.confirmationEmailText;
    editorState.form.webhookUrl = settings.webhookUrl;
    editorState.form.startsAt = settings.startsAt;
    editorState.form.endsAt = settings.endsAt;
    editorState.form.maxResponses = settings.maxResponses;
    // Le serveur normalise les origines (schéma ajouté, chemin retiré) : on
    // reprend sa version, sinon l'écran afficherait encore la saisie brute.
    editorState.form.embedEnabled = res.form.embedEnabled;
    editorState.form.embedOrigins = res.form.embedOrigins;
    settings.embedEnabled = res.form.embedEnabled ?? true;
    settings.embedOrigins = res.form.embedOrigins ?? [];
  }

  // Register save function to the layout's header "Sauvegarder" button
  $effect(() => {
    editorState.saveCallback = save;
    return () => {
      editorState.saveCallback = null;
    };
  });
</script>

<div class="max-w-2xl mx-auto px-4 md:px-0 space-y-6">
  <!-- Custom URL Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-violet-50 text-[color:var(--brand)]"><IconLink size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Lien personnalisé</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Choisissez l'adresse publique utilisée pour partager ce formulaire</p>
      </div>
    </div>
    <div class="p-6 space-y-3">
      <label class="label text-xs" for="slug-input">Lien public</label>
      <div class="flex items-stretch rounded-xl border border-[color:var(--line)] overflow-hidden focus-within:ring-2 focus-within:ring-[color:var(--brand)] focus-within:border-transparent">
        <span class="px-3 flex items-center bg-slate-50 text-xs text-[color:var(--muted)] font-mono border-r border-[color:var(--line)] shrink-0 max-w-[45%] truncate">
          {origin || "https://votre-domaine"}/f/
        </span>
        <input
          id="slug-input"
          type="text"
          class="flex-1 min-w-0 px-3 py-2 text-xs font-mono outline-none"
          placeholder="mon-formulaire"
          value={settings.slug}
          oninput={onSlugInput}
          onblur={commitSlug}
        />
        <button
          type="button"
          class="btn-text !px-3 !rounded-none border-l border-[color:var(--line)] shrink-0"
          title="Copier le lien"
          onclick={copyPublicUrl}
        >
          {#if slugCopied}
            <IconCheck size={16} class="text-green-600" />
          {:else}
            <IconLink size={16} />
          {/if}
        </button>
      </div>
      <p class="text-[10px] text-[color:var(--muted)] break-all">{publicUrl}</p>
      <p class="text-[10px] text-[color:var(--muted)]">3 à 80 caractères : minuscules, chiffres et tirets uniquement.</p>
    </div>
  </div>


  <!-- Integration Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-emerald-50 text-emerald-600"><IconCode size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Intégration sur un autre site</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Afficher ce formulaire dans votre site, sans rediriger le visiteur</p>
      </div>
    </div>
    <div class="p-6 space-y-5">
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={settings.embedEnabled}
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]"
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Autoriser l'intégration</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Décoché, le formulaire n'est accessible que sur cette instance : tout cadre externe est refusé par le navigateur.</p>
        </div>
      </label>

      {#if settings.embedEnabled}
        <div class="animate-fade-in space-y-5">
          <div>
            <label class="label text-xs" for="embed-origins-input">Sites autorisés</label>
            <textarea
              id="embed-origins-input"
              class="input text-xs font-mono"
              rows="3"
              placeholder={ORIGINS_PLACEHOLDER}
              bind:value={embedOriginsText}
              oninput={() => (embedOriginsTouched = true)}
              onblur={commitEmbedOrigins}
            ></textarea>
            <p class="text-[10px] text-[color:var(--muted)] mt-1">
              Une adresse par ligne. <strong>Laisser vide autorise tous les sites</strong> ;
              renseignez-les pour que le formulaire ne s'affiche que chez vous.
              <code>https://*.exemple.org</code> couvre les sous-domaines.
            </p>
          </div>

          <div>
            <div class="flex items-center justify-between gap-3 mb-2">
              <span class="label text-xs !mb-0">Code à coller</span>
              <Segmented
                dense
                label="Méthode d'intégration"
                value={embedTab}
                options={EMBED_TABS}
                onchange={(v) => (embedTab = v)}
              />
            </div>

            <div class="relative">
              <pre class="rounded-xl border border-[color:var(--line)] bg-slate-50 p-4 pr-12 text-[11px] leading-relaxed font-mono overflow-x-auto whitespace-pre">{currentSnippet}</pre>
              <button
                type="button"
                class="btn-text absolute top-2 right-2 !px-2"
                title="Copier le code"
                onclick={copySnippet}
              >
                {#if copiedSnippet === embedTab}
                  <IconCheck size={16} class="text-green-600" />
                {:else}
                  <IconLink size={16} />
                {/if}
              </button>
            </div>

            <p class="text-[10px] text-[color:var(--muted)] mt-2">
              {#if embedTab === "iframe"}
                Le plus simple, et le plus isolé : aucun script n'entre dans votre page. La hauteur est fixe, ajustez-la à votre formulaire.
              {:else if embedTab === "script"}
                Même cadre, mais sa hauteur suit le contenu : plus de défilement interne sur un formulaire à plusieurs pages.
              {:else}
                Pour construire votre propre interface. Le formulaire répond en JSON ; la soumission applique les mêmes règles que le formulaire hébergé.
              {/if}
            </p>
          </div>

          {#if settings.visibility !== "PUBLIC"}
            <div class="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p class="text-xs font-semibold text-amber-900">Ce formulaire n'est pas public</p>
              <p class="text-[11px] text-amber-800 mt-1">
                Un visiteur ne peut pas se connecter depuis un cadre externe : son cookie y serait
                bloqué comme cookie tiers. Créez une clé d'intégration ci-dessous, puis ajoutez-la
                à l'adresse (<code>?key=…</code>) ou à l'attribut <code>data-openforms-key</code>.
              </p>
            </div>
          {/if}

          {#if canManageAccess}
            <div class="border-t border-slate-100 pt-5">
              <span class="label text-xs">Clés d'intégration</span>
              <p class="text-[10px] text-[color:var(--muted)] mb-3">
                Une clé ne donne accès qu'à ce formulaire : le lire et y répondre, rien d'autre.
                Elle peut donc rester visible dans le code de votre site.
              </p>

              {#if freshKey}
                <div class="mb-3 rounded-xl border border-green-200 bg-green-50 p-4 animate-fade-in">
                  <p class="text-xs font-semibold text-green-900 mb-2">
                    Copiez cette clé maintenant : elle ne sera plus affichée.
                  </p>
                  <code class="block text-[11px] font-mono break-all bg-white border border-green-200 rounded-lg p-2.5">{freshKey}</code>
                  <button type="button" class="btn-text text-[11px] mt-2" onclick={() => (freshKey = null)}>
                    J'ai copié la clé
                  </button>
                </div>
              {/if}

              {#if embedKeys.length > 0}
                <ul class="mb-3 space-y-2">
                  {#each embedKeys as key (key.id)}
                    <li class="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--line)] px-3 py-2">
                      <div class="min-w-0">
                        <p class="text-xs font-semibold truncate">{key.name}</p>
                        <p class="text-[10px] text-[color:var(--muted)]">
                          {key.lastUsedAt ? "Dernier appel le " + new Date(key.lastUsedAt).toLocaleDateString("fr-FR") : "Jamais utilisée"}
                        </p>
                      </div>
                      <button
                        type="button"
                        class="btn-text !px-2 text-[color:var(--danger)]"
                        title="Révoquer cette clé"
                        onclick={() => revokeEmbedKey(key.id)}
                      >
                        <IconTrash size={16} />
                      </button>
                    </li>
                  {/each}
                </ul>
              {/if}

              <form class="flex items-center gap-2" onsubmit={createEmbedKey}>
                <input
                  class="input text-xs flex-1"
                  type="text"
                  placeholder="Nom de la clé (ex. site vitrine)"
                  bind:value={embedKeyName}
                />
                <button type="submit" class="btn-secondary text-xs shrink-0" disabled={creatingKey || !embedKeyName.trim()}>
                  {creatingKey ? "…" : "Créer"}
                </button>
              </form>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- RGPD & Consentment Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-violet-50 text-[color:var(--brand)]"><IconShield size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">RGPD & Consentement</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Gérer le recueil du consentement obligatoire des répondants</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.requireConsent} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Exiger le consentement</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Le répondant devra cocher une case d'acceptation obligatoire avant de pouvoir soumettre le formulaire.</p>
        </div>
      </label>
      
      {#if settings.requireConsent}
        <div class="pt-2 animate-fade-in">
          <label class="label text-xs" for="consent-text-input">Texte de consentement</label>
          <textarea 
            id="consent-text-input"
            class="input text-xs" 
            rows="3" 
            placeholder="J'accepte que mes réponses soient traitées conformément au RGPD..." 
            bind:value={settings.consentText}
          ></textarea>
        </div>

        <div class="pt-2 animate-fade-in">
          <label class="label text-xs" for="privacy-policy-url-input">Lien vers la politique de confidentialité</label>
          <input
            id="privacy-policy-url-input"
            type="url"
            class="input text-xs"
            placeholder="Laisser vide pour utiliser la page /legal/confidentialite de l'instance"
            bind:value={settings.privacyPolicyUrl}
          />
          <p class="text-[10px] text-[color:var(--muted)] mt-1">Affiché sous la case de consentement. Utile si votre organisation publie sa propre politique de confidentialité ailleurs.</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Security & Privacy Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-blue-50 text-blue-600"><IconLock size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Sécurité & Confidentialité</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Options d'anonymisation et de chiffrement des réponses</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.isAnonymized} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Anonymiser les réponses</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Aucune adresse IP ni identifiant système ne sera stocké avec les soumissions.</p>
        </div>
      </label>
      
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.encryptResponses} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Chiffrer au repos (Chiffrement)</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Chiffre le contenu des réponses en base de données pour une sécurité maximale.</p>
        </div>
      </label>
    </div>
  </div>

  <!-- Visibility Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-emerald-50 text-emerald-600"><IconSliders size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Visibilité & Accès</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Définir qui peut accéder et répondre à ce formulaire</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <div>
        <label class="label text-xs" for="visibility-select">Règle de visibilité active</label>
        <select id="visibility-select" class="input text-xs" bind:value={settings.visibility}>
          <option value="PUBLIC">Publique (Tout le monde peut répondre)</option>
          <option value="PRIVATE">Utilisateurs connectés uniquement</option>
          <option value="RESTRICTED">Certaines personnes (par adresse e-mail)</option>
        </select>
      </div>
      
      {#if settings.visibility === "RESTRICTED"}
        <div class="pt-2 animate-fade-in">
          <label class="label text-xs" for="restricted-emails-input">Adresses e-mail autorisées (une par ligne)</label>
          <textarea 
            id="restricted-emails-input"
            class="input text-xs font-mono" 
            rows="4" 
            placeholder="exemple1@humanitour.org&#10;exemple2@humanitour.org" 
            value={allowedEmailsText}
            oninput={(e) => {
              settings.allowedEmails = (e.target as HTMLTextAreaElement).value
                .split("\n")
                .map((email) => email.trim())
                .filter(Boolean);
            }}
          ></textarea>
        </div>
      {/if}
    </div>
  </div>

  <!-- Notifications & Webhooks Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-indigo-50 text-indigo-600"><IconEmail size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">E-mails & Webhooks</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Configurer les alertes de réception et les webhooks</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.notifyOwner} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Alerte e-mail propriétaire</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">M'envoyer un e-mail récapitulatif à chaque fois qu'une nouvelle réponse est enregistrée.</p>
        </div>
      </label>
      
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.sendConfirmationEmail} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Confirmation e-mail répondant</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Envoyer automatiquement une copie de confirmation par e-mail au répondant.</p>
        </div>
      </label>
      
      {#if settings.sendConfirmationEmail}
        <div class="pt-2 animate-fade-in">
          <label class="label text-xs" for="confirmation-email-text-input">Texte de l'e-mail de confirmation</label>
          <textarea 
            id="confirmation-email-text-input"
            class="input text-xs" 
            rows="3" 
            placeholder="Merci pour votre soumission. Nous l'avons bien reçue..." 
            bind:value={settings.confirmationEmailText}
          ></textarea>
        </div>
      {/if}

      <div class="pt-2 border-t border-slate-100">
        <label class="label text-xs flex items-center gap-1" for="webhook-url-input">
          <IconLink size={14} /> URL de Webhook (POST JSON)
        </label>
        <input 
          id="webhook-url-input"
          type="url" 
          class="input text-xs font-mono" 
          placeholder="https://votre-serveur.com/api/webhook" 
          bind:value={settings.webhookUrl} 
        />
        <p class="text-[10px] text-[color:var(--muted)] mt-1">L'API enverra une requête HTTP POST avec le payload JSON de la soumission à cette URL.</p>
      </div>
    </div>
  </div>

  <!-- Limits & Schedule Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-orange-50 text-orange-600"><IconCalendar size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Planification & Quotas</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Restreindre la période d'ouverture ou le volume de réponses</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label text-xs" for="starts-at-input">Date et heure d'ouverture</label>
          <input 
            id="starts-at-input"
            type="datetime-local" 
            class="input text-xs" 
            value={formatDate(settings.startsAt)} 
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              settings.startsAt = v ? new Date(v).toISOString() : null;
            }} 
          />
        </div>
        <div>
          <label class="label text-xs" for="ends-at-input">Date et heure de fermeture</label>
          <input 
            id="ends-at-input"
            type="datetime-local" 
            class="input text-xs" 
            value={formatDate(settings.endsAt)} 
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              settings.endsAt = v ? new Date(v).toISOString() : null;
            }} 
          />
        </div>
      </div>

      <div class="pt-2 border-t border-slate-100">
        <label class="label text-xs" for="max-responses-input">Quota maximum de réponses</label>
        <input 
          id="max-responses-input"
          type="number" 
          class="input text-xs" 
          placeholder="Aucune limite" 
          bind:value={settings.maxResponses} 
        />
        <p class="text-[10px] text-[color:var(--muted)] mt-1">Le formulaire se fermera automatiquement lorsque ce nombre de réponses sera atteint.</p>
      </div>
    </div>
  </div>

  <!-- Sharing Card (cercle 1 : viewer / commentateur / éditeur) -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-violet-50 text-[color:var(--brand)]"><IconUsers size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Partage</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Qui peut consulter, commenter ou modifier ce formulaire- l'appartenance à une organisation ne donne aucun accès automatique.</p>
      </div>
    </div>
    <div class="p-6 space-y-3">
      {#if (editorState.form?.access ?? []).length === 0}
        <p class="text-xs text-[color:var(--muted)]">Personne d'autre que le propriétaire n'a accès à ce formulaire.</p>
      {:else}
        {#each editorState.form?.access ?? [] as a (a.id)}
          <div class="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <div class="min-w-0">
              <span class="truncate block">{a.user.displayName || a.user.email}</span>
              {#if a.user.displayName}<span class="text-[10px] text-[color:var(--muted)]">{a.user.email}</span>{/if}
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium">{FORM_ROLE_LABEL[a.role]}</span>
              {#if canManageAccess}
                <button type="button" class="text-[color:var(--danger)]" onclick={() => removeShare(a.userId)} aria-label="Révoquer l'accès">
                  <IconClose size={14} />
                </button>
              {/if}
            </div>
          </div>
        {/each}
      {/if}

      {#if canManageAccess}
        <form onsubmit={addShare} class="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          <input type="email" required class="input text-xs flex-1" placeholder="email@exemple.fr" bind:value={shareEmail} />
          <select class="input text-xs sm:w-40" bind:value={shareRole}>
            <option value="VIEWER">Lecteur</option>
            <option value="COMMENTER">Commentateur</option>
            <option value="EDITOR">Éditeur</option>
          </select>
          <button type="submit" class="btn-secondary text-xs shrink-0" disabled={sharing}>{sharing ? "…" : "Partager"}</button>
        </form>
      {/if}
    </div>
  </div>

  <!-- Comments Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-amber-50 text-amber-600"><IconComment size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Commentaires</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Échanges entre collaborateurs sur ce formulaire (réservés à COMMENTER et EDITOR)</p>
      </div>
    </div>
    <div class="p-6 space-y-3">
      {#if commentsLoading}
        <p class="text-xs text-[color:var(--muted)]">Chargement…</p>
      {:else if comments.length === 0}
        <p class="text-xs text-[color:var(--muted)]">Aucun commentaire pour l'instant.</p>
      {:else}
        {#each comments as c (c.id)}
          <div class="rounded-xl border border-slate-100 p-3 text-xs" class:opacity-50={c.resolved}>
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-semibold text-[color:var(--ink)]">{c.author.displayName || c.author.email}</span>
              <div class="flex items-center gap-2 shrink-0">
                {#if c.resolved}<span class="text-[10px] text-green-600 flex items-center gap-0.5"><IconCheck size={11} /> résolu</span>{/if}
                {#if canComment || c.authorId === auth.user?.id}
                  <button type="button" class="text-[color:var(--muted)] hover:text-[color:var(--ink)]" onclick={() => toggleResolved(c)} title={c.resolved ? "Marquer comme non résolu" : "Marquer comme résolu"}>
                    <IconCheck size={13} />
                  </button>
                {/if}
                {#if c.authorId === auth.user?.id || editorState.permission === "EDITOR"}
                  <button type="button" class="text-[color:var(--danger)]" onclick={() => removeComment(c)} aria-label="Supprimer"><IconTrash size={13} /></button>
                {/if}
              </div>
            </div>
            <p class="text-[color:var(--ink)] whitespace-pre-wrap">{c.body}</p>
          </div>
        {/each}
      {/if}

      {#if canComment}
        <form onsubmit={postComment} class="pt-2 border-t border-slate-100 flex gap-2">
          <textarea class="input text-xs flex-1" rows="2" placeholder="Laisser un commentaire..." bind:value={newComment}></textarea>
          <button type="submit" class="btn-secondary text-xs shrink-0" disabled={postingComment}>{postingComment ? "…" : "Envoyer"}</button>
        </form>
      {/if}
    </div>
  </div>

  <!-- Bottom Save Button for ergonomics -->
  <div class="flex justify-end pt-4 pb-12">
    <button 
      class="btn-primary w-full sm:w-auto" 
      onclick={() => editorState.triggerSave()} 
      disabled={editorState.saving}
    >
      <IconCheck size={18} />
      <span>{editorState.saving ? "Envoi..." : "Sauvegarder les paramètres"}</span>
    </button>
  </div>
</div>
