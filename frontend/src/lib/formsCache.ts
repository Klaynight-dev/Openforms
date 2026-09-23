/**
 * Liste des formulaires, gardée dans le cache local (voir localCache.ts) pour
 * que le tableau de bord s'affiche sans attendre l'API.
 */
import { api } from "./api/client.ts";
import { cacheGet, cacheSet } from "./localCache.ts";
import type { FormSummary } from "./types.ts";

const KEY = "forms";

/** Dernière liste connue, sans réseau. */
export function peekForms(): Promise<FormSummary[] | undefined> {
  return cacheGet<FormSummary[]>(KEY);
}

/** Recharge la liste depuis l'API et la mémorise. */
export async function refreshForms(): Promise<FormSummary[]> {
  const { forms } = await api.listForms();
  void cacheSet(KEY, forms);
  return forms;
}

/** Liste en cache si elle existe, sinon celle de l'API. */
export async function getFormsCached(): Promise<FormSummary[]> {
  return (await peekForms()) ?? refreshForms();
}

/** Remplace la liste mémorisée après une modification locale (publication, suppression…). */
export function rememberForms(forms: FormSummary[]): void {
  void cacheSet(KEY, forms);
}
