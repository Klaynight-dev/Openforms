/**
 * État d'authentification global, basé sur les runes Svelte 5.
 * Exporté comme objet réactif : les composants lisent `auth.user`, `auth.ready`…
 */
import { api } from "../api/client.ts";
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
      this.user = res.authenticated && res.user ? res.user : null;
    } catch {
      this.user = null;
    } finally {
      this.ready = true;
    }
  }

  async login(email: string, password: string) {
    const res = await api.login(email, password);
    this.user = res.user;
    return res.user;
  }

  async logout() {
    await api.logout().catch(() => {});
    this.user = null;
  }
}

export const auth = new AuthState();
