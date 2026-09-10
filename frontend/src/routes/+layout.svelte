<script lang="ts">
  import "../app.css";
  import ToastHost from "$lib/components/ToastHost.svelte";
  let { children } = $props();
</script>

{@render children()}

<!-- Pile de notifications globale : montée une seule fois pour toute l'app. -->
<ToastHost />
