<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import FieldInput from "$components/FieldInput.svelte";
  import { api, type SignedFileDescriptor } from "$api/client.ts";
  import type { FormDetail, FieldDefinition } from "$lib/types.ts";
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

  // Multi-pages / Sections
  interface Page {
    title: string;
    description: string;
    fields: FieldDefinition[];
    isFirst: boolean;
    isLast: boolean;
  }

  let currentPageIndex = $state(0);

  let pages = $derived.by<Page[]>(() => {
    if (!form) return [];
    const list: Page[] = [];
    let currentFields: FieldDefinition[] = [];
    let currentTitle = form.title;
    let currentDescription = form.description ?? "";

    for (const field of form.schema) {
      if (field.type === "section") {
        list.push({
          title: currentTitle,
          description: currentDescription,
          fields: currentFields,
          isFirst: list.length === 0,
          isLast: false,
        });
        currentFields = [];
        currentTitle = field.label;
        currentDescription = field.description ?? "";
      } else {
        currentFields.push(field);
      }
    }

    list.push({
      title: currentTitle,
      description: currentDescription,
      fields: currentFields,
      isFirst: list.length === 0,
      isLast: true,
    });

    for (let i = 0; i < list.length; i++) {
      list[i].isFirst = i === 0;
      list[i].isLast = i === list.length - 1;
    }

    return list;
  });

  let currentPage = $derived(pages[currentPageIndex] ?? null);

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

  function validatePage(page: Page): boolean {
    const errs = { ...fieldErrors };
    for (const f of page.fields) {
      delete errs[f.key];
    }
    for (const f of page.fields) {
      const v = values[f.key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) {
        errs[f.key] = "Ce champ est requis.";
      }
    }
    fieldErrors = errs;
    return page.fields.every((f) => !errs[f.key]);
  }

  function nextPage() {
    if (!currentPage) return;
    if (validatePage(currentPage)) {
      currentPageIndex += 1;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function prevPage() {
    if (currentPageIndex > 0) {
      currentPageIndex -= 1;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function validateAll(): boolean {
    if (!form) return false;
    const errs: Record<string, string> = {};
    for (const f of form.schema) {
      if (f.type === "section") continue;
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
    if (!validateAll()) {
      for (let i = 0; i < pages.length; i++) {
        const hasError = pages[i].fields.some((f) => fieldErrors[f.key]);
        if (hasError) {
          currentPageIndex = i;
          break;
        }
      }
      return;
    }
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
        for (let i = 0; i < pages.length; i++) {
          const hasError = pages[i].fields.some((f) => fieldErrors[f.key]);
          if (hasError) {
            currentPageIndex = i;
            break;
          }
        }
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
        <div class="mx-auto mb-3 text-brand-500 flex justify-center"><IconCheckCircle size={52} weight="fill" /></div>
        <h1 class="mb-2 text-2xl font-bold">Merci !</h1>
        <p class="text-[color:var(--muted)]">Votre réponse a bien été enregistrée.</p>
      </div>
    {:else if form && currentPage}
      <div class="gform-card mb-5">
        <div class="w-full h-24 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 relative overflow-hidden flex items-end p-4 rounded-t-2xl">
          <div class="absolute inset-0 bg-black/5"></div>
          <div class="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 blur-xl"></div>
          <div class="absolute -left-12 -bottom-12 w-28 h-28 rounded-full bg-white/10 blur-lg"></div>
        </div>
        <div class="p-6 md:p-8">
          <h1 class="text-3xl font-bold tracking-tight text-[color:var(--ink)]">{currentPage.title}</h1>
          {#if currentPage.description}<p class="mt-3 text-sm text-[color:var(--muted)] leading-relaxed whitespace-pre-line">{currentPage.description}</p>{/if}
          {#if currentPage.isFirst && form.isAnonymized}
            <p class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <IconLock size={14} /> Réponses anonymes — aucune donnée d'identification n'est collectée.
            </p>
          {/if}
        </div>
      </div>

      <form onsubmit={submit}>
        {#if pages.length > 1}
          <div class="mb-5 bg-white rounded-xl border border-[color:var(--line)] p-4 shadow-sm">
            <div class="flex justify-between items-center text-xs font-semibold text-[color:var(--muted)] mb-2">
              <span>Progression</span>
              <span>Page {currentPageIndex + 1} sur {pages.length}</span>
            </div>
            <div class="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                class="h-full bg-brand-500 rounded-full transition-all duration-300"
                style="width: {((currentPageIndex + 1) / pages.length) * 100}%"
              ></div>
            </div>
          </div>
        {/if}

        {#each currentPage.fields as field (field.key)}
          <div class="mb-4 rounded-xl border border-[color:var(--line)] bg-white p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
            <FieldInput
              {field}
              formId={form.id}
              bind:value={values[field.key]}
              error={fieldErrors[field.key]}
              onFiles={(refs) => (files[field.key] = refs)}
            />
          </div>
        {/each}

        {#if currentPage.isLast && form.requireConsent}
          <label class="mb-5 flex items-start gap-3 rounded-xl border border-[color:var(--line)] bg-white p-6 text-sm shadow-sm hover:shadow-md cursor-pointer transition-shadow duration-200">
            <input type="checkbox" bind:checked={consent} class="mt-1 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer" />
            <span class="text-[color:var(--ink)] font-medium leading-tight">{form.consentText || "J'accepte que mes réponses soient traitées conformément au RGPD."}</span>
          </label>
        {/if}

        {#if submitError}
          <p class="mb-4 text-sm font-semibold text-[color:var(--danger)]">{submitError}</p>
        {/if}

        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
          <div class="flex items-center gap-3 w-full sm:w-auto">
            {#if !currentPage.isFirst}
              <button class="btn-secondary w-full sm:w-auto" type="button" onclick={prevPage}>
                Précédent
              </button>
            {/if}
            {#if !currentPage.isLast}
              <button class="btn-primary w-full sm:w-auto" type="button" onclick={nextPage}>
                Suivant
              </button>
            {:else}
              <button class="btn-primary w-full sm:w-auto" type="submit" disabled={submitting}>
                {submitting ? "Envoi…" : "Envoyer"}
              </button>
            {/if}
          </div>
          <span class="flex items-center gap-1.5 text-xs font-medium text-[color:var(--muted)]">
            <IconShield size={15} /> Sans tracker · Auto-hébergé · Open-source
          </span>
        </div>
      </form>
    {/if}
  </main>
</div>
