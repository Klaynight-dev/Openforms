<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { api } from "$api/client.ts";
  import { IconCheck, IconWarning, IconShield, IconLock, IconLink, IconSettings } from "$lib/icons.ts";
  import { EnvelopeSimple as IconEmail, CalendarBlank as IconCalendar, SlidersHorizontal as IconSliders } from "phosphor-svelte";
  import type { FormDetail } from "$lib/types.ts";

  const editorState = getContext<{
    form: FormDetail | null;
    saving: boolean;
    saved: boolean;
    error: string | null;
    saveCallback: (() => Promise<void>) | null;
    triggerSave: () => Promise<void>;
  }>("form-editor-context");

  // Local settings copy bound to inputs
  let settings = $state({
    slug: "",
    requireConsent: true,
    consentText: "",
    isAnonymized: false,
    encryptResponses: false,
    visibility: "PUBLIC",
    allowedEmails: [] as string[],
    notifyOwner: false,
    sendConfirmationEmail: false,
    confirmationEmailText: "",
    webhookUrl: "",
    startsAt: null as string | null,
    endsAt: null as string | null,
    maxResponses: null as number | null,
  });

  // Sync state once the form loads in the parent layout
  $effect(() => {
    if (editorState.form) {
      settings.slug = editorState.form.slug;
      settings.requireConsent = editorState.form.requireConsent;
      settings.consentText = editorState.form.consentText ?? "";
      settings.isAnonymized = editorState.form.isAnonymized;
      settings.encryptResponses = editorState.form.encryptResponses;
      settings.visibility = editorState.form.visibility ?? "PUBLIC";
      settings.allowedEmails = editorState.form.allowedEmails ?? [];
      settings.notifyOwner = editorState.form.notifyOwner ?? false;
      settings.sendConfirmationEmail = editorState.form.sendConfirmationEmail ?? false;
      settings.confirmationEmailText = editorState.form.confirmationEmailText ?? "";
      settings.webhookUrl = editorState.form.webhookUrl ?? "";
      settings.startsAt = editorState.form.startsAt ?? null;
      settings.endsAt = editorState.form.endsAt ?? null;
      settings.maxResponses = editorState.form.maxResponses ?? null;
    }
  });

  // Allowed emails text helper
  let allowedEmailsText = $derived((settings.allowedEmails ?? []).join("\n"));

  // --- Lien personnalisé ---
  let origin = $state("");
  onMount(() => {
    origin = window.location.origin;
  });
  let slugCopied = $state(false);
  let publicUrl = $derived(`${origin || ""}/f/${settings.slug || ""}`);

  // Normalize input as the admin types: lowercase, spaces/invalid chars -> hyphen
  function onSlugInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value;
    settings.slug = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-{2,}/g, "-");
  }

  async function copyPublicUrl() {
    await navigator.clipboard.writeText(publicUrl);
    slugCopied = true;
    setTimeout(() => { slugCopied = false; }, 2000);
  }

  // Date formatting helper
  function formatDate(iso: string | null | undefined): string {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      const offset = d.getTimezoneOffset();
      const localDate = new Date(d.getTime() - offset * 60 * 1000);
      return localDate.toISOString().slice(0, 16);
    } catch {
      return "";
    }
  }

  // Save implementation
  async function save() {
    if (!editorState.form) return;
    
    const res = await api.updateForm(editorState.form.id, {
      title: editorState.form.title,
      slug: settings.slug,
      description: editorState.form.description ?? undefined,
      schema: editorState.form.schema,
      metaColumns: editorState.form.metaColumns,
      requireConsent: settings.requireConsent,
      consentText: settings.consentText || undefined,
      isAnonymized: settings.isAnonymized,
      encryptResponses: settings.encryptResponses,
      visibility: settings.visibility,
      allowedEmails: settings.allowedEmails,
      notifyOwner: settings.notifyOwner,
      sendConfirmationEmail: settings.sendConfirmationEmail,
      confirmationEmailText: settings.confirmationEmailText || undefined,
      webhookUrl: settings.webhookUrl || undefined,
      startsAt: settings.startsAt || undefined,
      endsAt: settings.endsAt || undefined,
      maxResponses: settings.maxResponses || undefined,
    });

    // Update the parent's form object to keep layout title and details in sync
    editorState.form.slug = res.form.slug;
    settings.slug = res.form.slug;
    editorState.form.requireConsent = settings.requireConsent;
    editorState.form.consentText = settings.consentText;
    editorState.form.isAnonymized = settings.isAnonymized;
    editorState.form.encryptResponses = settings.encryptResponses;
    editorState.form.visibility = settings.visibility;
    editorState.form.allowedEmails = settings.allowedEmails;
    editorState.form.notifyOwner = settings.notifyOwner;
    editorState.form.sendConfirmationEmail = settings.sendConfirmationEmail;
    editorState.form.confirmationEmailText = settings.confirmationEmailText;
    editorState.form.webhookUrl = settings.webhookUrl;
    editorState.form.startsAt = settings.startsAt;
    editorState.form.endsAt = settings.endsAt;
    editorState.form.maxResponses = settings.maxResponses;
  }

  // Register save function to the layout's header "Sauvegarder" button
  $effect(() => {
    editorState.saveCallback = save;
    return () => {
      editorState.saveCallback = null;
    };
  });
</script>

<div class="max-w-2xl mx-auto px-4 md:px-0 space-y-6">
  <!-- Custom URL Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-violet-50 text-[color:var(--brand)]"><IconLink size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Lien personnalisé</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Choisissez l'adresse publique utilisée pour partager ce formulaire</p>
      </div>
    </div>
    <div class="p-6 space-y-3">
      <label class="label text-xs" for="slug-input">Lien public</label>
      <div class="flex items-stretch rounded-xl border border-[color:var(--line)] overflow-hidden focus-within:ring-2 focus-within:ring-[color:var(--brand)] focus-within:border-transparent">
        <span class="px-3 flex items-center bg-slate-50 text-xs text-[color:var(--muted)] font-mono border-r border-[color:var(--line)] shrink-0 max-w-[45%] truncate">
          {origin || "https://votre-domaine"}/f/
        </span>
        <input
          id="slug-input"
          type="text"
          class="flex-1 min-w-0 px-3 py-2 text-xs font-mono outline-none"
          placeholder="mon-formulaire"
          value={settings.slug}
          oninput={onSlugInput}
        />
        <button
          type="button"
          class="btn-text !px-3 !rounded-none border-l border-[color:var(--line)] shrink-0"
          title="Copier le lien"
          onclick={copyPublicUrl}
        >
          {#if slugCopied}
            <IconCheck size={16} class="text-green-600" />
          {:else}
            <IconLink size={16} />
          {/if}
        </button>
      </div>
      <p class="text-[10px] text-[color:var(--muted)] break-all">{publicUrl}</p>
      <p class="text-[10px] text-[color:var(--muted)]">3 à 80 caractères : minuscules, chiffres et tirets uniquement.</p>
    </div>
  </div>

  <!-- RGPD & Consentment Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-violet-50 text-[color:var(--brand)]"><IconShield size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">RGPD & Consentement</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Gérer le recueil du consentement obligatoire des répondants</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.requireConsent} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Exiger le consentement</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Le répondant devra cocher une case d'acceptation obligatoire avant de pouvoir soumettre le formulaire.</p>
        </div>
      </label>
      
      {#if settings.requireConsent}
        <div class="pt-2 animate-fade-in">
          <label class="label text-xs" for="consent-text-input">Texte de consentement</label>
          <textarea 
            id="consent-text-input"
            class="input text-xs" 
            rows="3" 
            placeholder="J'accepte que mes réponses soient traitées conformément au RGPD..." 
            bind:value={settings.consentText}
          ></textarea>
        </div>
      {/if}
    </div>
  </div>

  <!-- Security & Privacy Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-blue-50 text-blue-600"><IconLock size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Sécurité & Confidentialité</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Options d'anonymisation et de chiffrement des réponses</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.isAnonymized} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Anonymiser les réponses</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Aucune adresse IP ni identifiant système ne sera stocké avec les soumissions.</p>
        </div>
      </label>
      
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.encryptResponses} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Chiffrer au repos (Chiffrement)</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Chiffre le contenu des réponses en base de données pour une sécurité maximale.</p>
        </div>
      </label>
    </div>
  </div>

  <!-- Visibility Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-emerald-50 text-emerald-600"><IconSliders size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Visibilité & Accès</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Définir qui peut accéder et répondre à ce formulaire</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <div>
        <label class="label text-xs" for="visibility-select">Règle de visibilité active</label>
        <select id="visibility-select" class="input text-xs" bind:value={settings.visibility}>
          <option value="PUBLIC">Publique (Tout le monde peut répondre)</option>
          <option value="PRIVATE">Utilisateurs connectés uniquement</option>
          <option value="RESTRICTED">Certaines personnes (par adresse e-mail)</option>
        </select>
      </div>
      
      {#if settings.visibility === "RESTRICTED"}
        <div class="pt-2 animate-fade-in">
          <label class="label text-xs" for="restricted-emails-input">Adresses e-mail autorisées (une par ligne)</label>
          <textarea 
            id="restricted-emails-input"
            class="input text-xs font-mono" 
            rows="4" 
            placeholder="exemple1@humanitour.org&#10;exemple2@humanitour.org" 
            value={allowedEmailsText}
            oninput={(e) => {
              settings.allowedEmails = (e.target as HTMLTextAreaElement).value
                .split("\n")
                .map((email) => email.trim())
                .filter(Boolean);
            }}
          ></textarea>
        </div>
      {/if}
    </div>
  </div>

  <!-- Notifications & Webhooks Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-indigo-50 text-indigo-600"><IconEmail size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">E-mails & Webhooks</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Configurer les alertes de réception et les webhooks</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.notifyOwner} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Alerte e-mail propriétaire</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">M'envoyer un e-mail récapitulatif à chaque fois qu'une nouvelle réponse est enregistrée.</p>
        </div>
      </label>
      
      <label class="flex items-start gap-3 cursor-pointer">
        <input 
          type="checkbox" 
          bind:checked={settings.sendConfirmationEmail} 
          class="mt-1 h-4 w-4 rounded border-gray-300 text-[color:var(--brand)] focus:ring-[color:var(--brand)] accent-[color:var(--brand)]" 
        />
        <div>
          <span class="text-sm font-semibold text-[color:var(--ink)]">Confirmation e-mail répondant</span>
          <p class="text-xs text-[color:var(--muted)] mt-0.5">Envoyer automatiquement une copie de confirmation par e-mail au répondant.</p>
        </div>
      </label>
      
      {#if settings.sendConfirmationEmail}
        <div class="pt-2 animate-fade-in">
          <label class="label text-xs" for="confirmation-email-text-input">Texte de l'e-mail de confirmation</label>
          <textarea 
            id="confirmation-email-text-input"
            class="input text-xs" 
            rows="3" 
            placeholder="Merci pour votre soumission. Nous l'avons bien reçue..." 
            bind:value={settings.confirmationEmailText}
          ></textarea>
        </div>
      {/if}

      <div class="pt-2 border-t border-slate-100">
        <label class="label text-xs flex items-center gap-1" for="webhook-url-input">
          <IconLink size={14} /> URL de Webhook (POST JSON)
        </label>
        <input 
          id="webhook-url-input"
          type="url" 
          class="input text-xs font-mono" 
          placeholder="https://votre-serveur.com/api/webhook" 
          bind:value={settings.webhookUrl} 
        />
        <p class="text-[10px] text-[color:var(--muted)] mt-1">L'API enverra une requête HTTP POST avec le payload JSON de la soumission à cette URL.</p>
      </div>
    </div>
  </div>

  <!-- Limits & Schedule Card -->
  <div class="bg-white rounded-2xl border border-[color:var(--line)] shadow-sm overflow-hidden">
    <div class="p-6 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
      <div class="p-2 rounded-lg bg-orange-50 text-orange-600"><IconCalendar size={20} /></div>
      <div>
        <h3 class="font-bold text-sm text-[color:var(--ink)]">Planification & Quotas</h3>
        <p class="text-[11px] text-[color:var(--muted)]">Restreindre la période d'ouverture ou le volume de réponses</p>
      </div>
    </div>
    <div class="p-6 space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="label text-xs" for="starts-at-input">Date et heure d'ouverture</label>
          <input 
            id="starts-at-input"
            type="datetime-local" 
            class="input text-xs" 
            value={formatDate(settings.startsAt)} 
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              settings.startsAt = v ? new Date(v).toISOString() : null;
            }} 
          />
        </div>
        <div>
          <label class="label text-xs" for="ends-at-input">Date et heure de fermeture</label>
          <input 
            id="ends-at-input"
            type="datetime-local" 
            class="input text-xs" 
            value={formatDate(settings.endsAt)} 
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              settings.endsAt = v ? new Date(v).toISOString() : null;
            }} 
          />
        </div>
      </div>

      <div class="pt-2 border-t border-slate-100">
        <label class="label text-xs" for="max-responses-input">Quota maximum de réponses</label>
        <input 
          id="max-responses-input"
          type="number" 
          class="input text-xs" 
          placeholder="Aucune limite" 
          bind:value={settings.maxResponses} 
        />
        <p class="text-[10px] text-[color:var(--muted)] mt-1">Le formulaire se fermera automatiquement lorsque ce nombre de réponses sera atteint.</p>
      </div>
    </div>
  </div>

  <!-- Bottom Save Button for ergonomics -->
  <div class="flex justify-end pt-4 pb-12">
    <button 
      class="btn-primary w-full sm:w-auto" 
      onclick={() => editorState.triggerSave()} 
      disabled={editorState.saving}
    >
      <IconCheck size={18} />
      <span>{editorState.saving ? "Envoi..." : "Sauvegarder les paramètres"}</span>
    </button>
  </div>
</div>
