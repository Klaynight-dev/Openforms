<script lang="ts">
  import type { FieldDefinition } from "../types.ts";
  import { api, type SignedFileDescriptor } from "../api/client.ts";
  import { IconCheck } from "../icons.ts";

  let {
    field,
    value = $bindable(),
    justification = $bindable(),
    error,
    formId,
    onFiles,
  }: {
    field: FieldDefinition;
    value: unknown;
    justification?: unknown;
    error?: string;
    formId: string;
    onFiles?: (refs: { file: SignedFileDescriptor; signature: string }[]) => void;
  } = $props();

  let uploading = $state(false);
  let uploadError = $state<string | null>(null);
  let uploadedNames = $state<string[]>([]);

  // Gestion de l'option "Autre" pour les champs radio et select
  const OTHER_KEY = "__other__";
  let otherText = $state("");
  let otherSelected = $derived(typeof value === "string" && (value === OTHER_KEY || (value as string).startsWith(OTHER_KEY + ":")));

  $effect(() => {
    if (typeof value === "string" && value.startsWith(OTHER_KEY + ":")) {
      otherText = value.slice(OTHER_KEY.length + 1);
    }
  });

  function selectOther() {
    value = otherText ? `${OTHER_KEY}:${otherText}` : OTHER_KEY;
  }

  function onOtherInput(e: Event) {
    otherText = (e.target as HTMLInputElement).value;
    value = `${OTHER_KEY}:${otherText}`;
  }

  function checkboxGridToggle(row: string, col: string, checked: boolean) {
    const obj = (typeof value === "object" && value ? { ...(value as Record<string, string[]>) } : {}) as Record<string, string[]>;
    if (!obj[row]) obj[row] = [];
    if (checked) {
      obj[row] = [...obj[row], col];
    } else {
      obj[row] = obj[row].filter((v) => v !== col);
    }
    value = obj;
  }

  function toggleCheckbox(optValue: string, checked: boolean) {
    const arr = Array.isArray(value) ? [...(value as string[])] : [];
    if (checked) arr.push(optValue);
    else arr.splice(arr.indexOf(optValue), 1);
    value = arr;
  }

  function fillWithNow() {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    value = field.type === "date" ? datePart : `${datePart}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
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

  // --- Signature Tactile/Souris ---
  let canvasEl = $state<HTMLCanvasElement>();
  let ctx: CanvasRenderingContext2D | null = null;
  let isDrawing = false;

  function initSignatureCanvas(node: HTMLCanvasElement) {
    canvasEl = node;
    ctx = node.getContext("2d");
    node.width = node.clientWidth;
    node.height = node.clientHeight;
    if (ctx) {
      ctx.strokeStyle = "#4f46e5"; // Indigo brush
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
    }

    function getPos(e: MouseEvent | TouchEvent) {
      const rect = node.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    }

    function startDraw(e: MouseEvent | TouchEvent) {
      isDrawing = true;
      const pos = getPos(e);
      ctx?.beginPath();
      ctx?.moveTo(pos.x, pos.y);
    }

    function draw(e: MouseEvent | TouchEvent) {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      ctx?.lineTo(pos.x, pos.y);
      ctx?.stroke();
    }

    function stopDraw() {
      if (!isDrawing) return;
      isDrawing = false;
      value = node.toDataURL("image/png");
    }

    node.addEventListener("mousedown", startDraw);
    node.addEventListener("mousemove", draw);
    window.addEventListener("mouseup", stopDraw);

    node.addEventListener("touchstart", startDraw);
    node.addEventListener("touchmove", draw);
    window.addEventListener("touchend", stopDraw);

    return {
      destroy() {
        node.removeEventListener("mousedown", startDraw);
        node.removeEventListener("mousemove", draw);
        window.removeEventListener("mouseup", stopDraw);
        node.removeEventListener("touchstart", startDraw);
        node.removeEventListener("touchmove", draw);
        window.removeEventListener("touchend", stopDraw);
      },
    };
  }

  function clearSignature() {
    if (canvasEl && ctx) {
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      value = "";
    }
  }

  // --- Autocomplétion d'adresse ---
  let addressQuery = $state("");
  let suggestions = $state<string[]>([]);
  let showSuggestions = $state(false);

  $effect(() => {
    if (field.type === "address" && typeof value === "string") {
      addressQuery = value;
    }
  });

  async function fetchSuggestions(e: Event) {
    const query = (e.target as HTMLInputElement).value;
    addressQuery = query;
    value = query;
    if (query.length < 3) {
      suggestions = [];
      showSuggestions = false;
      return;
    }
    try {
      const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
      const data = await res.json();
      suggestions = data.features.map((f: any) => f.properties.label);
      showSuggestions = suggestions.length > 0;
    } catch {
      // Offline fallback
    }
  }

  function selectSuggestion(sug: string) {
    addressQuery = sug;
    value = sug;
    suggestions = [];
    showSuggestions = false;
  }

  // --- Simulation Stripe ---
  let isPaying = $state(false);
  let paymentSuccess = $derived(!!(value && typeof value === "object" && (value as any).paid));

  function simulatePayment() {
    isPaying = true;
    setTimeout(() => {
      isPaying = false;
      value = {
        paid: true,
        amount: field.validation?.min ?? 10,
        currency: "EUR",
        transactionId: "ch_mock_" + Math.random().toString(36).substring(2, 10).toUpperCase(),
        paidAt: new Date().toISOString(),
      };
    }, 1500);
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
    <div class="flex items-center gap-2">
      <input id={field.key} class="input" type={field.type === "date" ? "date" : "datetime-local"} bind:value />
      {#if field.allowAutoToday}
        <button type="button" class="btn-secondary !py-1.5 px-3 text-xs shrink-0" onclick={fillWithNow}>
          {field.type === "date" ? "Aujourd'hui" : "Maintenant"}
        </button>
      {/if}
    </div>
  {:else if field.type === "select"}
    <select
      id={field.key}
      class="input"
      value={otherSelected ? OTHER_KEY : (value ?? "")}
      onchange={(e) => {
        const val = (e.target as HTMLSelectElement).value;
        if (val === OTHER_KEY) {
          selectOther();
        } else {
          value = val;
        }
      }}
    >
      <option value="" disabled selected={!value}>— Choisir —</option>
      {#each field.options ?? [] as opt}
        <option value={opt.value}>{opt.label}</option>
      {/each}
      {#if field.allowOther}
        <option value={OTHER_KEY}>Autre…</option>
      {/if}
    </select>
    {#if field.allowOther && otherSelected}
      <input
        type="text"
        class="input mt-2 !py-1.5 text-sm"
        placeholder="Précisez votre réponse"
        value={otherText}
        oninput={onOtherInput}
      />
    {/if}
  {:else if field.type === "radio"}
    <div class="space-y-2">
      {#each field.options ?? [] as opt}
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input type="radio" name={field.key} value={opt.value} bind:group={value} />
          {opt.label}
        </label>
      {/each}
      {#if field.allowOther}
        <label class="flex items-start gap-2 text-sm cursor-pointer select-none">
          <input
            type="radio"
            name={field.key}
            value={OTHER_KEY}
            checked={otherSelected}
            onchange={selectOther}
            class="mt-1 shrink-0"
          />
          <span class="flex flex-col gap-1 flex-1 min-w-0">
            <span class="font-medium text-[color:var(--ink)]">Autre…</span>
            {#if otherSelected}
              <input
                type="text"
                class="input !py-1.5 text-sm"
                placeholder="Précisez votre réponse"
                value={otherText}
                oninput={onOtherInput}
              />
            {/if}
          </span>
        </label>
      {/if}
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
  {:else if field.type === "linear_scale"}
    {@const scaleMin = field.scale?.min ?? 1}
    {@const scaleMax = field.scale?.max ?? 5}
    {@const steps = Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i)}
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-1 flex-wrap">
        {#each steps as n}
          {@const isActive = value === n}
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-xl border-2 text-sm font-bold transition-all duration-150 select-none"
            class:border-brand-500={isActive}
            class:bg-brand-500={isActive}
            class:text-white={isActive}
            class:shadow-md={isActive}
            class:border-slate-200={!isActive}
            class:bg-white={!isActive}
            class:text-[color:var(--ink)]={!isActive}
            class:hover:border-brand-300={!isActive}
            onclick={() => value = isActive ? null : n}
          >{n}</button>
        {/each}
      </div>
      {#if field.scale?.minLabel || field.scale?.maxLabel}
        <div class="flex justify-between text-xs text-[color:var(--muted)] font-medium px-1">
          <span>{field.scale?.minLabel ?? ""}</span>
          <span>{field.scale?.maxLabel ?? ""}</span>
        </div>
      {/if}
    </div>
  {:else if field.type === "checkbox_grid"}
    <div class="w-full">
      <!-- Desktop -->
      <div class="hidden md:block overflow-x-auto">
        <table class="min-w-full border-collapse border border-[color:var(--line)] text-sm">
          <thead>
            <tr class="bg-slate-50">
              <th class="border border-[color:var(--line)] p-3 text-left font-semibold"></th>
              {#each field.grid?.columns ?? [] as col}
                <th class="border border-[color:var(--line)] p-3 text-center font-semibold">{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each field.grid?.rows ?? [] as row}
              <tr class="hover:bg-brand-50/30 transition-colors">
                <td class="border border-[color:var(--line)] p-3 font-medium">{row}</td>
                {#each field.grid?.columns ?? [] as col}
                  {@const rowVals = (value as Record<string, string[]>)?.[row] ?? []}
                  <td class="border border-[color:var(--line)] p-3 text-center">
                    <input
                      type="checkbox"
                      class="h-4 w-4 accent-brand cursor-pointer"
                      checked={rowVals.includes(col)}
                      onchange={(e) => checkboxGridToggle(row, col, (e.target as HTMLInputElement).checked)}
                    />
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <!-- Mobile -->
      <div class="block md:hidden space-y-4">
        {#each field.grid?.rows ?? [] as row}
          {@const rowVals = (value as Record<string, string[]>)?.[row] ?? []}
          <div class="rounded-xl border border-[color:var(--line)] p-4 bg-slate-50/50 shadow-sm">
            <div class="font-semibold text-sm mb-3">{row}</div>
            <div class="grid grid-cols-2 gap-2">
              {#each field.grid?.columns ?? [] as col}
                {@const checked = rowVals.includes(col)}
                <button
                  type="button"
                  class="flex items-center gap-2 rounded-lg border p-2.5 text-xs font-medium transition-all duration-200 select-none text-left"
                  class:bg-brand={checked}
                  class:text-white={checked}
                  class:border-brand={checked}
                  class:bg-white={!checked}
                  class:text-[color:var(--ink)]={!checked}
                  class:border-[color:var(--line)]={!checked}
                  onclick={() => checkboxGridToggle(row, col, !checked)}
                >
                  <span class="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 {checked ? 'border-white bg-white/30' : 'border-current'}">
                    {#if checked}<span class="block h-2 w-2 rounded-sm bg-white"></span>{/if}
                  </span>
                  {col}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else if field.type === "signature"}
    <div class="signature-box border border-[color:var(--line)] rounded-xl bg-slate-50/50 p-4 flex flex-col gap-2 animate-fade-in">
      <canvas
        use:initSignatureCanvas
        class="w-full h-32 border border-dashed border-slate-300 rounded-lg bg-white cursor-crosshair touch-none shadow-inner"
      ></canvas>
      <div class="flex items-center justify-between">
        <span class="text-xs text-[color:var(--muted)]">Dessinez votre signature ci-dessus</span>
        <button type="button" class="btn-secondary !py-1 !px-2.5 text-xs" onclick={clearSignature}>Effacer</button>
      </div>
    </div>
  {:else if field.type === "address"}
    <div class="relative w-full animate-fade-in">
      <input
        id={field.key}
        type="text"
        class="input w-full"
        placeholder={field.placeholder ?? "Rechercher une adresse..."}
        value={addressQuery}
        oninput={fetchSuggestions}
        autocomplete="off"
      />
      {#if showSuggestions && suggestions.length > 0}
        <ul class="absolute z-50 w-full bg-white border border-[color:var(--line)] rounded-xl mt-1 shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
          {#each suggestions as sug}
            <li>
              <button
                type="button"
                class="w-full text-left p-2.5 text-xs hover:bg-slate-50 text-[color:var(--ink)] font-medium transition-colors"
                onclick={() => selectSuggestion(sug)}
              >
                {sug}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else if field.type === "stripe_payment"}
    <div class="border border-[color:var(--line)] rounded-xl bg-slate-50/50 p-4 flex flex-col gap-4 animate-fade-in">
      <div class="flex items-center justify-between border-b border-[color:var(--line)] pb-3">
        <div>
          <p class="text-xs text-[color:var(--muted)] font-semibold uppercase tracking-wider">Montant à régler</p>
          <p class="text-xl font-black text-[color:var(--ink)]">{field.validation?.min ?? 10} €</p>
        </div>
        <span class="chip-muted flex items-center gap-1.5 bg-blue-50 text-blue-700 border-blue-200 text-xs">
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
          Sécurisé par Stripe
        </span>
      </div>
      
      {#if paymentSuccess}
        <div class="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 p-3 rounded-lg text-xs font-semibold">
          <svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <span>Paiement validé avec succès (ID: {(value as any).transactionId})</span>
        </div>
      {:else}
        <div class="space-y-3">
          <div>
            <label class="label !text-[10px]">Numéro de carte</label>
            <input class="input text-xs" type="text" placeholder="4242 4242 4242 4242" disabled={isPaying} />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="label !text-[10px]">Expiration</label>
              <input class="input text-xs" type="text" placeholder="MM/AA" disabled={isPaying} />
            </div>
            <div>
              <label class="label !text-[10px]">CVC</label>
              <input class="input text-xs" type="text" placeholder="123" disabled={isPaying} />
            </div>
          </div>
          <button
            type="button"
            class="btn-primary w-full text-xs flex items-center justify-center gap-2 mt-2"
            onclick={simulatePayment}
            disabled={isPaying}
          >
            {#if isPaying}
              <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" class="opacity-75"/></svg>
              <span>Traitement en cours…</span>
            {:else}
              <span>Payer {field.validation?.min ?? 10} €</span>
            {/if}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if field.requireJustification && (field.type === "select" || field.type === "radio" || field.type === "checkbox" || field.type === "grid" || field.type === "checkbox_grid")}
    <div class="mt-2">
      <label class="label !text-[10px] text-slate-400 uppercase tracking-wide" for={`${field.key}-justification`}>Justification</label>
      <textarea
        id={`${field.key}-justification`}
        class="input text-sm"
        rows="2"
        placeholder="Justifiez votre réponse..."
        value={typeof justification === "string" ? justification : ""}
        oninput={(e) => (justification = (e.target as HTMLTextAreaElement).value)}
      ></textarea>
    </div>
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
