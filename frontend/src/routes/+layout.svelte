<script lang="ts">
  import "../app.css";
  import ToastHost from "$lib/components/ToastHost.svelte";
  import DialogHost from "$lib/components/DialogHost.svelte";
  let { children } = $props();
</script>

{@render children()}

<!-- Notifications et dialogues : montés une seule fois pour toute l'app. -->
<ToastHost />
<DialogHost />
