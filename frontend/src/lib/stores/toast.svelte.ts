/**
 * File de notifications éphémères.
 *
 * Remplace les `alert()` bloquants : un message non modal, empilable, qui
 * n'interrompt pas la saisie. Monté une seule fois via `ToastHost` dans le
 * layout racine.
 */

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Action facultative affichée à droite du message (ex. « Annuler »). */
  action?: { label: string; run: () => void };
}

const DURATIONS: Record<ToastKind, number> = {
  success: 3200,
  info: 4000,
  // Une erreur reste plus longtemps : l'utilisateur doit avoir le temps de lire.
  error: 6500,
};

let nextId = 1;

class ToastStore {
  items = $state<Toast[]>([]);

  push(kind: ToastKind, message: string, action?: Toast["action"]): number {
    const id = nextId++;
    this.items = [...this.items, { id, kind, message, action }];
    setTimeout(() => this.dismiss(id), DURATIONS[kind]);
    return id;
  }

  success(message: string, action?: Toast["action"]) {
    return this.push("success", message, action);
  }
  error(message: unknown, action?: Toast["action"]) {
    const text =
      message instanceof Error
        ? message.message
        : typeof message === "string"
          ? message
          : "Une erreur inattendue est survenue.";
    return this.push("error", text, action);
  }
  info(message: string, action?: Toast["action"]) {
    return this.push("info", message, action);
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

export const toasts = new ToastStore();
