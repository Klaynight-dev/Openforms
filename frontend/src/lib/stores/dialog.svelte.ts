/**
 * Remplaçants de `confirm()` et `prompt()`.
 *
 * Les dialogues natifs bloquent le thread, ignorent la charte, ne sont pas
 * traduisibles et, sous certains navigateurs, peuvent être désactivés par
 * l'utilisateur — auquel cas une confirmation renvoie silencieusement `false`.
 * Ces deux fonctions gardent la même ergonomie d'appel (`await`) tout en
 * passant par `DialogHost`, monté dans le layout racine.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructrice : bouton rouge. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  label: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  confirmLabel?: string;
  maxLength?: number;
  /** Refuse la validation d'une valeur vide (par défaut : oui). */
  required?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  kind: "confirm";
  resolve: (ok: boolean) => void;
}

interface PromptRequest extends PromptOptions {
  kind: "prompt";
  resolve: (value: string | null) => void;
}

export type DialogRequest = ConfirmRequest | PromptRequest;

class DialogStore {
  /** Dialogue affiché, ou null. Un seul à la fois : ils sont modaux. */
  current = $state<DialogRequest | null>(null);

  answer(value: boolean | string | null) {
    const request = this.current;
    this.current = null;
    if (!request) return;
    if (request.kind === "confirm") request.resolve(value === true);
    else request.resolve(typeof value === "string" ? value : null);
  }
}

export const dialogs = new DialogStore();

/** Confirmation. Résout `false` si l'utilisateur annule ou ferme. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    dialogs.current = { kind: "confirm", ...options, resolve };
  });
}

/** Saisie d'une valeur. Résout `null` si l'utilisateur annule ou ferme. */
export function askPrompt(options: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    dialogs.current = { kind: "prompt", ...options, resolve };
  });
}
