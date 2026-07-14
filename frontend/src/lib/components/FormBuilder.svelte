<script lang="ts">
  import type { FieldDefinition, MetaColumn, FieldType } from "../types.ts";
  import { FIELD_TYPE_META, metaFor, newField } from "../fieldTypes.ts";
  import { 
    FIELD_ICONS, 
    IconDrag, 
    IconDuplicate, 
    IconTrash, 
    IconPlus, 
    IconClose, 
    IconCanvas, 
    IconSettings, 
    IconSparkle,
    IconSection,
    IconSave,
    IconCheck
  } from "../icons.ts";

  interface Settings {
    title: string;
    description: string;
    requireConsent: boolean;
    consentText: string;
    isAnonymized: boolean;
    encryptResponses: boolean;
    visibility: string;
    allowedEmails: string[];
    translations?: any;
  }

  let {
    fields = $bindable([] as FieldDefinition[]),
    metaColumns = $bindable([] as MetaColumn[]),
    settings = $bindable({
      title: "",
      description: "",
      requireConsent: true,
      consentText: "",
      isAnonymized: false,
      encryptResponses: false,
      visibility: "PUBLIC",
      allowedEmails: [] as string[],
    } as Settings),
  } = $props();

  let selectedIndex = $state<number | null>(null);
  let dragIndex = $state<number | null>(null);
  let dragOverIndex = $state<number | null>(null);
  let dragOverPosition = $state<"top" | "bottom" | null>(null);
  let editingLocale = $state("fr");

  let targetDZ = $derived.by(() => {
    if (dragOverIndex === null || dragOverPosition === null) return null;
    return dragOverPosition === "top" ? dragOverIndex : dragOverIndex + 1;
  });

  let isValidDrop = $derived(
    dragIndex !== null &&
    targetDZ !== null &&
    targetDZ !== dragIndex &&
    targetDZ !== dragIndex + 1
  );

  $effect(() => {
    if (editingLocale !== "fr") {
      settings.translations ??= {};
      settings.translations[editingLocale] ??= { title: "", description: "", fields: {} };
      for (const field of fields) {
        settings.translations[editingLocale].fields ??= {};
        settings.translations[editingLocale].fields[field.key] ??= {
          label: "",
          description: "",
          placeholder: "",
        };
      }
    }
  });

  let precedingChoiceFields = $derived(
    selectedIndex !== null
      ? fields.slice(0, selectedIndex).filter((f) => ["radio", "select", "checkbox"].includes(f.type))
      : []
  );

  function addField(type: FieldType) {
    fields = [...fields, newField(type)];
    selectedIndex = fields.length - 1;
    // Scroll active card into view
    setTimeout(() => {
      const activeEl = document.querySelector(".card-active");
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
  }

  function removeField(i: number) {
    fields = fields.filter((_, idx) => idx !== i);
    selectedIndex = null;
  }

  function duplicateField(i: number) {
    const copy = { 
      ...structuredClone($state.snapshot(fields[i])), 
      key: `champ_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}` 
    };
    fields = [...fields.slice(0, i + 1), copy, ...fields.slice(i + 1)];
    selectedIndex = i + 1;
  }

  // --- Drag & drop for reordering ---
  function onDragStart(i: number) {
    dragIndex = i;
  }

  function onDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex === null) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const position = relativeY < rect.height / 2 ? "top" : "bottom";
    if (dragOverIndex !== i || dragOverPosition !== position) {
      dragOverIndex = i;
      dragOverPosition = position;
    }
  }

  function onDragLeave() {
    dragOverIndex = null;
    dragOverPosition = null;
  }

  function onDragEnd() {
    dragIndex = null;
    dragOverIndex = null;
    dragOverPosition = null;
  }

  function onDropCard(e: DragEvent, i: number) {
    e.preventDefault();
    if (dragIndex === null || targetDZ === null || !isValidDrop) {
      onDragEnd();
      return;
    }
    const next = [...fields];
    const [moved] = next.splice(dragIndex, 1);
    let insertIndex = targetDZ;
    if (dragIndex < targetDZ) {
      insertIndex = targetDZ - 1;
    }
    next.splice(insertIndex, 0, moved);
    fields = next;
    selectedIndex = insertIndex;
    onDragEnd();
  }

  // --- Options editing ---
  function addOption(field: FieldDefinition) {
    const opts = field.options ?? [];
    const name = `Option ${opts.length + 1}`;
    field.options = [...opts, { value: name, label: name }];
  }
  
  function removeOption(field: FieldDefinition, idx: number) {
    if (!field.options) return;
    field.options = field.options.filter((_, i) => i !== idx);
  }

  // Helpers grid
  function gridText(arr: string[] | undefined): string {
    return (arr ?? []).join("\n");
  }
  function setGridRows(field: FieldDefinition, text: string) {
    field.grid = { rows: text.split("\n").filter(Boolean), columns: field.grid?.columns ?? [] };
  }
  function setGridCols(field: FieldDefinition, text: string) {
    field.grid = { rows: field.grid?.rows ?? [], columns: text.split("\n").filter(Boolean) };
  }
</script>

<div class="flex flex-col md:flex-row gap-6 items-start max-w-3xl mx-auto px-4 md:px-0 pb-24 relative">
  <!-- Main canvas column -->
  <div class="flex-1 w-full space-y-5">
    
    <!-- Translation language and Form Title card -->
    <div class="bg-white rounded-2xl border border-[color:var(--line)] border-t-[10px] border-t-[color:var(--brand)] shadow-sm overflow-hidden p-6 relative">
      <!-- Lang selector top right -->
      <div class="flex items-center gap-2 justify-end mb-4 border-b border-slate-100 pb-3">
        <span class="text-xs font-semibold text-[color:var(--muted)]">Langue de saisie :</span>
        <select class="input !w-32 !py-1 text-xs" bind:value={editingLocale}>
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>

      {#if editingLocale === "fr"}
        <input 
          class="w-full border-0 text-2xl font-bold outline-none text-[color:var(--ink)] placeholder-slate-400 focus:ring-0 mb-3 border-b border-transparent focus:border-slate-100 focus:pb-1 transition-all" 
          placeholder="Titre du formulaire" 
          bind:value={settings.title} 
        />
        <textarea 
          class="w-full border-0 text-sm text-[color:var(--muted)] outline-none resize-none placeholder-slate-400 focus:ring-0 border-b border-transparent focus:border-slate-100 transition-all" 
          rows="2" 
          placeholder="Description du formulaire (facultatif)" 
          bind:value={settings.description}
        ></textarea>
      {:else}
        <input 
          class="w-full border-0 text-2xl font-bold outline-none text-[color:var(--brand)] placeholder-slate-400 focus:ring-0 mb-3" 
          placeholder={`Titre en ${editingLocale.toUpperCase()} (Traduction)`} 
          bind:value={settings.translations[editingLocale].title} 
        />
        <textarea 
          class="w-full border-0 text-sm text-brand-600 outline-none resize-none placeholder-slate-400 focus:ring-0" 
          rows="2" 
          placeholder={`Description en ${editingLocale.toUpperCase()} (Traduction)`} 
          bind:value={settings.translations[editingLocale].description}
        ></textarea>
      {/if}
    </div>

    <!-- Empty indicator -->
    {#if fields.length === 0}
      <div class="empty flex flex-col items-center justify-center p-12 text-slate-400 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
        <span class="mb-2 text-slate-300"><IconSparkle size={32} /></span>
        <p class="text-sm font-semibold mb-1">Votre formulaire est vide</p>
        <p class="text-xs text-slate-400">Cliquez sur le bouton + à droite pour ajouter votre première question.</p>
      </div>
    {/if}

    <!-- Fields container list -->
    {#each fields as field, i (field.key)}
      {@const FieldIcon = FIELD_ICONS[field.type]}
      {@const isActive = selectedIndex === i}

      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="bg-white rounded-xl border border-[color:var(--line)] shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden relative flex flex-col"
        class:border-l-[6px]={isActive}
        class:border-l-[color:var(--brand)]={isActive}
        class:card-active={isActive}
        draggable="true"
        ondragstart={() => onDragStart(i)}
        ondragover={(e) => onDragOver(e, i)}
        ondragleave={onDragLeave}
        ondragend={onDragEnd}
        ondrop={(e) => onDropCard(e, i)}
        onclick={() => (selectedIndex = i)}
        onkeydown={(e) => e.key === "Enter" && (selectedIndex = i)}
        role="button"
        tabindex="0"
      >
        <!-- Drag indicator line -->
        {#if dragIndex !== null && dragOverIndex === i && isValidDrop}
          <div 
            class="absolute left-0 right-0 h-1 bg-brand-500 z-50 pointer-events-none transition-all duration-150 animate-drop-line {dragOverPosition === 'top' ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2'}"
          >
            <!-- Left circle node -->
            <div class="absolute -left-1.5 -top-1.5 w-4 h-4 rounded-full bg-brand-500 border-[3px] border-white shadow-md"></div>
            <!-- Right circle node -->
            <div class="absolute -right-1.5 -top-1.5 w-4 h-4 rounded-full bg-brand-500 border-[3px] border-white shadow-md"></div>
          </div>
        {/if}

        <!-- Drag handle -->
        <div class="flex justify-center py-1.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 transition">
          <IconDrag size={16} />
        </div>

        <!-- Card content -->
        <div class="p-6 pt-1 space-y-4">
          {#if isActive}
            <!-- ACTIVE CARD: EDITABLE -->
            <div class="flex flex-col sm:flex-row gap-4 items-start">
              <!-- Label Input -->
              <div class="flex-1 w-full">
                <label class="label text-[10px] text-slate-400 uppercase tracking-wide">Question</label>
                {#if editingLocale === "fr"}
                  <input 
                    class="input font-bold" 
                    bind:value={field.label} 
                    placeholder="Question sans titre" 
                  />
                {:else}
                  <input 
                    class="input font-bold bg-brand-50/20 text-brand-700 placeholder-brand-300" 
                    placeholder={field.label} 
                    bind:value={settings.translations[editingLocale].fields[field.key].label} 
                  />
                {/if}
              </div>

              <!-- Type Select dropdown -->
              <div class="w-full sm:w-56 shrink-0">
                <label class="label text-[10px] text-slate-400 uppercase tracking-wide">Type de réponse</label>
                <select class="input text-xs" bind:value={field.type}>
                  {#each FIELD_TYPE_META as m}
                    <option value={m.type}>{m.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <!-- Description & Placeholder -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label class="label text-[10px] text-slate-400 uppercase">Description explicative</label>
                {#if editingLocale === "fr"}
                  <input 
                    class="input text-xs" 
                    bind:value={field.description} 
                    placeholder="ex: Merci de saisir vos informations..." 
                  />
                {:else}
                  <input 
                    class="input text-xs" 
                    placeholder={field.description} 
                    bind:value={settings.translations[editingLocale].fields[field.key].description} 
                  />
                {/if}
              </div>
              
              {#if field.type !== "section" && field.type !== "grid" && field.type !== "file" && field.type !== "checkbox_grid" && field.type !== "linear_scale" && field.type !== "signature" && field.type !== "stripe_payment"}
                <div>
                  <label class="label text-[10px] text-slate-400 uppercase">Placeholder (Indication)</label>
                  {#if editingLocale === "fr"}
                    <input 
                      class="input text-xs" 
                      bind:value={field.placeholder} 
                      placeholder="ex: Entrez du texte..." 
                    />
                  {:else}
                    <input 
                      class="input text-xs" 
                      placeholder={field.placeholder} 
                      bind:value={settings.translations[editingLocale].fields[field.key].placeholder} 
                    />
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Choice Options Editor -->
            {#if metaFor(field.type).hasOptions}
              <div class="pt-4 border-t border-slate-100">
                <label class="label text-xs">Options de choix</label>
                <div class="space-y-2">
                  {#each field.options ?? [] as opt, oi}
                    <div class="flex items-center gap-2">
                      <span class="text-slate-300"><FieldIcon size={14} /></span>
                      <input 
                        class="input text-xs !py-1 flex-1" 
                        placeholder={`Option ${oi + 1}`}
                        bind:value={opt.label}
                        oninput={() => opt.value = opt.label}
                      />
                      <button 
                        type="button" 
                        class="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 shrink-0" 
                        onclick={() => removeOption(field, oi)}
                        title="Supprimer cette option"
                      >
                        <IconClose size={14} />
                      </button>
                    </div>
                  {/each}
                  
                  <div class="flex items-center gap-2 pt-2">
                    <button 
                      type="button" 
                      class="btn-secondary !py-1 px-3 text-xs"
                      onclick={() => addOption(field)}
                    >
                      <IconPlus size={12} /> Ajouter une option
                    </button>

                    {#if field.type === "radio" || field.type === "checkbox"}
                      <label class="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={field.allowOther}
                          class="rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]"
                        />
                        <span>Autoriser option « Autre »</span>
                      </label>
                    {/if}

                    <label class="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        bind:checked={field.requireJustification}
                        class="rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]"
                      />
                      <span>Demander de justifier la réponse (texte libre)</span>
                    </label>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Date / DateTime editor options -->
            {#if field.type === "date" || field.type === "datetime"}
              <div class="pt-4 border-t border-slate-100">
                <label class="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    bind:checked={field.allowAutoToday}
                    class="rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]"
                  />
                  <span>Afficher un bouton de remplissage automatique ({field.type === "date" ? "date du jour" : "date et heure actuelles"})</span>
                </label>
              </div>
            {/if}

            <!-- File Upload editor options -->
            {#if field.type === "file"}
              <div class="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="label text-xs">Types MIME acceptés (séparés par virgules)</label>
                  <input 
                    class="input text-xs" 
                    placeholder="image/*, application/pdf" 
                    value={(field.accept ?? []).join(", ")} 
                    oninput={(e) => (field.accept = (e.target as HTMLInputElement).value.split(",").map((s) => s.trim()).filter(Boolean))} 
                  />
                </div>
                <div>
                  <label class="label text-xs">Taille maximale autorisée (octets)</label>
                  <input 
                    class="input text-xs" 
                    type="number" 
                    bind:value={field.maxSizeBytes} 
                    placeholder="ex: 10485760 (10 Mo)"
                  />
                </div>
              </div>
            {/if}

            <!-- Linear Scale editor options -->
            {#if field.type === "linear_scale"}
              <div class="pt-4 border-t border-slate-100 space-y-3">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="label text-xs">Valeur de départ</label>
                    <select 
                      class="input text-xs"
                      value={field.scale?.min ?? 1}
                      onchange={(e) => { field.scale ??= { min: 1, max: 5 }; field.scale.min = parseInt((e.target as HTMLSelectElement).value) || 1; }}
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                    </select>
                  </div>
                  <div>
                    <label class="label text-xs">Valeur maximale</label>
                    <select 
                      class="input text-xs"
                      value={field.scale?.max ?? 5}
                      onchange={(e) => { field.scale ??= { min: 1, max: 5 }; field.scale.max = parseInt((e.target as HTMLSelectElement).value) || 5; }}
                    >
                      {#each Array(9) as _, idx}
                        <option value={idx + 2}>{idx + 2}</option>
                      {/each}
                    </select>
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="label text-xs">Libellé min (ex: Mauvais)</label>
                    <input 
                      class="input text-xs"
                      placeholder="Optionnel"
                      value={field.scale?.minLabel ?? ""}
                      oninput={(e) => { field.scale ??= { min: 1, max: 5 }; field.scale.minLabel = (e.target as HTMLInputElement).value; }}
                    />
                  </div>
                  <div>
                    <label class="label text-xs">Libellé max (ex: Excellent)</label>
                    <input 
                      class="input text-xs"
                      placeholder="Optionnel"
                      value={field.scale?.maxLabel ?? ""}
                      oninput={(e) => { field.scale ??= { min: 1, max: 5 }; field.scale.maxLabel = (e.target as HTMLInputElement).value; }}
                    />
                  </div>
                </div>
              </div>
            {/if}

            <!-- Grid editor options -->
            {#if (field.type === "grid" || field.type === "checkbox_grid") && field.grid}
              <div class="pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="label text-xs">Lignes (une par ligne)</label>
                  <textarea
                    class="input text-xs font-mono"
                    rows="3"
                    value={gridText(field.grid.rows)}
                    oninput={(e) => setGridRows(field, (e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </div>
                <div>
                  <label class="label text-xs">Colonnes (une par ligne)</label>
                  <textarea
                    class="input text-xs font-mono"
                    rows="3"
                    value={gridText(field.grid.columns)}
                    oninput={(e) => setGridCols(field, (e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </div>
                <div class="sm:col-span-2">
                  <label class="flex items-center gap-1.5 text-xs text-slate-500 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      bind:checked={field.requireJustification}
                      class="rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]"
                    />
                    <span>Demander de justifier la réponse (texte libre)</span>
                  </label>
                </div>
              </div>
            {/if}

            <!-- Advanced / Conditions Panel -->
            {#if field.type !== "section"}
              <div class="pt-4">
                <details class="text-xs bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <summary class="font-bold text-slate-500 cursor-pointer select-none outline-none">Paramètres avancés (Validation, Conditions, Clé)</summary>
                  
                  <div class="mt-4 space-y-4">
                    <!-- Text lengths & Number limits Validation -->
                    {#if field.type === "short_text" || field.type === "paragraph"}
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="label !text-[10px]">Longueur minimale</label>
                          <input
                            class="input text-xs"
                            type="number"
                            value={field.validation?.minLength ?? ""}
                            oninput={(e) => {
                              field.validation ??= {};
                              const val = (e.target as HTMLInputElement).value;
                              field.validation.minLength = val === "" ? undefined : Number(val);
                            }}
                          />
                        </div>
                        <div>
                          <label class="label !text-[10px]">Longueur maximale</label>
                          <input
                            class="input text-xs"
                            type="number"
                            value={field.validation?.maxLength ?? ""}
                            oninput={(e) => {
                              field.validation ??= {};
                              const val = (e.target as HTMLInputElement).value;
                              field.validation.maxLength = val === "" ? undefined : Number(val);
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <label class="label !text-[10px]">Expression régulière de validation (Regex)</label>
                        <input
                          class="input text-xs font-mono"
                          placeholder="ex: ^[A-Z].*"
                          value={field.validation?.pattern ?? ""}
                          oninput={(e) => {
                            field.validation ??= {};
                            field.validation.pattern = (e.target as HTMLInputElement).value;
                          }}
                        />
                      </div>
                    {:else if field.type === "number"}
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class="label !text-[10px]">Valeur minimale</label>
                          <input
                            class="input text-xs"
                            type="number"
                            value={field.validation?.min ?? ""}
                            oninput={(e) => {
                              field.validation ??= {};
                              const val = (e.target as HTMLInputElement).value;
                              field.validation.min = val === "" ? undefined : Number(val);
                            }}
                          />
                        </div>
                        <div>
                          <label class="label !text-[10px]">Valeur maximale</label>
                          <input
                            class="input text-xs"
                            type="number"
                            value={field.validation?.max ?? ""}
                            oninput={(e) => {
                              field.validation ??= {};
                              const val = (e.target as HTMLInputElement).value;
                              field.validation.max = val === "" ? undefined : Number(val);
                            }}
                          />
                        </div>
                      </div>
                    {/if}

                    <!-- Conditional Display Logic -->
                    {#if i > 0}
                      <div class="border-t border-slate-200 pt-3">
                        <label class="flex items-center gap-2 font-semibold cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!field.condition}
                            onchange={(e) => {
                              if ((e.target as HTMLInputElement).checked) {
                                const firstChoice = precedingChoiceFields[0];
                                field.condition = {
                                  fieldKey: firstChoice?.key ?? "",
                                  value: firstChoice?.options?.[0]?.value ?? "",
                                };
                              } else {
                                field.condition = undefined;
                              }
                              fields = [...fields];
                            }}
                            class="h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]"
                          />
                          <span>Afficher ce champ sous condition</span>
                        </label>

                        {#if field.condition}
                          {#if precedingChoiceFields.length === 0}
                            <p class="text-[10px] text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2 font-medium">
                              Vous devez avoir une question à choix unique/multiple ou déroulante placée avant cette question pour pouvoir configurer une condition.
                            </p>
                          {:else}
                            {@const trigger = precedingChoiceFields.find((f) => f.key === field.condition!.fieldKey)}
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pl-4 border-l-2 border-slate-200">
                              <div>
                                <label class="label !text-[10px]">Si la question suivante :</label>
                                <select
                                  class="input text-xs"
                                  value={field.condition.fieldKey}
                                  onchange={(e) => {
                                    const key = (e.target as HTMLSelectElement).value;
                                    const f = precedingChoiceFields.find((cf) => cf.key === key);
                                    field.condition = {
                                      fieldKey: key,
                                      value: f?.options?.[0]?.value ?? "",
                                    };
                                    fields = [...fields];
                                  }}
                                >
                                  {#each precedingChoiceFields as f}
                                    <option value={f.key}>{f.label || f.key}</option>
                                  {/each}
                                </select>
                              </div>
                              <div>
                                <label class="label !text-[10px]">Est égale à :</label>
                                <select
                                  class="input text-xs"
                                  value={field.condition.value}
                                  onchange={(e) => {
                                    if (field.condition) {
                                      field.condition.value = (e.target as HTMLSelectElement).value;
                                    }
                                    fields = [...fields];
                                  }}
                                >
                                  {#each trigger?.options ?? [] as opt}
                                    <option value={opt.value}>{opt.label}</option>
                                  {/each}
                                  {#if trigger?.allowOther}
                                    <option value="__other__">Autre...</option>
                                  {/if}
                                </select>
                              </div>
                            </div>
                          {/if}
                        {/if}
                      </div>
                    {/if}

                    <!-- Advanced Key ID -->
                    <div class="border-t border-slate-200 pt-3">
                      <label class="label !text-[10px] text-slate-500">Clé d'exportation technique (Identifiant de colonne)</label>
                      <input 
                        class="input text-xs font-mono !py-1" 
                        bind:value={field.key} 
                        placeholder="champ_ex"
                      />
                      <p class="text-[9px] text-slate-400 mt-1">Identifiant unique utilisé dans les exports Excel/CSV et dans les formules. Modifier avec précaution.</p>
                    </div>
                  </div>
                </details>
              </div>
            {/if}

            <!-- Card footer actions -->
            <div class="flex items-center justify-end gap-4 pt-4 border-t border-slate-100 text-slate-400">
              <button 
                type="button" 
                class="hover:text-[color:var(--brand)] p-1 rounded hover:bg-slate-50 transition" 
                onclick={(e) => { e.stopPropagation(); duplicateField(i); }} 
                title="Dupliquer la question"
              >
                <IconDuplicate size={18} />
              </button>
              <button 
                type="button" 
                class="hover:text-red-500 p-1 rounded hover:bg-slate-50 transition" 
                onclick={(e) => { e.stopPropagation(); removeField(i); }} 
                title="Supprimer la question"
              >
                <IconTrash size={18} />
              </button>
              <span class="w-[1px] h-6 bg-slate-200"></span>
              
              {#if field.type !== "section"}
                <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 select-none cursor-pointer">
                  <span>Obligatoire</span>
                  <input 
                    type="checkbox" 
                    bind:checked={field.required} 
                    class="h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
                  />
                </label>
              {/if}
            </div>

          {:else}
            <!-- COLLAPSED CARD: NON-ACTIVE PREVIEW -->
            <div class="flex flex-col gap-2">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-2">
                  <span class="text-[color:var(--brand)] bg-violet-50 p-1.5 rounded-lg"><FieldIcon size={15} /></span>
                  <span class="font-bold text-sm text-[color:var(--ink)]">
                    {editingLocale === "fr" ? (field.label || "Question sans titre") : (settings.translations?.[editingLocale]?.fields?.[field.key]?.label || `[Traduit] ${field.label || "Question sans titre"}`)}
                    {#if field.required && field.type !== "section"}<span class="text-red-500 ml-0.5">*</span>{/if}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 text-[10px] text-slate-400 font-semibold uppercase font-mono bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                  {metaFor(field.type).label}
                </div>
              </div>

              {#if field.description}
                <p class="text-xs text-[color:var(--muted)] pl-8">{field.description}</p>
              {/if}

              <!-- Visual indicator of input field -->
              <div class="pl-8 pt-2">
                {#if field.type === "short_text"}
                  <div class="h-8 border-b border-dashed border-slate-200 max-w-xs text-xs text-slate-300 flex items-center">Texte de réponse court</div>
                {:else if field.type === "paragraph"}
                  <div class="h-16 border border-dashed border-slate-200 rounded-lg p-2 text-xs text-slate-300">Texte de réponse long</div>
                {:else if field.type === "email"}
                  <div class="h-8 border-b border-dashed border-slate-200 max-w-xs text-xs text-slate-300 flex items-center">Ex: contact@email.com</div>
                {:else if field.type === "number"}
                  <div class="h-8 border-b border-dashed border-slate-200 max-w-xs text-xs text-slate-300 flex items-center">Saisir un nombre</div>
                {:else if field.type === "radio" || field.type === "checkbox" || field.type === "select"}
                  <div class="space-y-1.5">
                    {#each field.options ?? [] as opt}
                      <div class="flex items-center gap-2 text-xs text-slate-500">
                        <span class="text-slate-300"><FieldIcon size={12} /></span>
                        <span>{opt.label}</span>
                      </div>
                    {/each}
                    {#if field.allowOther}
                      <div class="flex items-center gap-2 text-xs text-slate-400 italic">
                        <span class="text-slate-300"><FieldIcon size={12} /></span>
                        <span>Autre...</span>
                      </div>
                    {/if}
                  </div>
                {:else if field.type === "file"}
                  <div class="inline-flex items-center gap-1.5 border border-dashed border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-400">
                    <FieldIcon size={14} /> Ajouter un fichier
                  </div>
                {:else if field.type === "linear_scale"}
                  <div class="flex items-center gap-3 text-xs text-slate-400 max-w-md">
                    <span>{field.scale?.minLabel || field.scale?.min || 1}</span>
                    <div class="flex gap-2.5">
                      {#each Array((field.scale?.max ?? 5) - (field.scale?.min ?? 1) + 1) as _}
                        <span class="w-3.5 h-3.5 rounded-full border border-slate-300 bg-slate-50"></span>
                      {/each}
                    </div>
                    <span>{field.scale?.maxLabel || field.scale?.max || 5}</span>
                  </div>
                {:else if field.type === "grid" || field.type === "checkbox_grid"}
                  <div class="text-xs text-slate-400 flex items-center gap-1.5 border border-dashed border-slate-200 rounded-lg p-2 max-w-sm">
                    <FieldIcon size={14} /> Grille matricielle ({(field.grid?.rows ?? []).length} lignes × {(field.grid?.columns ?? []).length} cols)
                  </div>
                {:else if field.type === "signature"}
                  <div class="h-12 border border-dashed border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-300 max-w-xs">
                    <FieldIcon size={14} class="mr-1.5" /> Zone de signature numérique
                  </div>
                {:else if field.type === "address"}
                  <div class="h-8 border-b border-dashed border-slate-200 max-w-xs text-xs text-slate-300 flex items-center">
                    <FieldIcon size={14} class="mr-1.5 text-slate-300" /> Saisir une adresse géographique
                  </div>
                {:else if field.type === "stripe_payment"}
                  <div class="inline-flex items-center gap-1.5 border border-slate-200 bg-slate-50 rounded-lg px-3 py-1.5 text-xs text-slate-500 font-semibold shadow-sm">
                    <FieldIcon size={14} class="text-blue-500" /> Régler avec Stripe
                  </div>
                {:else if field.type === "section"}
                  <div class="w-full bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 text-indigo-700 font-bold text-xs flex items-center gap-2">
                    <IconSection size={14} /> Délimitation de page — Saut de section
                  </div>
                {/if}
              </div>

              {#if field.condition}
                <div class="pl-8 pt-2">
                  <span class="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Affichage conditionnel actif</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- STICKY VERTICAL TOOLBAR (DESKTOP) -->
  <div class="hidden md:flex flex-col gap-2 p-2 bg-white rounded-2xl shadow-sm border border-[color:var(--line)] sticky top-24 shrink-0">
    <button 
      onclick={() => addField("short_text")} 
      class="p-3 text-slate-500 hover:text-[color:var(--brand)] hover:bg-slate-50 rounded-xl transition-all duration-200 flex items-center justify-center" 
      title="Ajouter une question"
    >
      <IconPlus size={20} />
    </button>
    <button 
      onclick={() => addField("section")} 
      class="p-3 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200 flex items-center justify-center" 
      title="Saut de page (Section)"
    >
      <IconSection size={20} />
    </button>
  </div>

  <!-- FIXED BOTTOM TOOLBAR (MOBILE) -->
  <div class="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex gap-4 p-2 bg-white rounded-full shadow-xl border border-[color:var(--line)]">
    <button 
      onclick={() => addField("short_text")} 
      class="p-3 text-slate-500 hover:text-[color:var(--brand)] hover:bg-slate-50 rounded-full transition" 
      title="Ajouter une question"
    >
      <IconPlus size={20} />
    </button>
    <button 
      onclick={() => addField("section")} 
      class="p-3 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition" 
      title="Saut de page"
    >
      <IconSection size={20} />
    </button>
  </div>
</div>

<style lang="scss">
  // We don't need complex sticky layouts anymore since tailwind does it,
  // but we can preserve standard scrolling styles.
  @use "../scss/main" as m;

  .card-active {
    box-shadow: 0 10px 25px -5px rgba(103, 58, 183, 0.08), 0 8px 16px -6px rgba(103, 58, 183, 0.08);
  }

  .animate-drop-line {
    animation: fadeIn 0.1s ease-out forwards;
    box-shadow: 0 0 10px rgba(103, 58, 183, 0.5);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
