/**
 * Pile d'annulation d'un éditeur (Ctrl+Z / Ctrl+Maj+Z).
 *
 * Les modifications rapprochées sont fusionnées en une seule entrée : sans ce
 * regroupement, une phrase tapée dans un titre remplirait l'historique lettre
 * par lettre et il faudrait autant d'annulations pour l'effacer.
 */

export interface EditHistoryOptions<T> {
  /** Capture l'état courant de l'éditeur (déjà détaché de la réactivité). */
  snapshot: () => T;
  /** Réapplique un état capturé. */
  apply: (value: T) => void;
  /** Inactivité au bout de laquelle une entrée est figée. */
  debounceMs?: number;
  /** Nombre d'états conservés en arrière. */
  limit?: number;
}

/** Détache la valeur de toute référence partagée avec l'état de l'éditeur. */
function detach<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class EditHistory<T> {
  canUndo = $state(false);
  canRedo = $state(false);

  #past: T[] = [];
  #future: T[] = [];
  #current: T | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: EditHistoryOptions<T>) {}

  /** Fixe le point de départ (chargement du formulaire) sans créer d'entrée. */
  reset(): void {
    this.#cancel();
    this.#past = [];
    this.#future = [];
    this.#current = detach(this.options.snapshot());
    this.#sync();
  }

  /** À appeler à chaque modification de l'éditeur. */
  record(): void {
    this.#cancel();
    this.#timer = setTimeout(() => this.#commit(), this.options.debounceMs ?? 500);
  }

  undo(): boolean {
    this.#commit();
    const previous = this.#past.pop();
    if (previous === undefined) return false;
    if (this.#current !== null) this.#future.push(this.#current);
    this.#restore(previous);
    return true;
  }

  redo(): boolean {
    this.#commit();
    const next = this.#future.pop();
    if (next === undefined) return false;
    if (this.#current !== null) this.#past.push(this.#current);
    this.#restore(next);
    return true;
  }

  /** Libère le minuteur en attente (démontage de l'éditeur). */
  dispose(): void {
    this.#cancel();
  }

  #restore(value: T): void {
    this.#current = value;
    this.options.apply(detach(value));
    this.#sync();
  }

  /** Fige l'état courant. Sans changement réel, ne fait rien : l'annulation
   *  repasse ici via la réactivité et ne doit pas se réempiler elle-même. */
  #commit(): void {
    this.#cancel();
    const next = detach(this.options.snapshot());
    if (this.#current !== null) {
      if (JSON.stringify(next) === JSON.stringify(this.#current)) return;
      this.#past.push(this.#current);
      if (this.#past.length > (this.options.limit ?? 100)) this.#past.shift();
      this.#future = [];
    }
    this.#current = next;
    this.#sync();
  }

  #cancel(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #sync(): void {
    this.canUndo = this.#past.length > 0;
    this.canRedo = this.#future.length > 0;
  }
}
