<script lang="ts">
  import type { FieldDefinition, MetaColumn, FieldType } from "../types.ts";
  import { FIELD_TYPE_META, metaFor, newField } from "../fieldTypes.ts";
  import { FIELD_ICONS, IconDrag, IconDuplicate, IconTrash, IconPlus, IconClose } from "../icons.ts";

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

  let selected = $derived(selectedIndex !== null ? fields[selectedIndex] : null);

  function addField(type: FieldType) {
    fields = [...fields, newField(type)];
    selectedIndex = fields.length - 1;
  }

  function removeField(i: number) {
    fields = fields.filter((_, idx) => idx !== i);
    selectedIndex = null;
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
    selected.options = [...opts, { value: `opt${opts.length + 1}`, label: `Option ${opts.length + 1}` }];
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

<div class="builder">
  <!-- Palette -->
  <aside class="palette">
    <h3 class="mb-2 text-sm font-semibold text-gray-500">Ajouter un champ</h3>
    {#each FIELD_TYPE_META as m}
      {@const Icon = FIELD_ICONS[m.type]}
      <button class="palette-item" onclick={() => addField(m.type)} type="button">
        <span class="icon"><Icon size={17} /></span>{m.label}
      </button>
    {/each}

    <h3 class="mb-2 mt-6 text-sm font-semibold text-gray-500">Colonnes tableur</h3>
    <p class="mb-2 text-xs text-gray-400">Métadonnées internes ajoutées aux réponses.</p>
    {#each metaColumns as col, i}
      <div class="meta-col">
        <input class="input !py-1 text-xs" bind:value={col.label} />
        <select class="input !w-24 !py-1 text-xs" bind:value={col.kind}>
          <option value="text">Texte</option>
          <option value="number">Nombre</option>
          <option value="formula">Formule</option>
        </select>
        <button class="text-[color:var(--danger)]" onclick={() => removeMetaColumn(i)} type="button" aria-label="Retirer"><IconClose size={14} /></button>
      </div>
      {#if col.kind === "formula"}
        <input class="input mb-2 !py-1 text-xs" placeholder="=note*2 ou CONCAT(nom)" bind:value={col.formula} />
      {/if}
    {/each}
    <button class="btn-secondary mt-1 w-full text-xs" onclick={addMetaColumn} type="button">
      <IconPlus size={14} weight="bold" /> Colonne
    </button>
  </aside>

  <!-- Canevas -->
  <section class="canvas">
    <div class="card mb-4">
      <input class="mb-2 w-full border-0 text-2xl font-bold outline-none" placeholder="Titre du formulaire" bind:value={settings.title} />
      <textarea class="w-full border-0 text-sm text-gray-600 outline-none" rows="2" placeholder="Description (facultatif)" bind:value={settings.description}></textarea>
    </div>

    {#if fields.length === 0}
      <div class="empty">Cliquez sur un type de champ à gauche pour commencer.</div>
    {/if}

    {#each fields as field, i (field.key)}
      {@const FieldIcon = FIELD_ICONS[field.type]}
      <div
        class="field-card"
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
        <div class="field-head">
          <span class="drag-handle" title="Glisser pour réordonner"><IconDrag size={16} /></span>
          <span class="icon"><FieldIcon size={17} /></span>
          <span class="flex-1 font-medium">{field.label}</span>
          {#if field.required}<span class="req">requis</span>{/if}
          <button class="ghost" onclick={(e) => { e.stopPropagation(); duplicateField(i); }} type="button" title="Dupliquer"><IconDuplicate size={16} /></button>
          <button class="ghost text-[color:var(--danger)]" onclick={(e) => { e.stopPropagation(); removeField(i); }} type="button" title="Supprimer"><IconTrash size={16} /></button>
        </div>
        <div class="field-type">{metaFor(field.type).label}</div>
      </div>
    {/each}
  </section>

  <!-- Panneau de configuration -->
  <aside class="config">
    {#if selected}
      <h3 class="mb-3 text-sm font-semibold text-gray-500">Configuration du champ</h3>
      <label class="label">Libellé</label>
      <input class="input mb-3" bind:value={selected.label} />

      <label class="label">Clé (identifiant)</label>
      <input class="input mb-3 font-mono text-xs" bind:value={selected.key} />

      <label class="label">Description</label>
      <input class="input mb-3" bind:value={selected.description} />

      {#if selected.type !== "grid" && selected.type !== "file"}
        <label class="label">Placeholder</label>
        <input class="input mb-3" bind:value={selected.placeholder} />
      {/if}

      <label class="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={selected.required} /> Champ requis
      </label>

      {#if metaFor(selected.type).hasOptions}
        <div class="mb-3">
          <div class="label">Options</div>
          {#each selected.options ?? [] as opt, oi}
            <div class="opt-row">
              <input class="input !py-1 text-xs" placeholder="valeur" bind:value={opt.value} />
              <input class="input !py-1 text-xs" placeholder="libellé" bind:value={opt.label} />
              <button class="text-[color:var(--danger)]" onclick={() => removeOption(oi)} type="button" aria-label="Retirer"><IconClose size={14} /></button>
            </div>
          {/each}
          <button class="btn-secondary mt-1 w-full text-xs" onclick={addOption} type="button"><IconPlus size={14} weight="bold" /> Option</button>
        </div>
      {/if}

      {#if selected.type === "grid" && selected.grid}
        <label class="label">Lignes (une par ligne)</label>
        <textarea class="input mb-3 text-xs" rows="3" value={gridText(selected.grid.rows)} oninput={(e) => setGridRows((e.target as HTMLTextAreaElement).value)}></textarea>
        <label class="label">Colonnes (une par ligne)</label>
        <textarea class="input mb-3 text-xs" rows="3" value={gridText(selected.grid.columns)} oninput={(e) => setGridCols((e.target as HTMLTextAreaElement).value)}></textarea>
      {/if}

      {#if selected.type === "file"}
        <label class="label">Types acceptés (MIME, séparés par des virgules)</label>
        <input class="input mb-3 text-xs" placeholder="image/*, application/pdf" value={(selected.accept ?? []).join(", ")} oninput={(e) => (selected.accept = (e.target as HTMLInputElement).value.split(",").map((s) => s.trim()).filter(Boolean))} />
        <label class="label">Taille max (octets)</label>
        <input class="input mb-3 text-xs" type="number" bind:value={selected.maxSizeBytes} />
      {/if}

      {#if selected.type === "short_text" || selected.type === "paragraph"}
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
        <label class="label mt-2">Regex personnalisée</label>
        <input class="input mb-3 font-mono text-xs" placeholder="^[A-Z].*" bind:value={selected.validation!.pattern} />
      {/if}

      {#if selected.type === "number"}
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
      {/if}
    {:else}
      <h3 class="mb-3 text-sm font-semibold text-gray-500">Éthique & RGPD</h3>
      <label class="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={settings.requireConsent} /> Consentement obligatoire
      </label>
      {#if settings.requireConsent}
        <label class="label">Texte de consentement</label>
        <textarea class="input mb-3 text-xs" rows="3" bind:value={settings.consentText}></textarea>
      {/if}
      <label class="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={settings.isAnonymized} /> Anonymisation complète (aucune IP)
      </label>
      <label class="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={settings.encryptResponses} /> Chiffrer les réponses au repos
      </label>
      <p class="text-xs text-gray-400">Sélectionnez un champ pour le configurer.</p>
    {/if}
  </aside>
</div>

<style lang="scss">
  @use "../scss/main" as m;

  .builder {
    display: grid;
    grid-template-columns: 220px 1fr 300px;
    gap: 1rem;
    align-items: start;
  }
  .palette,
  .config {
    position: sticky;
    top: 1rem;
    background: white;
    border: 1px solid m.$gray-border;
    border-radius: m.$radius;
    padding: 1rem;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    @include m.subtle-scroll;
  }
  .palette-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.6rem;
    margin-bottom: 0.35rem;
    border: 1px solid m.$gray-border;
    border-radius: 0.4rem;
    font-size: 0.85rem;
    text-align: left;
    background: m.$gray-bg;
    cursor: pointer;
    transition: all 0.15s;
    &:hover {
      border-color: m.$brand;
      background: white;
    }
    .icon {
      font-size: 1rem;
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
  .empty {
    padding: 3rem;
    text-align: center;
    color: #9ca3af;
    border: 2px dashed m.$gray-border;
    border-radius: m.$radius;
  }
  .field-card {
    background: white;
    border: 1px solid m.$gray-border;
    border-left: 3px solid transparent;
    border-radius: m.$radius;
    padding: 0.75rem 1rem;
    margin-bottom: 0.6rem;
    cursor: pointer;
    transition: all 0.15s;
    &:hover {
      box-shadow: var(--shadow-sm);
    }
    &.selected {
      border-left-color: m.$brand;
      box-shadow: var(--shadow);
    }
  }
  .field-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .drag-handle {
    cursor: grab;
    color: #9ca3af;
  }
  .field-type {
    margin-left: 1.6rem;
    font-size: 0.75rem;
    color: #9ca3af;
  }
  .req {
    font-size: 0.65rem;
    color: white;
    background: m.$brand;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
  }
  .ghost {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.7;
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
</style>
