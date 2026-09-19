<script lang="ts">
  /**
   * Formulaire servi pour un `<iframe>` posé sur un site tiers.
   *
   * Même rendu que /f/:slug, sans le fond pleine page : le cadre s'ajuste à
   * la hauteur du contenu, que le composant remonte à la page hôte.
   * Une clé d'intégration peut être passée en `?key=ofe_…` pour afficher un
   * formulaire qui n'est pas public.
   */
  import { page } from "$app/stores";
  import PublicForm from "$components/PublicForm.svelte";

  let { data } = $props();

  let embedToken = $derived($page.url.searchParams.get("key"));
  let standaloneUrl = $derived(`${$page.url.origin}/f/${data.slug}`);
</script>

{#if data.embedEnabled}
  <PublicForm slug={data.slug} embed embedToken={embedToken} {standaloneUrl} />
{:else}
  <div class="p-6 text-center">
    <p class="text-sm text-[color:var(--muted)]">
      {#if data.notFound}
        Ce formulaire n'existe pas ou n'est pas publié.
      {:else}
        L'intégration de ce formulaire sur un site externe est désactivée.
      {/if}
    </p>
    {#if !data.notFound}
      <a class="mt-3 inline-block text-sm underline underline-offset-2" href={standaloneUrl} target="_blank" rel="noopener">
        Ouvrir le formulaire
      </a>
    {/if}
  </div>
{/if}
