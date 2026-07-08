<script lang="ts">
  import type { FieldDefinition, MetaColumn, FieldType } from "../types.ts";
  import { FIELD_TYPE_META, metaFor, newField } from "../fieldTypes.ts";
  import { FIELD_ICONS, IconDrag, IconDuplicate, IconTrash, IconPlus, IconClose, IconCanvas, IconSettings, IconSparkle } from "../icons.ts";

  interface Settings {
    title: string;
    description: string;
    requireConsent: boolean;
    consentText: string;
    isAnonymized: boolean;
    encryptResponses: boolean;
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
    } as Settings),
  } = $props();

  let selectedIndex = $state<number | null>(null);
  let dragIndex = $state<number | null>(null);
  let activeTab = $state<"canvas" | "palette" | "config">("canvas");

  let selected = $derived(selectedIndex !== null ? fields[selectedIndex] : null);
  let precedingChoiceFields = $derived(
    selectedIndex !== null
      ? fields.slice(0, selectedIndex).filter((f) => ["radio", "select", "checkbox"].includes(f.type))
      : []
  );

  // Switch to config panel automatically when a field is selected on mobile
  $effect(() => {
    if (selectedIndex !== null) {
      activeTab = "config";
    }
  });

  $effect(() => {
    if (selected && (selected.type === "short_text" || selected.type === "paragraph" || selected.type === "number" || selected.type === "email") && !selected.validation) {
      selected.validation = {};
    }
  });

  function addField(type: FieldType) {
    fields = [...fields, newField(type)];
    selectedIndex = fields.length - 1;
  }

  // Helper to ensure palette shows canvas tab after adding
  function addFieldAndFocus(type: FieldType) {
    addField(type);
    activeTab = "canvas";
  }

  function removeField(i: number) {
    fields = fields.filter((_, idx) => idx !== i);
    selectedIndex = null;
    activeTab = "canvas";
  }

  function duplicateField(i: number) {
    const copy = { ...structuredClone($state.snapshot(fields[i])), key: `champ_${Date.now().toString(36)}` };
    fields = [...fields.slice(0, i + 1), copy, ...fields.slice(i + 1)];
  }

  // --- Drag & drop pour réordonner ---
  function onDragStart(i: number) {
    dragIndex = i;
  }
  function onDrop(target: number) {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...fields];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    fields = next;
    selectedIndex = target;
    dragIndex = null;
  }

  // --- Édition des options ---
  function addOption() {
    if (!selected) return;
    const opts = selected.options ?? [];
    const name = `Option ${opts.length + 1}`;
    selected.options = [...opts, { value: name, label: name }];
  }
  function removeOption(idx: number) {
    if (!selected?.options) return;
    selected.options = selected.options.filter((_, i) => i !== idx);
  }

  // --- Colonnes de métadonnées (tableur) ---
  function addMetaColumn() {
    metaColumns = [
      ...metaColumns,
      { key: `meta_${Date.now().toString(36)}`, label: "Nouvelle colonne", kind: "text" },
    ];
  }
  function removeMetaColumn(i: number) {
    metaColumns = metaColumns.filter((_, idx) => idx !== i);
  }

  // Helpers grille (édition via textarea multiligne)
  function gridText(arr: string[] | undefined): string {
    return (arr ?? []).join("\n");
  }
  function setGridRows(text: string) {
    if (!selected) return;
    selected.grid = { rows: text.split("\n").filter(Boolean), columns: selected.grid?.columns ?? [] };
  }
  function setGridCols(text: string) {
    if (!selected) return;
    selected.grid = { rows: selected.grid?.rows ?? [], columns: text.split("\n").filter(Boolean) };
  }
</script>

<!-- Tab Switcher visible uniquement sur mobile -->
<div class="flex md:hidden border border-[color:var(--line)] bg-white rounded-xl p-1 mb-4">
  <button 
    type="button" 
    class="flex-1 py-2 text-xs font-semibold rounded-lg transition-all" 
    class:bg-brand={activeTab === "palette"}
    class:text-white={activeTab === "palette"}
    class:text-[color:var(--muted)]={activeTab !== "palette"}
    onclick={() => activeTab = "palette"}
  >
    <span class="flex items-center gap-1 justify-center"><IconPlus size={13} /> Champ</span>
  </button>
  <button 
    type="button" 
    class="flex-1 py-2 text-xs font-semibold rounded-lg transition-all" 
    class:bg-brand={activeTab === "canvas"}
    class:text-white={activeTab === "canvas"}
    class:text-[color:var(--muted)]={activeTab !== "canvas"}
    onclick={() => activeTab = "canvas"}
  >
    <span class="flex items-center gap-1 justify-center"><IconCanvas size={13} /> Canevas</span>
  </button>
  <button 
    type="button" 
    class="flex-1 py-2 text-xs font-semibold rounded-lg transition-all" 
    class:bg-brand={activeTab === "config"}
    class:text-white={activeTab === "config"}
    class:text-[color:var(--muted)]={activeTab !== "config"}
    onclick={() => activeTab = "config"}
  >
    <span class="flex items-center gap-1 justify-center"><IconSettings size={13} /> Options</span>
  </button>
</div>

<div class="builder">
  <!-- Palette -->
  <aside class="palette" class:hidden-mobile={activeTab !== "palette"}>
    <h3 class="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Ajouter un champ</h3>
    {#each FIELD_TYPE_META as m}
      {@const Icon = FIELD_ICONS[m.type]}
      <button class="palette-item hover:scale-[1.02] transition-transform" onclick={() => addFieldAndFocus(m.type)} type="button">
        <span class="icon text-brand"><Icon size={17} /></span>{m.label}
      </button>
    {/each}

    <h3 class="mb-1 mt-6 text-xs font-bold uppercase tracking-wider text-slate-400">Colonnes tableur</h3>
    <p class="mb-3 text-[10px] text-slate-400 leading-normal">Métadonnées internes ajoutées aux réponses.</p>
    {#each metaColumns as col, i}
      <div class="meta-col">
        <input class="input !py-1 text-xs" bind:value={col.label} />
        <select class="input !w-24 !py-1 text-xs" bind:value={col.kind}>
          <option value="text">Texte</option>
          <option value="number">Nombre</option>
          <option value="formula">Formule</option>
        </select>
        <button class="text-[color:var(--danger)] hover:scale-105 transition-transform" onclick={() => removeMetaColumn(i)} type="button" aria-label="Retirer"><IconClose size={14} /></button>
      </div>
      {#if col.kind === "formula"}
        <input class="input mb-3 !py-1 text-xs font-mono text-brand-700 bg-brand-50/50" placeholder="=note*2 ou CONCAT(nom)" bind:value={col.formula} />
      {/if}
    {/each}
    <button class="btn-secondary mt-2 w-full text-xs" onclick={addMetaColumn} type="button">
      <IconPlus size={14} weight="bold" /> Colonne
    </button>
  </aside>

  <!-- Canevas -->
  <section class="canvas" class:hidden-mobile={activeTab !== "canvas"}>
    <div class="card mb-4 border-t-8 border-t-[color:var(--brand)] shadow-md">
      <input class="mb-2 w-full border-0 text-2xl font-bold outline-none text-[color:var(--ink)] placeholder-slate-400" placeholder="Titre du formulaire" bind:value={settings.title} />
      <textarea class="w-full border-0 text-sm text-[color:var(--muted)] outline-none resize-none placeholder-slate-400" rows="2" placeholder="Description (facultatif)" bind:value={settings.description}></textarea>
    </div>

    {#if fields.length === 0}
      <div class="empty flex flex-col items-center justify-center p-12 text-slate-400 rounded-2xl border-2 border-dashed border-slate-200 bg-white">
        <span class="mb-2 text-slate-300"><IconSparkle size={32} /></span>
        <p class="text-sm font-semibold mb-1">Votre formulaire est vide</p>
        <p class="text-xs text-slate-400">Cliquez sur l'onglet "+ Champ" pour ajouter votre première question.</p>
      </div>
    {/if}

    {#each fields as field, i (field.key)}
      {@const FieldIcon = FIELD_ICONS[field.type]}
      {#if field.type === "section"}
        <!-- Section divider card -->
        <div
          class="section-card group cursor-pointer transition-all duration-200"
          class:selected={selectedIndex === i}
          draggable="true"
          role="button"
          tabindex="0"
          ondragstart={() => onDragStart(i)}
          ondragover={(e) => e.preventDefault()}
          ondrop={() => onDrop(i)}
          onclick={() => (selectedIndex = i)}
          onkeydown={(e) => e.key === "Enter" && (selectedIndex = i)}
        >
          <div class="flex flex-col gap-1 w-full">
            <div class="flex items-center gap-2">
              <span class="drag-handle opacity-50 group-hover:opacity-100 transition-opacity"><IconDrag size={16} /></span>
              <FieldIcon size={16} class="text-indigo-500 shrink-0" />
              <span class="flex-1 font-bold text-sm text-indigo-700 truncate">{field.label || "Nouvelle section"}</span>
              {#if field.condition}<span class="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">Conditionnel</span>{/if}
              <button class="ghost text-slate-400 hover:text-[color:var(--danger)] shrink-0" onclick={(e) => { e.stopPropagation(); removeField(i); }} type="button" title="Supprimer"><IconTrash size={16} /></button>
            </div>
            {#if field.description}
              <div class="text-[11px] text-indigo-500/80 pl-8 mt-0.5 truncate max-w-lg">{field.description}</div>
            {/if}
          </div>
        </div>
      {:else}
        <div
          class="field-card group transition-all duration-200"
          class:selected={selectedIndex === i}
          draggable="true"
          role="button"
          tabindex="0"
          ondragstart={() => onDragStart(i)}
          ondragover={(e) => e.preventDefault()}
          ondrop={() => onDrop(i)}
          onclick={() => { selectedIndex = i; if (window.innerWidth < 768) activeTab = "config"; }}
          onkeydown={(e) => e.key === "Enter" && (selectedIndex = i)}
        >
          <div class="field-head">
            <span class="drag-handle opacity-50 group-hover:opacity-100 transition-opacity" title="Glisser pour réordonner"><IconDrag size={16} /></span>
            <span class="icon text-brand bg-brand-50 p-1.5 rounded-lg"><FieldIcon size={16} /></span>
            <span class="flex-1 font-semibold text-sm text-[color:var(--ink)]">{field.label || "Question sans titre"}</span>
            {#if field.condition}<span class="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">Conditionnel</span>{/if}
            {#if field.required}<span class="req">requis</span>{/if}
            <button class="ghost text-slate-400 hover:text-brand" onclick={(e) => { e.stopPropagation(); duplicateField(i); }} type="button" title="Dupliquer"><IconDuplicate size={16} /></button>
            <button class="ghost text-slate-400 hover:text-[color:var(--danger)]" onclick={(e) => { e.stopPropagation(); removeField(i); }} type="button" title="Supprimer"><IconTrash size={16} /></button>
          </div>
          <div class="field-type font-mono uppercase">{metaFor(field.type).label}</div>
        </div>
      {/if}
    {/each}
  </section>

  <!-- Panneau de configuration -->
  <aside class="config" class:hidden-mobile={activeTab !== "config"}>
    {#if selected}
      <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">Configuration</h3>
        <button class="text-xs text-brand font-semibold md:hidden" onclick={() => activeTab = "canvas"}>OK</button>
      </div>
      <label class="label">Libellé</label>
      <input class="input mb-3" bind:value={selected.label} />

      <label class="label">{selected.type === "section" ? "Texte / Description de la catégorie" : "Description"}</label>
      {#if selected.type === "section"}
        <textarea class="input mb-3 text-xs" rows="4" placeholder="Saisissez ici le texte explicatif de cette catégorie..." bind:value={selected.description}></textarea>
      {:else}
        <input class="input mb-3" bind:value={selected.description} />
      {/if}

      {#if selected.type !== "section" && selected.type !== "grid" && selected.type !== "file" && selected.type !== "checkbox_grid" && selected.type !== "linear_scale"}
        <label class="label">Placeholder</label>
        <input class="input mb-3" bind:value={selected.placeholder} />
      {/if}

      {#if selected.type !== "section"}
        <label class="mb-4 flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" bind:checked={selected.required} class="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand" /> Champ requis
        </label>
      {/if}

      {#if metaFor(selected.type).hasOptions}
        <div class="mb-4 pt-3 border-t border-slate-100">
          <div class="label">Options de réponse</div>
          {#each selected.options ?? [] as opt, oi}
            <div class="opt-row flex items-center gap-1.5 mb-2">
              <input
                class="input !py-1 text-xs flex-1"
                placeholder="Option"
                bind:value={opt.label}
                oninput={() => opt.value = opt.label}
              />
              <button class="text-[color:var(--danger)] hover:scale-105 transition-transform shrink-0" onclick={() => removeOption(oi)} type="button" aria-label="Retirer"><IconClose size={14} /></button>
            </div>
          {/each}
          <button class="btn-secondary mt-2 w-full text-xs" onclick={addOption} type="button"><IconPlus size={14} weight="bold" /> Option</button>
        </div>
      {/if}

      {#if selected.type === "radio" || selected.type === "select"}
        <label class="mb-4 flex items-center gap-2 text-sm font-semibold cursor-pointer border border-[color:var(--line)] rounded-lg px-3 py-2 hover:bg-slate-50 transition">
          <input type="checkbox" bind:checked={selected.allowOther} class="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand" />
          <span class="flex-1">Option « Autre » avec champ texte</span>
        </label>
      {/if}


      {#if selected.type === "file"}
        <div class="mb-4 pt-3 border-t border-slate-100">
          <label class="label">Types acceptés (MIME séparés par virgules)</label>
          <input class="input mb-3 text-xs" placeholder="image/*, application/pdf" value={(selected.accept ?? []).join(", ")} oninput={(e) => (selected.accept = (e.target as HTMLInputElement).value.split(",").map((s) => s.trim()).filter(Boolean))} />
          <label class="label">Taille max (octets)</label>
          <input class="input mb-3 text-xs" type="number" bind:value={selected.maxSizeBytes} />
        </div>
      {/if}

      {#if selected.type === "linear_scale"}
        <div class="mb-4 pt-3 border-t border-slate-100">
          <div class="label mb-2">Échelle</div>
          <div class="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label class="label">Valeur min</label>
              <input class="input text-xs" type="number" min="0" max="10"
                value={selected.scale?.min ?? 1}
                oninput={(e) => { selected.scale ??= { min: 1, max: 5 }; selected.scale.min = parseInt((e.target as HTMLInputElement).value) || 1; }} />
            </div>
            <div>
              <label class="label">Valeur max</label>
              <input class="input text-xs" type="number" min="2" max="10"
                value={selected.scale?.max ?? 5}
                oninput={(e) => { selected.scale ??= { min: 1, max: 5 }; selected.scale.max = parseInt((e.target as HTMLInputElement).value) || 5; }} />
            </div>
          </div>
          <label class="label">Libellé gauche (min)</label>
          <input class="input mb-2 text-xs" placeholder="ex : Pas du tout d'accord"
            value={selected.scale?.minLabel ?? ""}
            oninput={(e) => { selected.scale ??= { min: 1, max: 5 }; selected.scale.minLabel = (e.target as HTMLInputElement).value; }} />
          <label class="label">Libellé droite (max)</label>
          <input class="input text-xs" placeholder="ex : Tout à fait d'accord"
            value={selected.scale?.maxLabel ?? ""}
            oninput={(e) => { selected.scale ??= { min: 1, max: 5 }; selected.scale.maxLabel = (e.target as HTMLInputElement).value; }} />
        </div>
      {/if}

      {#if (selected.type === "grid" || selected.type === "checkbox_grid") && selected.grid}
        <div class="mb-4 pt-3 border-t border-slate-100">
          <label class="label">Lignes (une par ligne)</label>
          <textarea class="input mb-3 text-xs" rows="3" value={gridText(selected.grid.rows)} oninput={(e) => setGridRows((e.target as HTMLTextAreaElement).value)}></textarea>
          <label class="label">Colonnes (une par ligne)</label>
          <textarea class="input mb-3 text-xs" rows="3" value={gridText(selected.grid.columns)} oninput={(e) => setGridCols((e.target as HTMLTextAreaElement).value)}></textarea>
        </div>
      {/if}

      {#if selected.type === "short_text" || selected.type === "paragraph"}
        <div class="mb-4 pt-3 border-t border-slate-100">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Long. min</label>
              <input class="input text-xs" type="number" bind:value={selected.validation!.minLength} oninput={() => (selected.validation ??= {})} />
            </div>
            <div>
              <label class="label">Long. max</label>
              <input class="input text-xs" type="number" bind:value={selected.validation!.maxLength} />
            </div>
          </div>
          <label class="label mt-3">Regex personnalisée</label>
          <input class="input font-mono text-xs" placeholder="^[A-Z].*" bind:value={selected.validation!.pattern} />
        </div>
      {/if}

      {#if selected.type === "number"}
        <div class="mb-4 pt-3 border-t border-slate-100">
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label">Min</label>
              <input class="input text-xs" type="number" bind:value={selected.validation!.min} />
            </div>
            <div>
              <label class="label">Max</label>
              <input class="input text-xs" type="number" bind:value={selected.validation!.max} />
            </div>
          </div>
        </div>
      {/if}
      <!-- Affichage Conditionnel -->
      {#if selectedIndex > 0}
        <div class="mb-4 pt-3 border-t border-slate-100">
          <label class="mb-2 flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!selected.condition}
              onchange={(e) => {
                if ((e.target as HTMLInputElement).checked) {
                  const firstChoice = precedingChoiceFields[0];
                  selected.condition = {
                    fieldKey: firstChoice?.key ?? "",
                    value: firstChoice?.options?.[0]?.value ?? "",
                  };
                } else {
                  selected.condition = undefined;
                }
                fields = [...fields];
              }}
              class="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand"
            />
            Afficher sous condition
          </label>

          {#if selected.condition}
            {#if precedingChoiceFields.length === 0}
              <p class="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                Vous devez ajouter une question à choix (unique, multiple ou liste) avant ce champ pour créer une condition.
              </p>
            {:else}
              {@const triggerField = precedingChoiceFields.find((f) => f.key === selected.condition.fieldKey)}
              <div class="space-y-2 mt-2 pl-5 border-l-2 border-slate-100">
                <div>
                  <label class="label !text-[10px]">Si la question suivante :</label>
                  <select
                    class="input text-xs"
                    value={selected.condition.fieldKey}
                    onchange={(e) => {
                      const key = (e.target as HTMLSelectElement).value;
                      const trigger = precedingChoiceFields.find((f) => f.key === key);
                      selected.condition = {
                        fieldKey: key,
                        value: trigger?.options?.[0]?.value ?? "",
                      };
                      fields = [...fields];
                    }}
                  >
                    {#each precedingChoiceFields as f}
                      <option value={f.key}>{f.label || f.key}</option>
                    {/each}
                  </select>
                </div>

                {#if triggerField}
                  <div>
                    <label class="label !text-[10px]">Est égale à :</label>
                    <select
                      class="input text-xs"
                      bind:value={selected.condition.value}
                      onchange={() => {
                        fields = [...fields];
                      }}
                    >
                      {#each triggerField.options ?? [] as opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                      {#if triggerField.allowOther}
                        <option value="__other__">Autre…</option>
                      {/if}
                    </select>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}
        </div>
      {/if}

      {#if selected.type !== "section"}
        <details class="mt-4 pt-3 border-t border-slate-100 text-xs">
          <summary class="cursor-pointer font-bold text-slate-400 hover:text-slate-600 select-none outline-none">Paramètres avancés</summary>
          <div class="mt-3 space-y-3">
            <div>
              <label class="label">Clé (identifiant de colonne)</label>
              <input class="input font-mono text-[11px] !py-1" bind:value={selected.key} />
            </div>
          </div>
        </details>
      {/if}
    {:else}
      <h3 class="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Paramètres Généraux</h3>
      <label class="mb-3 flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
        <input type="checkbox" bind:checked={settings.requireConsent} class="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand" /> Consentement obligatoire
      </label>
      {#if settings.requireConsent}
        <label class="label">Texte de consentement</label>
        <textarea class="input mb-4 text-xs" rows="3" bind:value={settings.consentText}></textarea>
      {/if}
      <label class="mb-3 flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
        <input type="checkbox" bind:checked={settings.isAnonymized} class="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand" /> Anonymisation (aucune IP)
      </label>
      <label class="mb-4 flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
        <input type="checkbox" bind:checked={settings.encryptResponses} class="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand" /> Chiffrer au repos
      </label>
      <p class="text-[11px] text-slate-400 leading-normal bg-slate-50 p-3 rounded-lg border border-slate-100">Sélectionnez une question dans le canevas pour configurer ses options de validation spécifiques.</p>
    {/if}
  </aside>
</div>

<style lang="scss">
  @use "../scss/main" as m;

  .builder {
    display: grid;
    grid-template-columns: 240px 1fr 320px;
    gap: 1.25rem;
    align-items: start;
  }
  .palette,
  .config {
    position: sticky;
    top: 5.5rem;
    background: white;
    border: 1px solid m.$gray-border;
    border-radius: m.$radius;
    padding: 1.25rem;
    max-height: calc(100vh - 7rem);
    overflow-y: auto;
    @include m.subtle-scroll;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }
  .palette-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 0.75rem;
    margin-bottom: 0.45rem;
    border: 1px solid m.$gray-border;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    font-weight: 500;
    text-align: left;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
      border-color: m.$brand;
      box-shadow: 0 4px 6px -1px rgba(103, 58, 183, 0.08);
      background: m.$gray-bg;
    }
    .icon {
      font-size: 1rem;
      display: flex;
    }
  }
  .meta-col {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    margin-bottom: 0.35rem;
  }
  .canvas {
    min-height: 60vh;
  }
  .field-card {
    background: white;
    border: 1px solid m.$gray-border;
    border-left: 4px solid transparent;
    border-radius: m.$radius;
    padding: 1rem 1.25rem;
    margin-bottom: 0.75rem;
    cursor: pointer;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
    &:hover {
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      border-left-color: m.$brand-dark;
    }
    &.selected {
      border-left-color: m.$brand;
      box-shadow: 0 10px 15px -3px rgba(103, 58, 183, 0.08);
      background: m.$gray-bg;
    }
  }
  .section-card {
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-left: 4px solid #6366f1;
    border-radius: m.$radius;
    padding: 0.85rem 1.25rem;
    margin-top: 1.5rem;
    margin-bottom: 1.5rem;
    cursor: pointer;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    &:hover {
      border-color: #94a3b8;
      background: #f1f5f9;
    }
    &.selected {
      border-color: #6366f1;
      box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.12);
      background: #e2e8f0;
    }
  }
  .field-head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .drag-handle {
    cursor: grab;
    color: #9ca3af;
  }
  .field-type {
    margin-left: 2.25rem;
    font-size: 0.7rem;
    color: #9ca3af;
    font-weight: 600;
  }
  .req {
    font-size: 0.65rem;
    font-weight: 700;
    color: white;
    background: m.$brand;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
  }
  .ghost {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.15s;
    &:hover {
      opacity: 1;
    }
  }
  .opt-row {
    display: flex;
    gap: 0.25rem;
    align-items: center;
    margin-bottom: 0.3rem;
  }

  // Styles Responsifs pour Mobile
  @media (max-width: 768px) {
    .builder {
      grid-template-columns: 1fr !important;
      gap: 0;
    }
    .palette,
    .config {
      position: relative !important;
      top: 0 !important;
      max-height: none !important;
      overflow-y: visible !important;
      border-radius: m.$radius !important;
      margin-bottom: 1rem;
      box-shadow: none !important;
      border: 1px solid m.$gray-border;
    }
    .hidden-mobile {
      display: none !important;
    }
  }
</style>
