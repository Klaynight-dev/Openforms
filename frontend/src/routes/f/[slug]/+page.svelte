<script lang="ts">
  /**
   * Formulaire public tel qu'il s'affiche sur l'instance.
   * Le rendu lui-même vit dans PublicForm : la page /embed/[slug], destinée
   * aux sites tiers, sert exactement le même formulaire.
   */
  import { page } from "$app/stores";
  import PublicForm from "$components/PublicForm.svelte";
</script>

<PublicForm slug={$page.params.slug as string} />
