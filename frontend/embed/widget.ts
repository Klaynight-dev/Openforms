/**
 * OpenForms — widget d'embed autonome.
 *
 * Rend un formulaire publié directement dans le DOM de la page hôte (pas
 * d'iframe), dans un Shadow DOM pour ne jamais entrer en conflit avec le CSS
 * du site qui l'intègre. Ne dépend d'aucune librairie externe.
 *
 * Usage déclaratif :
 *   <div data-openforms="mon-slug" data-openforms-api="https://api.exemple.com"></div>
 *   <script src="https://exemple.com/embed.js" defer></script>
 *
 * Usage programmatique :
 *   OpenForms.mount(document.getElementById("mon-form"), {
 *     slug: "mon-slug",
 *     apiBase: "https://api.exemple.com",
 *     onSubmit: (responseId) => console.log("Soumis", responseId),
 *   });
 */

export {};

const JUSTIFICATION_SUFFIX = "__justification";
const OTHER_KEY = "__other__";

interface FieldOption {
  value: string;
  label: string;
}

interface FieldDefinition {
  key: string;
  type: string;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: FieldOption[];
  allowOther?: boolean;
  requireJustification?: boolean;
  allowAutoToday?: boolean;
  condition?: { fieldKey: string; value: string };
  validation?: { minLength?: number; maxLength?: number; pattern?: string; min?: number; max?: number };
  accept?: string[];
  maxSizeBytes?: number;
  grid?: { rows: string[]; columns: string[] };
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string };
}

interface PublicForm {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  schema: FieldDefinition[];
  requireConsent: boolean;
  consentText?: string | null;
  isAnonymized: boolean;
  visibility: string;
}

interface Page {
  title: string;
  description: string;
  fields: FieldDefinition[];
  isFirst: boolean;
  isLast: boolean;
}

interface WidgetOptions {
  slug: string;
  apiBase?: string;
  onSubmit?: (responseId: string | undefined) => void;
}

const WIDGET_CSS = `
:host { all: initial; }
.of-root {
  font-family: "Google Sans", Roboto, "Segoe UI", system-ui, sans-serif;
  color: #202124;
  box-sizing: border-box;
  max-width: 640px;
}
.of-root *, .of-root *::before, .of-root *::after { box-sizing: border-box; }
.of-card {
  border: 1px solid #dadce0;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.1);
  margin-bottom: 1.25rem;
  overflow: hidden;
}
.of-banner {
  height: 6rem;
  background: linear-gradient(to right, #7c3aed, #4f46e5, #9333ea);
}
.of-card-body { padding: 1.5rem; }
.of-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 .5rem; line-height: 1.25; }
.of-desc { font-size: .875rem; color: #5f6368; margin: 0; white-space: pre-line; line-height: 1.5; }
.of-anon-badge {
  margin-top: 1rem; display: inline-flex; align-items: center; gap: .375rem;
  border-radius: .5rem; background: #f3eefb; color: #4d2a8a; font-size: .75rem;
  font-weight: 600; padding: .375rem .75rem;
}
.of-field {
  margin-bottom: 1rem; border: 1px solid #dadce0; border-radius: .75rem;
  background: #fff; padding: 1.25rem; box-shadow: 0 1px 3px rgba(60,64,67,.08);
}
.of-label { display: block; font-size: .875rem; font-weight: 600; margin-bottom: .375rem; }
.of-required { color: #d93025; }
.of-field-desc { font-size: .75rem; color: #5f6368; margin: 0 0 .5rem; }
.of-input, .of-select, .of-textarea {
  width: 100%; border: 1px solid #dadce0; border-radius: .5rem; padding: .5rem .75rem;
  font-size: .875rem; font-family: inherit; color: #202124; background: #fff;
}
.of-input:focus, .of-select:focus, .of-textarea:focus {
  outline: 2px solid #673ab7; outline-offset: 1px; border-color: #673ab7;
}
.of-textarea { resize: vertical; min-height: 5rem; }
.of-row { display: flex; align-items: center; gap: .5rem; }
.of-option { display: flex; align-items: center; gap: .5rem; font-size: .875rem; margin-bottom: .375rem; cursor: pointer; user-select: none; }
.of-btn {
  border-radius: .625rem; font-weight: 600; font-size: .875rem; padding: .625rem 1.25rem;
  cursor: pointer; border: 1px solid transparent; transition: filter .15s;
}
.of-btn:hover { filter: brightness(0.95); }
.of-btn:disabled { opacity: .6; cursor: not-allowed; }
.of-btn-primary { background: #673ab7; color: #fff; }
.of-btn-secondary { background: #fff; color: #202124; border-color: #dadce0; }
.of-error { color: #d93025; font-size: .75rem; margin-top: .375rem; }
.of-progress-wrap { margin-bottom: 1.25rem; border: 1px solid #dadce0; border-radius: .75rem; padding: 1rem; background: #fff; }
.of-progress-label { display: flex; justify-content: space-between; font-size: .75rem; font-weight: 600; color: #5f6368; margin-bottom: .5rem; }
.of-progress-bar { height: .5rem; width: 100%; background: #f1f3f4; border-radius: 999px; overflow: hidden; }
.of-progress-fill { height: 100%; background: #673ab7; border-radius: 999px; transition: width .3s; }
.of-actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
.of-actions-left { display: flex; align-items: center; gap: .75rem; }
.of-footer-note { font-size: .75rem; color: #5f6368; }
.of-consent { display: flex; align-items: flex-start; gap: .75rem; font-size: .875rem; padding: 1.25rem; border: 1px solid #dadce0; border-radius: .75rem; background: #fff; margin-bottom: 1.25rem; cursor: pointer; }
.of-consent input { margin-top: .2rem; }
.of-skeleton { animation: of-pulse 1.5s ease-in-out infinite; }
@keyframes of-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
.of-skel-block { background: #e8eaed; border-radius: .5rem; }
.of-center { display: grid; place-items: center; padding: 2rem 0; }
.of-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
.of-table th, .of-table td { border: 1px solid #dadce0; padding: .625rem; text-align: center; }
.of-table th:first-child, .of-table td:first-child { text-align: left; font-weight: 500; }
.of-signature-canvas { width: 100%; height: 8rem; border: 1px dashed #bdc1c6; border-radius: .5rem; background: #fff; touch-action: none; cursor: crosshair; }
.of-linear-scale { display: flex; gap: .375rem; flex-wrap: wrap; }
.of-scale-btn {
  width: 2.5rem; height: 2.5rem; border-radius: .75rem; border: 2px solid #e8eaed; background: #fff;
  font-weight: 700; font-size: .875rem; cursor: pointer;
}
.of-scale-btn.active { border-color: #673ab7; background: #673ab7; color: #fff; }
.of-scale-labels { display: flex; justify-content: space-between; font-size: .75rem; color: #5f6368; }
.of-success { text-align: center; padding: 2.5rem 1.5rem; }
.of-success-icon { color: #673ab7; margin-bottom: .5rem; }
.of-suggestions { position: relative; }
.of-suggestions-list { list-style: none; margin: 0; padding: 0; position: absolute; z-index: 10; width: 100%; background: #fff; border: 1px solid #dadce0; border-radius: .5rem; margin-top: .25rem; box-shadow: 0 4px 10px rgba(0,0,0,.1); max-height: 12rem; overflow-y: auto; }
.of-suggestions-list li button { width: 100%; text-align: left; padding: .5rem .75rem; font-size: .8rem; background: none; border: none; cursor: pointer; }
.of-suggestions-list li button:hover { background: #f8f9fa; }
.of-lang-note { font-size: .7rem; color: #9aa0a6; margin-top: .25rem; }
`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function isConditionMet(cond: { fieldKey: string; value: string } | undefined, values: Record<string, unknown>): boolean {
  if (!cond) return true;
  const val = values[cond.fieldKey];
  if (val == null) return false;
  if (Array.isArray(val)) return val.map(String).includes(cond.value);
  return String(val) === cond.value;
}

class OpenFormsWidget {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private root: HTMLElement;
  private apiBase: string;
  private slug: string;
  private onSubmitCb?: (id: string | undefined) => void;

  private form: PublicForm | null = null;
  private values: Record<string, unknown> = {};
  private files: Record<string, { file: unknown; signature: string }[]> = {};
  private fieldErrors: Record<string, string> = {};
  private consent = false;
  private currentPageIndex = 0;
  private loading = true;
  private loadError: string | null = null;
  private statusError: number | null = null;
  private submitting = false;
  private submitted = false;
  private submitError: string | null = null;

  constructor(host: HTMLElement, opts: WidgetOptions) {
    this.host = host;
    this.slug = opts.slug;
    this.onSubmitCb = opts.onSubmit;
    this.apiBase = (opts.apiBase ?? inferApiBase(host)).replace(/\/$/, "");
    this.shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    this.shadow.append(style);
    this.root = el("div", { class: "of-root" });
    this.shadow.append(this.root);
    this.load();
  }

  private async load() {
    this.loading = true;
    this.loadError = null;
    this.statusError = null;
    this.render();
    try {
      const res = await fetch(`${this.apiBase}/api/v1/forms/public/${encodeURIComponent(this.slug)}`);
      const payload = await res.json();
      if (!res.ok) {
        this.statusError = res.status;
        this.loadError = payload?.error ?? "Formulaire introuvable.";
      } else {
        this.form = payload.form;
      }
    } catch {
      this.loadError = "Impossible de contacter le serveur.";
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private computeVisibleKeys(): Set<string> {
    const visible = new Set<string>();
    if (!this.form) return visible;
    let currentSectionKey: string | null = null;
    for (const f of this.form.schema) {
      let parentSectionVisible = true;
      if (f.type !== "section" && currentSectionKey !== null) {
        parentSectionVisible = visible.has(currentSectionKey);
      }
      let fieldVisible = parentSectionVisible;
      if (fieldVisible && f.condition) fieldVisible = isConditionMet(f.condition, this.values);

      if (f.type === "section") {
        currentSectionKey = f.key;
        if (fieldVisible) visible.add(f.key);
        continue;
      }
      if (fieldVisible) visible.add(f.key);
    }
    return visible;
  }

  private computePages(): Page[] {
    if (!this.form) return [];
    const visible = this.computeVisibleKeys();
    const list: Page[] = [];
    let currentFields: FieldDefinition[] = [];
    let currentTitle = this.form.title;
    let currentDescription = this.form.description ?? "";

    for (const field of this.form.schema) {
      if (field.type === "section") {
        if (visible.has(field.key)) {
          list.push({ title: currentTitle, description: currentDescription, fields: currentFields, isFirst: false, isLast: false });
          currentFields = [];
          currentTitle = field.label;
          currentDescription = field.description ?? "";
        }
      } else if (visible.has(field.key)) {
        currentFields.push(field);
      }
    }
    list.push({ title: currentTitle, description: currentDescription, fields: currentFields, isFirst: false, isLast: false });
    const filtered = list.filter((p, idx) => idx === 0 || p.fields.length > 0);
    filtered.forEach((p, i) => {
      p.isFirst = i === 0;
      p.isLast = i === filtered.length - 1;
    });
    return filtered;
  }

  private validatePage(page: Page): boolean {
    for (const f of page.fields) delete this.fieldErrors[f.key];
    for (const f of page.fields) {
      const v = this.values[f.key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) this.fieldErrors[f.key] = "Ce champ est requis.";
    }
    return page.fields.every((f) => !this.fieldErrors[f.key]);
  }

  private validateAll(): boolean {
    if (!this.form) return false;
    const visible = this.computeVisibleKeys();
    this.fieldErrors = {};
    for (const f of this.form.schema) {
      if (f.type === "section" || !visible.has(f.key)) continue;
      const v = this.values[f.key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (f.required && empty) this.fieldErrors[f.key] = "Ce champ est requis.";
    }
    return Object.keys(this.fieldErrors).length === 0;
  }

  private onFieldChange(revalidate = true) {
    const pages = this.computePages();
    if (this.currentPageIndex >= pages.length) this.currentPageIndex = Math.max(0, pages.length - 1);
    if (revalidate) this.render();
  }

  private async submit() {
    this.submitError = null;
    if (!this.form) return;
    if (this.form.requireConsent && !this.consent) {
      this.submitError = "Vous devez accepter le consentement pour soumettre.";
      this.render();
      return;
    }
    if (!this.validateAll()) {
      const pages = this.computePages();
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].fields.some((f) => this.fieldErrors[f.key])) {
          this.currentPageIndex = i;
          break;
        }
      }
      this.render();
      return;
    }
    this.submitting = true;
    this.render();
    try {
      const visible = this.computeVisibleKeys();
      const cleanValues: Record<string, unknown> = {};
      for (const k of Object.keys(this.values)) {
        const baseKey = k.endsWith(JUSTIFICATION_SUFFIX) ? k.slice(0, -JUSTIFICATION_SUFFIX.length) : k;
        if (visible.has(baseKey)) cleanValues[k] = this.values[k];
      }
      const cleanFiles: Record<string, unknown> = {};
      for (const k of Object.keys(this.files)) if (visible.has(k)) cleanFiles[k] = this.files[k];

      const res = await fetch(`${this.apiBase}/api/v1/responses/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: this.form.id,
          data: cleanValues,
          consent: this.consent,
          files: Object.keys(cleanFiles).length ? cleanFiles : undefined,
        }),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        this.submitted = true;
        this.onSubmitCb?.(payload.responseId);
      } else {
        this.submitError = payload.error ?? "La soumission a échoué.";
        if (Array.isArray(payload.details)) {
          this.fieldErrors = {};
          for (const d of payload.details) if (d.key) this.fieldErrors[d.key] = d.message;
          const pages = this.computePages();
          for (let i = 0; i < pages.length; i++) {
            if (pages[i].fields.some((f) => this.fieldErrors[f.key])) {
              this.currentPageIndex = i;
              break;
            }
          }
        }
      }
    } catch {
      this.submitError = "Erreur réseau lors de la soumission.";
    } finally {
      this.submitting = false;
      this.render();
    }
  }

  private async uploadFiles(field: FieldDefinition, fileList: FileList) {
    const container = this.root.querySelector(`[data-upload-status="${field.key}"]`);
    if (container) container.textContent = "Envoi en cours…";
    try {
      const refs: { file: unknown; signature: string }[] = [];
      const names: string[] = [];
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append("formId", this.form!.id);
        fd.append("fieldKey", field.key);
        fd.append("file", file);
        const res = await fetch(`${this.apiBase}/api/v1/uploads`, { method: "POST", body: fd });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? "Échec de l'envoi.");
        refs.push({ file: payload.file, signature: payload.signature });
        names.push(file.name);
      }
      this.files[field.key] = refs;
      this.values[field.key] = names;
      if (container) container.textContent = `✓ ${names.join(", ")}`;
    } catch (err) {
      if (container) container.textContent = err instanceof Error ? err.message : "Échec de l'envoi.";
    }
  }

  // ------------------------------------------------------------------
  // Rendu
  // ------------------------------------------------------------------

  private render() {
    this.root.replaceChildren();

    if (this.loading) {
      this.root.append(this.renderSkeleton());
      return;
    }
    if (this.statusError === 401 || this.statusError === 403) {
      this.root.append(
        el(
          "div",
          { class: "of-card of-card-body of-center", style: "text-align:center" },
          el("p", {}, this.loadError ?? "Accès restreint."),
          el("p", { class: "of-lang-note" }, "Ce formulaire nécessite une connexion et ne peut pas être rempli via ce widget."),
        ),
      );
      return;
    }
    if (this.loadError) {
      this.root.append(el("div", { class: "of-card of-card-body" }, el("p", { class: "of-error", style: "margin:0" }, this.loadError)));
      return;
    }
    if (this.submitted) {
      this.root.append(
        el(
          "div",
          { class: "of-card" },
          el(
            "div",
            { class: "of-success" },
            el("h2", { style: "margin:0 0 .5rem;font-size:1.5rem;font-weight:700" }, "Merci !"),
            el("p", { style: "color:#5f6368;margin:0" }, "Votre réponse a bien été enregistrée."),
          ),
        ),
      );
      return;
    }
    if (!this.form) return;

    const pages = this.computePages();
    const page = pages[this.currentPageIndex];
    if (!page) return;

    this.root.append(this.renderHeader(page));

    const form = el("form", {});
    form.addEventListener("submit", (e) => e.preventDefault());

    if (pages.length > 1) {
      const pct = Math.round(((this.currentPageIndex + 1) / pages.length) * 100);
      form.append(
        el(
          "div",
          { class: "of-progress-wrap" },
          el(
            "div",
            { class: "of-progress-label" },
            el("span", {}, "Progression"),
            el("span", {}, `Page ${this.currentPageIndex + 1} sur ${pages.length}`),
          ),
          el("div", { class: "of-progress-bar" }, el("div", { class: "of-progress-fill", style: `width:${pct}%` })),
        ),
      );
    }

    for (const field of page.fields) {
      form.append(this.renderField(field));
    }

    if (page.isLast && this.form.requireConsent) {
      const checkbox = el("input", { type: "checkbox" }) as HTMLInputElement;
      checkbox.checked = this.consent;
      checkbox.addEventListener("change", () => {
        this.consent = checkbox.checked;
      });
      const label = el(
        "label",
        { class: "of-consent" },
        checkbox,
        el("span", {}, this.form.consentText || "J'accepte que mes réponses soient traitées conformément au RGPD."),
      );
      form.append(label);
    }

    if (this.submitError) form.append(el("p", { class: "of-error" }, this.submitError));

    const actionsLeft = el("div", { class: "of-actions-left" });
    if (!page.isFirst) {
      const prev = el("button", { class: "of-btn of-btn-secondary", type: "button" }, "Précédent");
      prev.addEventListener("click", () => {
        this.currentPageIndex -= 1;
        this.render();
      });
      actionsLeft.append(prev);
    }
    if (!page.isLast) {
      const next = el("button", { class: "of-btn of-btn-primary", type: "button" }, "Suivant");
      next.addEventListener("click", () => {
        if (this.validatePage(page)) {
          this.currentPageIndex += 1;
          this.render();
        } else {
          this.render();
        }
      });
      actionsLeft.append(next);
    } else {
      const submitBtn = el(
        "button",
        { class: "of-btn of-btn-primary", type: "button" },
        this.submitting ? "Envoi…" : "Envoyer",
      ) as HTMLButtonElement;
      submitBtn.disabled = this.submitting;
      submitBtn.addEventListener("click", () => this.submit());
      actionsLeft.append(submitBtn);
    }

    form.append(
      el(
        "div",
        { class: "of-actions" },
        actionsLeft,
        el("span", { class: "of-footer-note" }, "Sans tracker · Auto-hébergé · Open-source"),
      ),
    );

    this.root.append(form);
  }

  private renderSkeleton(): HTMLElement {
    return el(
      "div",
      { class: "of-skeleton" },
      el(
        "div",
        { class: "of-card" },
        el("div", { class: "of-banner" }),
        el(
          "div",
          { class: "of-card-body" },
          el("div", { class: "of-skel-block", style: "height:1.5rem;width:70%;margin-bottom:.75rem" }),
          el("div", { class: "of-skel-block", style: "height:.875rem;width:100%" }),
        ),
      ),
    );
  }

  private renderHeader(page: Page): HTMLElement {
    return el(
      "div",
      { class: "of-card" },
      el("div", { class: "of-banner" }),
      el(
        "div",
        { class: "of-card-body" },
        el("h1", { class: "of-title" }, page.title),
        page.description ? el("p", { class: "of-desc" }, page.description) : "",
        page.isFirst && this.form!.isAnonymized
          ? el("p", { class: "of-anon-badge" }, "🔒 Réponses anonymes — aucune donnée d'identification n'est collectée.")
          : "",
      ),
    );
  }

  private renderField(field: FieldDefinition): HTMLElement {
    const wrap = el("div", { class: "of-field" });
    wrap.append(
      el("label", { class: "of-label" }, field.label, field.required ? el("span", { class: "of-required" }, " *") : ""),
    );
    if (field.description) wrap.append(el("p", { class: "of-field-desc" }, field.description));

    wrap.append(this.renderInput(field));

    if (
      field.requireJustification &&
      ["select", "radio", "checkbox", "grid", "checkbox_grid"].includes(field.type)
    ) {
      const ta = el("textarea", { class: "of-textarea", rows: "2", placeholder: "Justifiez votre réponse...", style: "margin-top:.5rem;font-size:.8rem" }) as HTMLTextAreaElement;
      ta.value = (this.values[`${field.key}${JUSTIFICATION_SUFFIX}`] as string) ?? "";
      ta.addEventListener("input", () => {
        this.values[`${field.key}${JUSTIFICATION_SUFFIX}`] = ta.value;
      });
      wrap.append(ta);
    }

    if (this.fieldErrors[field.key]) wrap.append(el("p", { class: "of-error" }, this.fieldErrors[field.key]));
    return wrap;
  }

  private renderInput(field: FieldDefinition): HTMLElement {
    const current = this.values[field.key];

    switch (field.type) {
      case "short_text":
      case "email": {
        const input = el("input", {
          class: "of-input",
          type: field.type === "email" ? "email" : "text",
          placeholder: field.placeholder ?? "",
        }) as HTMLInputElement;
        input.value = typeof current === "string" ? current : "";
        input.addEventListener("input", () => (this.values[field.key] = input.value));
        input.addEventListener("change", () => this.onFieldChange());
        return input;
      }
      case "paragraph": {
        const ta = el("textarea", { class: "of-textarea", rows: "4", placeholder: field.placeholder ?? "" }) as HTMLTextAreaElement;
        ta.value = typeof current === "string" ? current : "";
        ta.addEventListener("input", () => (this.values[field.key] = ta.value));
        ta.addEventListener("change", () => this.onFieldChange());
        return ta;
      }
      case "number": {
        const input = el("input", { class: "of-input", type: "number" }) as HTMLInputElement;
        if (field.validation?.min != null) input.min = String(field.validation.min);
        if (field.validation?.max != null) input.max = String(field.validation.max);
        input.value = current != null ? String(current) : "";
        input.addEventListener("input", () => (this.values[field.key] = input.value === "" ? "" : Number(input.value)));
        input.addEventListener("change", () => this.onFieldChange());
        return input;
      }
      case "date":
      case "datetime": {
        const row = el("div", { class: "of-row" });
        const input = el("input", { class: "of-input", type: field.type === "date" ? "date" : "datetime-local" }) as HTMLInputElement;
        input.value = typeof current === "string" ? current : "";
        input.addEventListener("change", () => {
          this.values[field.key] = input.value;
          this.onFieldChange();
        });
        row.append(input);
        if (field.allowAutoToday) {
          const btn = el("button", { class: "of-btn of-btn-secondary", type: "button", style: "padding:.4rem .75rem;font-size:.75rem" }, field.type === "date" ? "Aujourd'hui" : "Maintenant");
          btn.addEventListener("click", () => {
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const v = field.type === "date" ? datePart : `${datePart}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
            input.value = v;
            this.values[field.key] = v;
            this.onFieldChange();
          });
          row.append(btn);
        }
        return row;
      }
      case "select": {
        const isOther = typeof current === "string" && (current === OTHER_KEY || current.startsWith(OTHER_KEY + ":"));
        const select = el("select", { class: "of-select" }) as HTMLSelectElement;
        const placeholderOpt = el("option", { value: "", disabled: "true" }, "— Choisir —") as HTMLOptionElement;
        if (!current) placeholderOpt.selected = true;
        select.append(placeholderOpt);
        for (const opt of field.options ?? []) select.append(el("option", { value: opt.value }, opt.label));
        if (field.allowOther) select.append(el("option", { value: OTHER_KEY }, "Autre…"));
        select.value = isOther ? OTHER_KEY : typeof current === "string" ? current : "";

        const wrap = el("div", {});
        wrap.append(select);
        let otherInput: HTMLInputElement | null = null;
        const syncOther = () => {
          if (otherInput) otherInput.remove();
          if (field.allowOther && select.value === OTHER_KEY) {
            otherInput = el("input", { class: "of-input", type: "text", placeholder: "Précisez votre réponse", style: "margin-top:.5rem;font-size:.8rem" }) as HTMLInputElement;
            const existing = typeof current === "string" && current.startsWith(OTHER_KEY + ":") ? current.slice(OTHER_KEY.length + 1) : "";
            otherInput.value = existing;
            otherInput.addEventListener("input", () => {
              this.values[field.key] = `${OTHER_KEY}:${otherInput!.value}`;
            });
            wrap.append(otherInput);
          }
        };
        select.addEventListener("change", () => {
          this.values[field.key] = select.value === OTHER_KEY ? (field.allowOther ? `${OTHER_KEY}:` : OTHER_KEY) : select.value;
          syncOther();
          this.onFieldChange();
        });
        syncOther();
        return wrap;
      }
      case "radio": {
        const wrap = el("div", {});
        for (const opt of field.options ?? []) {
          const input = el("input", { type: "radio", name: field.key, value: opt.value }) as HTMLInputElement;
          input.checked = current === opt.value;
          input.addEventListener("change", () => {
            this.values[field.key] = opt.value;
            this.onFieldChange();
          });
          wrap.append(el("label", { class: "of-option" }, input, opt.label));
        }
        if (field.allowOther) {
          const isOther = typeof current === "string" && (current === OTHER_KEY || current.startsWith(OTHER_KEY + ":"));
          const input = el("input", { type: "radio", name: field.key, value: OTHER_KEY }) as HTMLInputElement;
          input.checked = isOther;
          const otherText = el("input", { class: "of-input", type: "text", placeholder: "Précisez votre réponse", style: "margin-top:.375rem;font-size:.8rem" }) as HTMLInputElement;
          otherText.style.display = isOther ? "block" : "none";
          otherText.value = isOther && typeof current === "string" && current.startsWith(OTHER_KEY + ":") ? current.slice(OTHER_KEY.length + 1) : "";
          input.addEventListener("change", () => {
            this.values[field.key] = OTHER_KEY;
            otherText.style.display = "block";
            this.onFieldChange();
          });
          otherText.addEventListener("input", () => {
            this.values[field.key] = `${OTHER_KEY}:${otherText.value}`;
          });
          const col = el("div", { style: "display:flex;flex-direction:column;gap:.25rem" });
          col.append(el("label", { class: "of-option", style: "margin:0" }, input, "Autre…"), otherText);
          wrap.append(col);
        }
        return wrap;
      }
      case "checkbox": {
        const wrap = el("div", {});
        const arr = Array.isArray(current) ? (current as string[]) : [];
        for (const opt of field.options ?? []) {
          const input = el("input", { type: "checkbox", value: opt.value }) as HTMLInputElement;
          input.checked = arr.includes(opt.value);
          input.addEventListener("change", () => {
            const next = Array.isArray(this.values[field.key]) ? [...(this.values[field.key] as string[])] : [];
            if (input.checked) next.push(opt.value);
            else next.splice(next.indexOf(opt.value), 1);
            this.values[field.key] = next;
            this.onFieldChange();
          });
          wrap.append(el("label", { class: "of-option" }, input, opt.label));
        }
        return wrap;
      }
      case "linear_scale": {
        const scaleMin = field.scale?.min ?? 1;
        const scaleMax = field.scale?.max ?? 5;
        const wrapOuter = el("div", {});
        const row = el("div", { class: "of-linear-scale" });
        for (let n = scaleMin; n <= scaleMax; n++) {
          const btn = el("button", { class: `of-scale-btn${current === n ? " active" : ""}`, type: "button" }, String(n));
          btn.addEventListener("click", () => {
            this.values[field.key] = current === n ? null : n;
            this.onFieldChange();
          });
          row.append(btn);
        }
        wrapOuter.append(row);
        if (field.scale?.minLabel || field.scale?.maxLabel) {
          wrapOuter.append(
            el("div", { class: "of-scale-labels" }, el("span", {}, field.scale?.minLabel ?? ""), el("span", {}, field.scale?.maxLabel ?? "")),
          );
        }
        return wrapOuter;
      }
      case "grid":
      case "checkbox_grid": {
        const isMulti = field.type === "checkbox_grid";
        const table = el("table", { class: "of-table" });
        const thead = el("tr", {}, el("th", {}, ""));
        for (const col of field.grid?.columns ?? []) thead.append(el("th", {}, col));
        table.append(el("thead", {}, thead));
        const tbody = el("tbody", {});
        for (const row of field.grid?.rows ?? []) {
          const tr = el("tr", {}, el("td", {}, row));
          for (const col of field.grid?.columns ?? []) {
            const td = el("td", {});
            if (isMulti) {
              const rowVals = ((current as Record<string, string[]>)?.[row]) ?? [];
              const input = el("input", { type: "checkbox" }) as HTMLInputElement;
              input.checked = rowVals.includes(col);
              input.addEventListener("change", () => {
                const obj = (typeof this.values[field.key] === "object" && this.values[field.key] ? { ...(this.values[field.key] as Record<string, string[]>) } : {}) as Record<string, string[]>;
                if (!obj[row]) obj[row] = [];
                if (input.checked) obj[row] = [...obj[row], col];
                else obj[row] = obj[row].filter((v) => v !== col);
                this.values[field.key] = obj;
                this.onFieldChange();
              });
              td.append(input);
            } else {
              const rowVal = (current as Record<string, string>)?.[row];
              const input = el("input", { type: "radio", name: `${field.key}_${row}` }) as HTMLInputElement;
              input.checked = rowVal === col;
              input.addEventListener("change", () => {
                const obj = (typeof this.values[field.key] === "object" && this.values[field.key] ? { ...(this.values[field.key] as Record<string, string>) } : {}) as Record<string, string>;
                obj[row] = col;
                this.values[field.key] = obj;
                this.onFieldChange();
              });
              td.append(input);
            }
            tr.append(td);
          }
          tbody.append(tr);
        }
        table.append(tbody);
        return el("div", { style: "overflow-x:auto" }, table);
      }
      case "file": {
        const wrap = el("div", {});
        const input = el("input", { class: "of-input", type: "file", multiple: "true" }) as HTMLInputElement;
        if (field.accept?.length) input.accept = field.accept.join(",");
        input.addEventListener("change", () => {
          if (input.files?.length) this.uploadFiles(field, input.files);
        });
        wrap.append(input, el("p", { "data-upload-status": field.key, style: "margin:.375rem 0 0;font-size:.75rem;color:#5f6368" }));
        return wrap;
      }
      case "signature": {
        const wrap = el("div", { style: "display:flex;flex-direction:column;gap:.5rem" });
        const canvas = el("canvas", { class: "of-signature-canvas" }) as HTMLCanvasElement;
        wrap.append(canvas);
        const controls = el("div", { style: "display:flex;justify-content:space-between;align-items:center" });
        controls.append(
          el("span", { style: "font-size:.75rem;color:#5f6368" }, "Dessinez votre signature ci-dessus"),
        );
        const clearBtn = el("button", { class: "of-btn of-btn-secondary", type: "button", style: "padding:.3rem .6rem;font-size:.7rem" }, "Effacer");
        controls.append(clearBtn);
        wrap.append(controls);

        requestAnimationFrame(() => {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.strokeStyle = "#4f46e5";
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          let drawing = false;
          const pos = (e: MouseEvent | TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            const p = "touches" in e ? e.touches[0] : e;
            return { x: p.clientX - rect.left, y: p.clientY - rect.top };
          };
          const start = (e: MouseEvent | TouchEvent) => {
            drawing = true;
            const { x, y } = pos(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
          };
          const move = (e: MouseEvent | TouchEvent) => {
            if (!drawing) return;
            e.preventDefault();
            const { x, y } = pos(e);
            ctx.lineTo(x, y);
            ctx.stroke();
          };
          const stop = () => {
            if (!drawing) return;
            drawing = false;
            this.values[field.key] = canvas.toDataURL("image/png");
          };
          canvas.addEventListener("mousedown", start);
          canvas.addEventListener("mousemove", move);
          window.addEventListener("mouseup", stop);
          canvas.addEventListener("touchstart", start);
          canvas.addEventListener("touchmove", move);
          window.addEventListener("touchend", stop);
          clearBtn.addEventListener("click", () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.values[field.key] = "";
          });
        });
        return wrap;
      }
      case "address": {
        const wrap = el("div", { class: "of-suggestions" });
        const input = el("input", { class: "of-input", type: "text", placeholder: field.placeholder ?? "Rechercher une adresse...", autocomplete: "off" }) as HTMLInputElement;
        input.value = typeof current === "string" ? current : "";
        const list = el("ul", { class: "of-suggestions-list", style: "display:none" });
        wrap.append(input, list);
        let debounce: ReturnType<typeof setTimeout> | undefined;
        input.addEventListener("input", () => {
          this.values[field.key] = input.value;
          const query = input.value;
          if (debounce) clearTimeout(debounce);
          if (query.length < 3) {
            list.replaceChildren();
            list.style.display = "none";
            return;
          }
          debounce = setTimeout(async () => {
            try {
              const res = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
              const data = await res.json();
              const labels: string[] = (data.features ?? []).map((f: { properties: { label: string } }) => f.properties.label);
              list.replaceChildren();
              for (const label of labels) {
                const li = el("li", {});
                const btn = el("button", { type: "button" }, label);
                btn.addEventListener("click", () => {
                  input.value = label;
                  this.values[field.key] = label;
                  list.style.display = "none";
                  this.onFieldChange(false);
                });
                li.append(btn);
                list.append(li);
              }
              list.style.display = labels.length ? "block" : "none";
            } catch {
              // pas de réseau : pas de suggestions
            }
          }, 250);
        });
        return wrap;
      }
      case "stripe_payment": {
        const amount = field.validation?.min ?? 10;
        const paid = !!(current && typeof current === "object" && (current as { paid?: boolean }).paid);
        const wrap = el("div", { style: "border:1px solid #dadce0;border-radius:.75rem;padding:1rem;background:#fafafa" });
        if (paid) {
          wrap.append(
            el(
              "div",
              { style: "color:#137333;background:#e6f4ea;border:1px solid #ceead6;padding:.75rem;border-radius:.5rem;font-size:.75rem;font-weight:600" },
              `Paiement validé (mock) — ${(current as { transactionId: string }).transactionId}`,
            ),
          );
        } else {
          const amountLine = el("p", { style: "margin:0 0 .75rem;font-weight:700" }, `Montant à régler : ${amount} €`);
          const payBtn = el("button", { class: "of-btn of-btn-primary", type: "button" }, `Payer ${amount} € (démo)`) as HTMLButtonElement;
          payBtn.addEventListener("click", () => {
            payBtn.disabled = true;
            payBtn.textContent = "Traitement…";
            setTimeout(() => {
              this.values[field.key] = {
                paid: true,
                amount,
                currency: "EUR",
                transactionId: "ch_mock_" + Math.random().toString(36).slice(2, 10).toUpperCase(),
                paidAt: new Date().toISOString(),
              };
              this.onFieldChange();
            }, 1200);
          });
          wrap.append(
            amountLine,
            el("p", { style: "margin:0 0 .75rem;font-size:.7rem;color:#5f6368" }, "Module de paiement de démonstration (aucune transaction réelle)."),
            payBtn,
          );
        }
        return wrap;
      }
      default:
        return el("p", { class: "of-error" }, `Type de champ non supporté par le widget : ${field.type}`);
    }
  }
}

function inferApiBase(host: Element): string {
  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.src) {
    try {
      return new URL(script.src).origin;
    } catch {
      /* ignore */
    }
  }
  const w = window as unknown as { OpenFormsConfig?: { apiBase?: string } };
  if (w.OpenFormsConfig?.apiBase) return w.OpenFormsConfig.apiBase;
  return window.location.origin;
}

const mounted = new WeakSet<Element>();

function mount(target: Element, opts: WidgetOptions): OpenFormsWidget {
  mounted.add(target);
  return new OpenFormsWidget(target as HTMLElement, opts);
}

function init() {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-openforms]"));
  for (const node of nodes) {
    if (mounted.has(node)) continue;
    const slug = node.getAttribute("data-openforms");
    if (!slug) continue;
    const apiBase = node.getAttribute("data-openforms-api") ?? undefined;
    mount(node, { slug, apiBase });
  }
}

declare global {
  interface Window {
    OpenForms: { mount: typeof mount; init: typeof init };
  }
}

window.OpenForms = { mount, init };

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
