/**
 * État d'authentification global, basé sur les runes Svelte 5.
 * Exporté comme objet réactif : les composants lisent `auth.user`, `auth.ready`…
 */
import { api } from "../api/client.ts";
import { bindCacheOwner } from "../localCache.ts";
import { forgetResponses } from "../responsesCache.ts";
import type { User } from "../types.ts";

class AuthState {
  user = $state<User | null>(null);
  ready = $state(false);

  get isAuthenticated() {
    return this.user !== null;
  }
  get isSuperAdmin() {
    return this.user?.role === "SUPER_ADMIN";
  }

  /** Récupère la session courante au chargement de l'application. */
  async refresh() {
    try {
      const res = await api.me();
      await this.#setUser(res.authenticated && res.user ? res.user : null);
    } catch {
      this.user = null;
    } finally {
      this.ready = true;
    }
  }

  /**
   * Le cache local (réponses, formulaires) appartient au compte connecté : on
   * le lie avant de rendre la main aux pages, qui le lisent aussitôt.
   */
  async #setUser(user: User | null) {
    if (user?.id !== this.user?.id) forgetResponses();
    await bindCacheOwner(user?.id ?? null);
    this.user = user;
  }

  async login(email: string, password: string) {
    const res = await api.login(email, password);
    await this.#setUser(res.user);
    return res.user;
  }

  async register(email: string, password: string, displayName?: string) {
    const res = await api.register(email, password, displayName);
    await this.#setUser(res.user);
    return res.user;
  }

  async acceptInvite(token: string, password: string) {
    const res = await api.acceptInvite(token, password);
    await this.#setUser(res.user);
    return res.user;
  }

  async logout() {
    await api.logout().catch(() => {});
    await this.#setUser(null);
  }
}

export const auth = new AuthState();
