<script lang="ts">
  import { goto } from "$app/navigation";
  import { IconLeaf, IconTable, IconShield, IconEdit } from "$lib/icons.ts";
</script>

<svelte:head><title>Formulaire Humanitour</title></svelte:head>

<div class="min-h-screen bg-[color:var(--surface-bg)]">
  <main class="mx-auto max-w-4xl px-6 py-20 text-center">
    <div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-white">
      <IconLeaf size={34} weight="fill" />
    </div>
    <h1 class="mb-3 text-4xl font-bold tracking-tight text-[color:var(--ink)]">Formulaire Humanitour</h1>
    <p class="mx-auto mb-8 max-w-xl text-[color:var(--muted)]">
      Une alternative <strong>éthique</strong> et open-source à Google Forms : respectueuse de la vie
      privée, auto-hébergeable, sans tracker tiers. Créez des formulaires, collectez et analysez les
      réponses dans un tableur intégré.
    </p>
    <div class="flex justify-center gap-3">
      <button class="btn-primary" onclick={() => goto("/admin")}>Espace administration</button>
    </div>

    <div class="mt-16 grid gap-4 text-left sm:grid-cols-3">
      <div class="card">
        <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <IconEdit size={22} />
        </div>
        <h3 class="font-semibold">Builder Drag &amp; Drop</h3>
        <p class="mt-1 text-sm text-[color:var(--muted)]">11 types de champs, validation avancée, regex personnalisées.</p>
      </div>
      <div class="card">
        <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <IconTable size={22} />
        </div>
        <h3 class="font-semibold">Tableur intégré</h3>
        <p class="mt-1 text-sm text-[color:var(--muted)]">Édition en direct, tri, filtres, formules, import/export Excel.</p>
      </div>
      <div class="card">
        <div class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <IconShield size={22} />
        </div>
        <h3 class="font-semibold">RGPD par design</h3>
        <p class="mt-1 text-sm text-[color:var(--muted)]">Consentement explicite, anonymisation, chiffrement au repos.</p>
      </div>
    </div>
  </main>
</div>
