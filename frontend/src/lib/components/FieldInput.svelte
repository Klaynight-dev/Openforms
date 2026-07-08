<script lang="ts">
  import type { FieldDefinition } from "../types.ts";
  import { api, type SignedFileDescriptor } from "../api/client.ts";
  import { IconCheck } from "../icons.ts";

  let {
    field,
    value = $bindable(),
    error,
    formId,
    onFiles,
  }: {
    field: FieldDefinition;
    value: unknown;
    error?: string;
    formId: string;
    onFiles?: (refs: { file: SignedFileDescriptor; signature: string }[]) => void;
  } = $props();

  let uploading = $state(false);
  let uploadError = $state<string | null>(null);
  let uploadedNames = $state<string[]>([]);

  function toggleCheckbox(optValue: string, checked: boolean) {
    const arr = Array.isArray(value) ? [...(value as string[])] : [];
    if (checked) arr.push(optValue);
    else arr.splice(arr.indexOf(optValue), 1);
    value = arr;
  }

  function gridSet(rowLabel: string, colValue: string) {
    const obj = (typeof value === "object" && value ? { ...(value as Record<string, string>) } : {}) as Record<
      string,
      string
    >;
    obj[rowLabel] = colValue;
    value = obj;
  }

  async function handleFiles(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    uploading = true;
    uploadError = null;
    try {
      const refs: { file: SignedFileDescriptor; signature: string }[] = [];
      for (const file of Array.from(input.files)) {
        const res = await api.uploadFile(formId, field.key, file);
        refs.push(res);
      }
      uploadedNames = refs.map((r) => r.file.originalName);
      value = uploadedNames;
      onFiles?.(refs);
    } catch (err) {
      uploadError = err instanceof Error ? err.message : "Échec de l'envoi.";
    } finally {
      uploading = false;
    }
  }
</script>

<div class="field">
  <label class="label" for={field.key}>
    {field.label}
    {#if field.required}<span class="text-red-600">*</span>{/if}
  </label>
  {#if field.description}
    <p class="mb-1 text-xs text-gray-500">{field.description}</p>
  {/if}

  {#if field.type === "short_text" || field.type === "email"}
    <input
      id={field.key}
      class="input"
      type={field.type === "email" ? "email" : "text"}
      placeholder={field.placeholder ?? ""}
      bind:value
    />
  {:else if field.type === "paragraph"}
    <textarea id={field.key} class="input" rows="4" placeholder={field.placeholder ?? ""} bind:value
    ></textarea>
  {:else if field.type === "number"}
    <input
      id={field.key}
      class="input"
      type="number"
      min={field.validation?.min}
      max={field.validation?.max}
      bind:value
    />
  {:else if field.type === "date" || field.type === "datetime"}
    <input id={field.key} class="input" type={field.type === "date" ? "date" : "datetime-local"} bind:value />
  {:else if field.type === "select"}
    <select id={field.key} class="input" bind:value>
      <option value="" disabled selected={!value}>— Choisir —</option>
      {#each field.options ?? [] as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  {:else if field.type === "radio"}
    <div class="space-y-1">
      {#each field.options ?? [] as opt}
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" name={field.key} value={opt.value} bind:group={value} />
          {opt.label}
        </label>
      {/each}
    </div>
  {:else if field.type === "checkbox"}
    <div class="space-y-1">
      {#each field.options ?? [] as opt}
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Array.isArray(value) && (value as string[]).includes(opt.value)}
            onchange={(e) => toggleCheckbox(opt.value, (e.target as HTMLInputElement).checked)}
          />
          {opt.label}
        </label>
      {/each}
    </div>
  {:else if field.type === "grid"}
    <div class="w-full">
      <!-- Desktop Table View -->
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full border-collapse border border-[color:var(--line)] text-sm">
          <thead>
            <tr class="bg-slate-50">
              <th class="border border-[color:var(--line)] p-3 text-left font-semibold text-[color:var(--ink)]"></th>
              {#each field.grid?.columns ?? [] as col}
                <th class="border border-[color:var(--line)] p-3 text-center font-semibold text-[color:var(--ink)]">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each field.grid?.rows ?? [] as row}
              <tr class="hover:bg-brand-50/30 transition-colors">
                <td class="border border-[color:var(--line)] p-3 font-medium text-[color:var(--ink)]">{row}</td>
                {#each field.grid?.columns ?? [] as col}
                  <td class="border border-[color:var(--line)] p-3 text-center">
                    <input
                      type="radio"
                      class="h-4 w-4 text-brand focus:ring-brand accent-brand cursor-pointer"
                      name={`${field.key}_${row}`}
                      checked={(value as Record<string, string>)?.[row] === col}
                      onchange={() => gridSet(row, col)}
                    />
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile Stacked Card View -->
      <div class="block md:hidden space-y-4">
        {#each field.grid?.rows ?? [] as row}
          <div class="rounded-xl border border-[color:var(--line)] p-4 bg-slate-50/50 shadow-sm">
            <div class="font-semibold text-sm mb-3 text-[color:var(--ink)]">{row}</div>
            <div class="grid grid-cols-2 gap-2">
              {#each field.grid?.columns ?? [] as col}
                {@const isSelected = (value as Record<string, string>)?.[row] === col}
                <button
                  type="button"
                  class="flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-all duration-200 text-center select-none"
                  class:bg-brand={isSelected}
                  class:text-white={isSelected}
                  class:border-brand={isSelected}
                  class:bg-white={!isSelected}
                  class:text-[color:var(--ink)]={!isSelected}
                  class:border-[color:var(--line)]={!isSelected}
                  class:hover:bg-brand-50={!isSelected}
                  onclick={() => gridSet(row, col)}
                >
                  <input
                    type="radio"
                    class="sr-only"
                    name={`${field.key}_${row}_mobile`}
                    checked={isSelected}
                    readOnly
                  />
                  <span>{col}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if field.type === "file"}
    <input
      id={field.key}
      class="input"
      type="file"
      multiple
      accept={field.accept?.join(",")}
      onchange={handleFiles}
      disabled={uploading}
    />
    {#if uploading}<p class="mt-1 text-xs text-gray-500">Envoi en cours…</p>{/if}
    {#if uploadedNames.length}
      <p class="mt-1 flex items-center gap-1 text-xs text-brand-700"><IconCheck size={13} weight="bold" /> {uploadedNames.join(", ")}</p>
    {/if}
    {#if uploadError}<p class="mt-1 text-xs text-red-600">{uploadError}</p>{/if}
  {/if}

  {#if error}
    <p class="mt-1 text-xs text-red-600">{error}</p>
  {/if}
</div>

<style lang="scss">
  .field {
    margin-bottom: 1.25rem;
  }
</style>
