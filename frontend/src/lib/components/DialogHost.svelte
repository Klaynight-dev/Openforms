<script lang="ts">
  /**
   * Rend le dialogue demandé par `askConfirm` / `askPrompt`.
   * Monté une seule fois dans le layout racine.
   */
  import Modal from "./Modal.svelte";
  import { dialogs } from "$lib/stores/dialog.svelte.ts";

  let value = $state("");
  let seededFor: unknown = null;

  const request = $derived(dialogs.current);

  $effect(() => {
    // Réamorce le champ à chaque nouvelle demande, pas à chaque frappe.
    if (request?.kind === "prompt" && seededFor !== request) {
      seededFor = request;
      value = request.initial ?? "";
    }
    if (!request) seededFor = null;
  });

  const promptInvalid = $derived(
    request?.kind === "prompt" && request.required !== false && value.trim() === "",
  );

  function submit() {
    if (!request) return;
    if (request.kind === "confirm") dialogs.answer(true);
    else if (!promptInvalid) dialogs.answer(value.trim());
  }
</script>

{#if request}
  <Modal
    open={true}
    title={request.title}
    description={request.message}
    size="sm"
    onclose={() => dialogs.answer(request.kind === "confirm" ? false : null)}
  >
    {#if request.kind === "prompt"}
      <!-- Un formulaire : Entrée valide, comme dans le prompt natif. -->
      <form
        onsubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label class="block">
          <span class="label !mb-1 !text-xs">{request.label}</span>
          <!-- svelte-ignore a11y_autofocus -- le dialogue vient d'être ouvert par l'utilisateur -->
          <input
            class="input"
            autofocus
            placeholder={request.placeholder}
            maxlength={request.maxLength ?? 200}
            bind:value
          />
        </label>
      </form>
    {:else}
      <p class="text-sm" style="color: var(--ink-soft)">
        {request.message ?? "Cette action est définitive."}
      </p>
    {/if}

    {#snippet footer()}
      <button
        type="button"
        class="btn-text !text-sm"
        onclick={() => dialogs.answer(request.kind === "confirm" ? false : null)}
      >
        {request.kind === "confirm" ? (request.cancelLabel ?? "Annuler") : "Annuler"}
      </button>
      <button
        type="button"
        class="{request.kind === 'confirm' && request.danger ? 'btn-danger' : 'btn-primary'} !px-4 !py-2 !text-sm"
        disabled={promptInvalid}
        onclick={submit}
      >
        {request.confirmLabel ?? (request.kind === "confirm" ? "Confirmer" : "Valider")}
      </button>
    {/snippet}
  </Modal>
{/if}
