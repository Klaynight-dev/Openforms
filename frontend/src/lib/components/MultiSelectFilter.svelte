<script lang="ts">
  import { IconFunnel, IconCaretDown } from "../icons.ts";

  let {
    options = [] as { value: string; label: string }[],
    selected = $bindable([] as string[]),
    label = "Filtrer",
  }: {
    options?: { value: string; label: string }[];
    selected?: string[];
    label?: string;
  } = $props();

  let open = $state(false);
  let search = $state("");

  let filteredOptions = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  });

  function togglePanel() {
    open = !open;
    if (open) search = "";
  }

  function toggleValue(value: string) {
    selected = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
  }

  function selectAll() {
    selected = options.map((o) => o.value);
  }

  function clearAll() {
    selected = [];
  }

  function focusSearch(node: HTMLInputElement) {
    node.focus();
  }
</script>

<div class="msf">
  <button type="button" class="msf-btn" class:active={selected.length > 0} onclick={togglePanel}>
    <IconFunnel size={12} />
    <span>{selected.length > 0 ? `${label} (${selected.length})` : label}</span>
    <IconCaretDown size={10} />
  </button>

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="msf-overlay" onclick={() => (open = false)}></div>
    <div class="msf-pop">
      <input class="msf-search" placeholder="Rechercher..." bind:value={search} use:focusSearch />
      <div class="msf-actions">
        <button type="button" onclick={selectAll}>Tout sélectionner</button>
        <button type="button" onclick={clearAll}>Aucun</button>
      </div>
      <div class="msf-list">
        {#each filteredOptions as opt (opt.value)}
          <label class="msf-item">
            <input type="checkbox" checked={selected.includes(opt.value)} onchange={() => toggleValue(opt.value)} />
            <span>{opt.label}</span>
          </label>
        {/each}
        {#if filteredOptions.length === 0}
          <div class="msf-empty">Aucun résultat</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style lang="scss">
  @use "../scss/main" as m;

  .msf {
    position: relative;
    display: inline-block;
  }
  .msf-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.3rem 0.55rem;
    border: 1px solid m.$gray-border;
    border-radius: 0.5rem;
    background: white;
    color: #475569;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
    &:hover {
      border-color: m.$brand;
      color: m.$brand-dark;
    }
    &.active {
      background: color-mix(in srgb, m.$brand 12%, white);
      border-color: m.$brand;
      color: m.$brand-dark;
    }
  }
  .msf-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
  }
  .msf-pop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 40;
    width: 220px;
    background: white;
    border: 1px solid m.$gray-border;
    border-radius: 0.6rem;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .msf-search {
    border: 1px solid m.$gray-border;
    border-radius: 0.4rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.75rem;
    width: 100%;
    box-sizing: border-box;
    &:focus {
      @include m.focus-ring;
    }
  }
  .msf-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.4rem;
    button {
      background: none;
      border: none;
      color: m.$brand-dark;
      font-size: 0.68rem;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
      &:hover {
        text-decoration: underline;
      }
    }
  }
  .msf-list {
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    @include m.subtle-scroll;
  }
  .msf-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    padding: 0.25rem 0.2rem;
    border-radius: 0.3rem;
    cursor: pointer;
    color: #334155;
    &:hover {
      background: #f8fafc;
    }
    input {
      accent-color: m.$brand;
    }
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  .msf-empty {
    font-size: 0.72rem;
    color: #94a3b8;
    text-align: center;
    padding: 0.5rem 0;
    font-style: italic;
  }
</style>
