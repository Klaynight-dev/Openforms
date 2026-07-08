<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import FieldInput from "$components/FieldInput.svelte";
  import { api, type SignedFileDescriptor } from "$api/client.ts";
  import type { FormDetail } from "$lib/types.ts";
  import { IconCheckCircle, IconLock, IconShield } from "$lib/icons.ts";

  let form = $state<FormDetail | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let values = $state<Record<string, unknown>>({});
  let files = $state<Record<string, { file: SignedFileDescriptor; signature: string }[]>>({});
  let consent = $state(false);
  let fieldErrors = $state<Record<string, string>>({});
  let submitting = $state(false);
  let submitted = $state(false);
  let submitError = $state<string | null>(null);

  onMount(async () => {
    try {
      const res = await api.getPublicForm($page.params.slug as string);
      form = res.form;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Formulaire introuvable.";
    } finally {
      loading = false;
    }
  });

  function validate(): boolean {
    if (!form) return false;
    const errs: Record<string, string> = {};
    for (const f of form.schema) {
      const v = values[f.key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) errs[f.key] = "Ce champ est requis.";
    }
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  async function submit(e: Event) {
    e.preventDefault();
    submitError = null;
    if (form?.requireConsent && !consent) {
      submitError = "Vous devez accepter le consentement pour soumettre.";
      return;
    }
    if (!validate()) return;
    submitting = true;
    try {
      const res = await api.submit({
        formId: form!.id,
        data: values,
        consent,
        files: Object.keys(files).length ? files : undefined,
      });
      if (res.success) submitted = true;
      else submitError = "La soumission a échoué.";
    } catch (err: any) {
      submitError = err?.message ?? "Erreur lors de la soumission.";
      if (Array.isArray(err?.details)) {
        const errs: Record<string, string> = {};
        for (const d of err.details) if (d.key) errs[d.key] = d.message;
        fieldErrors = errs;
      }
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head><title>{form?.title ?? "Formulaire"}</title></svelte:head>

<div class="min-h-screen bg-[color:var(--surface-bg)] py-8">
  <main class="mx-auto max-w-2xl px-4">
    {#if loading}
      <p class="text-center text-[color:var(--muted)]">Chargement…</p>
    {:else if loadError}
      <div class="gform-card p-8 text-center text-[color:var(--danger)]">{loadError}</div>
    {:else if submitted}
      <div class="gform-card p-10 text-center">
        <div class="mx-auto mb-3 text-brand-500"><IconCheckCircle size={52} weight="fill" /></div>
        <h1 class="mb-2 text-2xl font-bold">Merci !</h1>
        <p class="text-[color:var(--muted)]">Votre réponse a bien été enregistrée.</p>
      </div>
    {:else if form}
      <!-- En-tête façon Google Forms -->
      <div class="gform-card mb-4 p-6">
        <h1 class="text-3xl font-normal text-[color:var(--ink)]">{form.title}</h1>
        {#if form.description}<p class="mt-2 text-[color:var(--muted)]">{form.description}</p>{/if}
        {#if form.isAnonymized}
          <p class="mt-3 inline-flex items-center gap-1.5 rounded bg-brand-50 px-2.5 py-1 text-xs text-brand-700">
            <IconLock size={13} /> Réponses anonymes — aucune donnée d'identification n'est collectée.
          </p>
        {/if}
      </div>

      <form onsubmit={submit}>
        {#each form.schema as field (field.key)}
          <div class="mb-3 rounded-lg border border-[color:var(--line)] bg-white p-6">
            <FieldInput
              {field}
              formId={form.id}
              bind:value={values[field.key]}
              error={fieldErrors[field.key]}
              onFiles={(refs) => (files[field.key] = refs)}
            />
          </div>
        {/each}

        {#if form.requireConsent}
          <label class="mb-3 flex items-start gap-2.5 rounded-lg border border-[color:var(--line)] bg-white p-6 text-sm">
            <input type="checkbox" bind:checked={consent} class="mt-0.5" />
            <span>{form.consentText || "J'accepte que mes réponses soient traitées conformément au RGPD."}</span>
          </label>
        {/if}

        {#if submitError}
          <p class="mb-3 text-sm text-[color:var(--danger)]">{submitError}</p>
        {/if}

        <div class="flex items-center justify-between">
          <button class="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Envoi…" : "Envoyer"}
          </button>
          <span class="flex items-center gap-1.5 text-xs text-[color:var(--muted)]">
            <IconShield size={14} /> Sans tracker · Auto-hébergé · Open-source
          </span>
        </div>
      </form>
    {/if}
  </main>
</div>
