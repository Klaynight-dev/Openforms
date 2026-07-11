<script lang="ts">
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import FieldInput from "$components/FieldInput.svelte";
  import { api, type SignedFileDescriptor } from "$api/client.ts";
  import { JUSTIFICATION_SUFFIX, type FormDetail, type FieldDefinition } from "$lib/types.ts";
  import { IconCheckCircle, IconLock, IconShield, IconEye, IconBack } from "$lib/icons.ts";
  import { goto } from "$app/navigation";

  const id = $page.params.id as string;
  let form = $state<FormDetail | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let values = $state<Record<string, unknown>>({});
  let files = $state<Record<string, { file: SignedFileDescriptor; signature: string }[]>>({});
  let consent = $state(false);
  let fieldErrors = $state<Record<string, string>>({});
  let submitting = $state(false);
  let submitted = $state(false);

  // Multi-pages / Sections
  interface Page {
    title: string;
    description: string;
    fields: FieldDefinition[];
    isFirst: boolean;
    isLast: boolean;
  }

  let currentPageIndex = $state(0);
  let currentLocale = $state("fr");

  let locales = $derived.by<string[]>(() => {
    if (!form || !form.translations) return ["fr"];
    const keys = Object.keys(form.translations).filter(k => form!.translations[k]?.title);
    return ["fr", ...keys];
  });

  let translatedForm = $derived.by<FormDetail | null>(() => {
    if (!form) return null;
    if (currentLocale === "fr") return form;
    const trans = form.translations?.[currentLocale];
    if (!trans) return form;

    const schema = (form.schema ?? []).map((f) => {
      const fTrans = trans.fields?.[f.key];
      return {
        ...f,
        label: fTrans?.label || f.label,
        description: fTrans?.description || f.description,
        placeholder: fTrans?.placeholder || f.placeholder,
      };
    });

    return {
      ...form,
      title: trans.title || form.title,
      description: trans.description || form.description,
      schema,
    };
  });

  function isConditionMet(cond: { fieldKey: string; value: string } | undefined): boolean {
    if (!cond) return true;
    const val = values[cond.fieldKey];
    if (val == null) return false;
    if (Array.isArray(val)) {
      return val.map(String).includes(cond.value);
    }
    return String(val) === cond.value;
  }

  let visibleFieldKeys = $derived.by<Set<string>>(() => {
    if (!translatedForm) return new Set();
    const visible = new Set<string>();
    let currentSectionKey: string | null = null;

    for (const f of translatedForm.schema) {
      let parentSectionVisible = true;
      if (f.type !== "section" && currentSectionKey !== null) {
        parentSectionVisible = visible.has(currentSectionKey);
      }

      let fieldVisible = parentSectionVisible;
      if (fieldVisible && f.condition) {
        fieldVisible = isConditionMet(f.condition);
      }

      if (f.type === "section") {
        currentSectionKey = f.key;
        if (fieldVisible) {
          visible.add(f.key);
        }
        continue;
      }

      if (fieldVisible) {
        visible.add(f.key);
      }
    }
    return visible;
  });

  let pages = $derived.by<Page[]>(() => {
    if (!translatedForm) return [];
    const list: Page[] = [];
    let currentFields: FieldDefinition[] = [];
    let currentTitle = translatedForm.title;
    let currentDescription = translatedForm.description ?? "";

    for (const field of translatedForm.schema) {
      if (field.type === "section") {
        if (visibleFieldKeys.has(field.key)) {
          list.push({
            title: currentTitle,
            description: currentDescription,
            fields: currentFields,
            isFirst: false,
            isLast: false,
          });
          currentFields = [];
          currentTitle = field.label;
          currentDescription = field.description ?? "";
        }
      } else {
        if (visibleFieldKeys.has(field.key)) {
          currentFields.push(field);
        }
      }
    }

    list.push({
      title: currentTitle,
      description: currentDescription,
      fields: currentFields,
      isFirst: false,
      isLast: false,
    });

    const filteredList = list.filter((p, idx) => idx === 0 || p.fields.length > 0);

    for (let i = 0; i < filteredList.length; i++) {
      filteredList[i].isFirst = i === 0;
      filteredList[i].isLast = i === filteredList.length - 1;
    }

    return filteredList;
  });

  $effect(() => {
    if (pages.length > 0 && currentPageIndex >= pages.length) {
      currentPageIndex = pages.length - 1;
    }
  });

  let currentPage = $derived(pages[currentPageIndex] ?? null);

  onMount(async () => {
    try {
      const res = await api.getForm(id);
      form = res.form;
    } catch (e: any) {
      loadError = e.message || "Impossible de charger le formulaire.";
    } finally {
      loading = false;
    }
  });

  function validatePage(p: Page): boolean {
    const errs = { ...fieldErrors };
    for (const f of p.fields) {
      delete errs[f.key];
    }
    for (const f of p.fields) {
      const v = values[f.key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) {
        errs[f.key] = "Ce champ est requis.";
      }
    }
    fieldErrors = errs;
    return p.fields.every((f) => !errs[f.key]);
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
    if (!translatedForm) return false;
    const errs: Record<string, string> = {};
    for (const f of translatedForm.schema) {
      if (f.type === "section") continue;
      if (!visibleFieldKeys.has(f.key)) continue;
      const v = values[f.key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) errs[f.key] = "Ce champ est requis.";
    }
    fieldErrors = errs;
    return Object.keys(errs).length === 0;
  }

  function simulateSubmit(e: Event) {
    e.preventDefault();
    if (form?.requireConsent && !consent) {
      alert("Vous devez accepter le consentement pour soumettre.");
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
    setTimeout(() => {
      submitting = false;
      submitted = true;
    }, 1000);
  }

  function resetSimulation() {
    submitted = false;
    values = {};
    files = {};
    consent = false;
    fieldErrors = {};
    currentPageIndex = 0;
  }
</script>

<svelte:head>
  <title>[Aperçu] {translatedForm?.title ?? "Formulaire"}</title>
</svelte:head>

<div class="fixed top-0 left-0 right-0 z-50 bg-gray-900 text-white text-xs font-bold py-2.5 px-4 shadow-md flex items-center justify-between">
  <div class="flex items-center gap-2">
    <IconEye size={16} />
    <span>Mode Prévisualisation — Les réponses saisies ici ne seront pas enregistrées dans la base de données.</span>
  </div>
  <button 
    onclick={() => window.close()} 
    class="bg-black/20 hover:bg-black/40 text-white rounded px-2.5 py-1 transition font-bold"
  >
    Fermer l'aperçu
  </button>
</div>

<div class="min-h-screen bg-[color:var(--surface-bg)] pt-16 pb-12">
  <main class="mx-auto max-w-2xl px-4">
    {#if loading}
      <div class="gform-card has-banner mb-5 animate-pulse">
        <div class="w-full h-24 bg-slate-200 rounded-t-2xl"></div>
        <div class="p-6 md:p-8">
          <div class="h-8 bg-slate-200 rounded-md w-3/4 mb-4"></div>
          <div class="h-4 bg-slate-200 rounded-md w-full mb-2"></div>
          <div class="h-4 bg-slate-200 rounded-md w-5/6"></div>
        </div>
      </div>

      <div class="space-y-4">
        {#each [1, 2, 3] as _}
          <div class="rounded-xl border border-[color:var(--line)] bg-white p-6 shadow-sm animate-pulse">
            <div class="h-4 bg-slate-200 rounded-md w-1/3 mb-3"></div>
            <div class="h-10 bg-slate-100 rounded-xl w-full"></div>
          </div>
        {/each}
      </div>

      <div class="flex justify-between items-center mt-6 animate-pulse">
        <div class="h-10 bg-slate-200 rounded-xl w-28"></div>
        <div class="h-4 bg-slate-200 rounded-md w-40"></div>
      </div>
    {:else if loadError}
      <div class="gform-card p-8 text-center text-[color:var(--danger)]">
        <p class="font-bold mb-4">{loadError}</p>
        <button class="btn-primary" onclick={() => goto(`/admin/forms/${id}`)}>Retour à l'éditeur</button>
      </div>
    {:else if submitted}
      <div class="gform-card p-10 text-center animate-fade-in">
        <div class="mx-auto mb-3 text-brand-500 flex justify-center"><IconCheckCircle size={52} weight="fill" /></div>
        <h1 class="mb-2 text-2xl font-bold">Simulation réussie !</h1>
        <p class="text-[color:var(--muted)] mb-6">Votre réponse simulée a bien été traitée et validée (hors base de données).</p>
        <div class="flex justify-center gap-3">
          <button class="btn-secondary text-xs" onclick={resetSimulation}>Recommencer la saisie</button>
          <button class="btn-primary text-xs" onclick={() => window.close()}>Fermer l'aperçu</button>
        </div>
      </div>
    {:else if translatedForm && currentPage}
      <div class="gform-card has-banner mb-5">
        <div class="w-full h-24 bg-gradient-to-r from-violet-600 via-indigo-600 to-purple-600 relative overflow-hidden flex items-end justify-between p-4 rounded-t-2xl">
          <div class="absolute inset-0 bg-black/5"></div>
          <div class="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 blur-xl"></div>
          <div class="absolute -left-12 -bottom-12 w-28 h-28 rounded-full bg-white/10 blur-lg"></div>

          <!-- Language Switcher -->
          {#if locales.length > 1}
            <div class="absolute top-4 right-4 z-10 flex gap-1 bg-black/25 backdrop-blur-md p-1 rounded-lg border border-white/10">
              {#each locales as locale}
                <button
                  type="button"
                  class="px-2.5 py-1 text-[10px] font-extrabold rounded-md uppercase tracking-wider transition-all cursor-pointer select-none {currentLocale === locale ? 'bg-white text-slate-900' : 'text-white hover:bg-white/10'}"
                  onclick={() => currentLocale = locale}
                >
                  {locale}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="p-6 md:p-8">
          <h1 class="text-3xl font-bold tracking-tight text-[color:var(--ink)]">{currentPage.title}</h1>
          {#if currentPage.description}<p class="mt-3 text-sm text-[color:var(--muted)] leading-relaxed whitespace-pre-line">{currentPage.description}</p>{/if}
          {#if currentPage.isFirst && translatedForm.isAnonymized}
            <p class="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <IconLock size={14} /> Réponses anonymes — aucune donnée d'identification n'est collectée.
            </p>
          {/if}
        </div>
      </div>

      <form onsubmit={simulateSubmit}>
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
              formId={translatedForm.id}
              bind:value={values[field.key]}
              bind:justification={values[`${field.key}${JUSTIFICATION_SUFFIX}`]}
              error={fieldErrors[field.key]}
              onFiles={(refs) => (files[field.key] = refs)}
            />
          </div>
        {/each}

        {#if currentPage.isLast && translatedForm.requireConsent}
          <label class="mb-5 flex items-start gap-3 rounded-xl border border-[color:var(--line)] bg-white p-6 text-sm shadow-sm hover:shadow-md cursor-pointer transition-shadow duration-200">
            <input type="checkbox" bind:checked={consent} class="mt-1 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer" />
            <span class="text-[color:var(--ink)] font-medium leading-tight">{translatedForm.consentText || "J'accepte que mes réponses soient traitées conformément au RGPD."}</span>
          </label>
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
                {submitting ? "Validation..." : "Envoyer (Simulation)"}
              </button>
            {/if}
          </div>
          <span class="flex items-center gap-1.5 text-xs font-medium text-[color:var(--muted)]">
            <IconShield size={15} /> Aperçu
          </span>
        </div>
      </form>
    {/if}
  </main>
</div>
