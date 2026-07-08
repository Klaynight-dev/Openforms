import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  css: {
    preprocessorOptions: {
      // Utilise l'API Sass moderne (supprime l'avertissement "legacy JS API").
      scss: { api: "modern" },
    },
  },
  server: {
    port: 5173,
    // En dev, on parle directement à l'API Elysia (http://localhost:3000)
    // via le client typé avec credentials — pas de proxy nécessaire.
  },
});
