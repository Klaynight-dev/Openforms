<script lang="ts">
  /**
   * Cases de consentement RGPD, affichées en tête ou en fin de formulaire.
   *
   * Sans acceptation listée : une case unique portant `consentText`. Avec :
   * `consentText` devient l'introduction, et chaque acceptation a sa case,
   * décochée à l'ouverture (un consentement précoché n'en est pas un).
   */
  import type { ConsentItem } from "$lib/types.ts";
  import { DEFAULT_CONSENT_INTRO, DEFAULT_CONSENT_TEXT } from "$lib/consent.ts";
  import { IconShield } from "$lib/icons.ts";

  interface Props {
    consentText?: string | null;
    items?: ConsentItem[];
    /** Vide = page générique de l'instance. */
    privacyPolicyUrl?: string | null;
    consent: boolean;
    consents: Record<string, boolean>;
    error?: string | null;
  }

  let {
    consentText = null,
    items = [],
    privacyPolicyUrl = null,
    consent = $bindable(),
    consents = $bindable(),
    error = null,
  }: Props = $props();

  const policyHref = $derived(privacyPolicyUrl?.trim() || "/legal/confidentialite");
</script>

<div data-consent class="mb-5">
  {#if items.length === 0}
    <label
      class="flex items-start gap-3 rounded-xl border bg-white p-6 text-sm shadow-sm hover:shadow-md cursor-pointer transition-shadow duration-200"
      class:border-[color:var(--line)]={!error}
      class:border-[color:var(--danger)]={error}
    >
      <input type="checkbox" bind:checked={consent} class="mt-1 h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer" />
      <span class="text-[color:var(--ink)] font-medium leading-tight">{consentText || DEFAULT_CONSENT_TEXT}</span>
    </label>
  {:else}
    <fieldset
      class="rounded-xl border bg-white p-6 shadow-sm"
      class:border-[color:var(--line)]={!error}
      class:border-[color:var(--danger)]={error}
    >
      <legend class="sr-only">Consentement</legend>
      <p class="flex items-start gap-2 text-sm font-semibold text-[color:var(--ink)]">
        <IconShield size={18} class="mt-px shrink-0 text-[color:var(--brand)]" />
        <span class="whitespace-pre-line">{consentText?.trim() || DEFAULT_CONSENT_INTRO}</span>
      </p>
      <ul class="mt-4 space-y-2">
        {#each items as item (item.id)}
          <li>
            <label class="flex items-start gap-3 rounded-lg border border-[color:var(--line)] p-3 text-sm cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                bind:checked={() => consents[item.id] === true, (v) => (consents = { ...consents, [item.id]: v })}
                class="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand focus:ring-brand accent-brand cursor-pointer"
              />
              <span class="leading-snug text-[color:var(--ink)]">
                {item.label}
                {#if item.required}
                  <span class="text-[color:var(--danger)]" aria-label="obligatoire">*</span>
                {:else}
                  <span class="text-xs text-[color:var(--muted)]">(facultatif)</span>
                {/if}
              </span>
            </label>
          </li>
        {/each}
      </ul>
    </fieldset>
  {/if}

  {#if error}
    <p class="mt-2 px-1 text-xs font-semibold text-[color:var(--danger)]" role="alert">{error}</p>
  {/if}

  <!-- Information de la personne concernée au moment de la collecte (art. 13 RGPD). -->
  <p class="mt-2 px-1 text-xs text-[color:var(--muted)]">
    Voir la <a class="underline underline-offset-2 hover:text-[color:var(--brand)]" href={policyHref} target="_blank" rel="noopener">politique de confidentialité</a>
    pour connaître vos droits sur ces données.
  </p>
</div>
