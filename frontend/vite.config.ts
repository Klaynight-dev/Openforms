import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { sveltePhosphorOptimize } from "phosphor-svelte/vite";

export default defineConfig({
  // `import { X } from "phosphor-svelte"` passe par l'index du paquet : sans ce
  // plugin, Vite compile ses 6 000 composants à chaque build (l'essentiel du
  // temps de build). Il réécrit l'import en `phosphor-svelte/lib/X`.
  plugins: [sveltePhosphorOptimize(), sveltekit()],
  css: {
    preprocessorOptions: {
      // Utilise l'API Sass moderne (supprime l'avertissement "legacy JS API").
      scss: { api: "modern" },
    },
  },
  server: {
    port: 5173,
    // En dev, on parle directement à l'API Elysia (http://localhost:3000)
    // via le client typé avec credentials- pas de proxy nécessaire.
  },
});
