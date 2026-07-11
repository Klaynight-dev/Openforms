<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$api/client.ts";
  import { auth } from "$lib/stores/auth.svelte.ts";
  import type { FormSummary, GlobalStats } from "$lib/types.ts";
  import {
    IconTable,
    IconEdit,
    IconTrash,
    IconLink,
    IconLock,
    IconEye,
    IconCheck,
    IconLeaf,
    IconClose,
    IconChartBar,
    IconUsers,
    IconChartLine,
    IconArrowUp,
    IconArrowDown,
    IconMinus,
    IconTrend,
    IconPlus,
    IconUser,
    IconDuplicate,
  } from "$lib/icons.ts";
  import * as echarts from "echarts";
  import type { Organization, OrganizationMember } from "$lib/types.ts";

  let forms = $state<FormSummary[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let openMenuId = $state<string | null>(null);

  // Stats
  let stats = $state<GlobalStats | null>(null);
  let statsLoading = $state(false);
  let lineChartEl = $state<HTMLDivElement>();
  let lineChart: echarts.ECharts | null = null;

  // Organisations
  let organizations = $state<Organization[]>([]);
  let activeOrgId = $state<string | null>(null);
  let activeOrgRole = $state<string | null>(null);
  let orgMembers = $state<OrganizationMember[]>([]);
  
  let showOrgModal = $state(false);
  let newOrgName = $state("");
  
  let showMembersModal = $state(false);
  let inviteEmail = $state("");
  let inviteRole = $state("MEMBER");
  let inviting = $state(false);

  let filteredForms = $derived(
    forms.filter((f) => {
      if (activeOrgId === null) {
        return !f.organizationId;
      } else {
        return f.organizationId === activeOrgId;
      }
    })
  );

  let canCreateForm = $derived(auth.isSuperAdmin || activeOrgId !== null);

  async function selectOrg(id: string) {
    activeOrgId = id;
    try {
      const res = await api.getOrganization(id);
      activeOrgRole = res.role;
    } catch {
      activeOrgRole = "MEMBER";
    }
  }

  async function createOrg() {
    if (!newOrgName.trim()) return;
    try {
      const res = await api.createOrganization(newOrgName);
      organizations = [res.organization, ...organizations];
      activeOrgId = res.organization.id;
      activeOrgRole = "OWNER";
      showOrgModal = false;
      newOrgName = "";
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible de créer l'organisation.");
    }
  }

  async function loadOrgMembers() {
    if (!activeOrgId) return;
    try {
      const res = await api.listOrgMembers(activeOrgId);
      orgMembers = res.members;
    } catch (e) {
      console.error(e);
    }
  }

  async function inviteMember() {
    if (!inviteEmail.trim() || !activeOrgId) return;
    inviting = true;
    try {
      const res = await api.addOrgMember(activeOrgId, inviteEmail, inviteRole);
      orgMembers = [...orgMembers, res.member];
      inviteEmail = "";
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible d'inviter ce membre.");
    } finally {
      inviting = false;
    }
  }

  async function removeMember(memberId: string) {
    if (!activeOrgId || !confirm("Retirer ce membre de l'organisation ?")) return;
    try {
      await api.removeOrgMember(activeOrgId, memberId);
      orgMembers = orgMembers.filter((m) => m.id !== memberId);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  function canManageForm(f: FormSummary) {
    if (auth.isSuperAdmin || f.ownerId === auth.user?.id) return true;
    if (f.organizationId) {
      if (activeOrgId === f.organizationId && (activeOrgRole === "OWNER" || activeOrgRole === "ADMIN")) {
        return true;
      }
    }
    return false;
  }

  function canEditForm(f: FormSummary) {
    if (auth.isSuperAdmin || f.ownerId === auth.user?.id) return true;
    if (f.organizationId) {
      return true;
    }
    return false;
  }

  // Multi-sélection
  let selected = $state<Set<string>>(new Set());
  let allSelected = $derived(filteredForms.length > 0 && selected.size === filteredForms.length);
  let someSelected = $derived(selected.size > 0);

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function toggleAll() {
    if (allSelected) {
      selected = new Set();
    } else {
      selected = new Set(filteredForms.map((f) => f.id));
    }
  }

  function clearSelection() {
    selected = new Set();
  }

  onMount(load);
  onDestroy(() => lineChart?.dispose());

  async function load() {
    loading = true;
    try {
      const res = await api.listForms();
      forms = res.forms;
      
      const orgsRes = await api.listOrganizations();
      organizations = orgsRes.organizations;
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur de chargement.";
    } finally {
      loading = false;
    }

    // Charger les stats globales pour les SUPER_ADMIN
    if (auth.isSuperAdmin) {
      statsLoading = true;
      try {
        const res = await api.getGlobalStats();
        stats = res.stats;
        await new Promise((r) => setTimeout(r, 50));
        renderActivityChart();
      } catch {
        // Stats non critiques, on ignore l'erreur
      } finally {
        statsLoading = false;
      }
    }
  }

  function renderActivityChart() {
    if (!lineChartEl || !stats) return;
    lineChart = echarts.init(lineChartEl, null, { renderer: "svg" });
    const dates = stats.activity.map((a) => {
      const d = new Date(a.date);
      return `${d.getDate()}/${d.getMonth() + 1}`;
    });
    const counts = stats.activity.map((a) => a.count);

    lineChart.setOption({
      tooltip: {
        trigger: "axis",
        formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value} réponse(s)</b>`,
        backgroundColor: "#fff",
        borderColor: "#e2e8f0",
        textStyle: { color: "#334155" },
      },
      grid: { left: 8, right: 8, top: 8, bottom: 20, containLabel: true },
      xAxis: {
        type: "category",
        data: dates,
        axisLine: { lineStyle: { color: "#e2e8f0" } },
        axisTick: { show: false },
        axisLabel: { color: "#94a3b8", fontSize: 10, interval: 4 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#f1f5f9" } },
        axisLabel: { color: "#94a3b8", fontSize: 10 },
      },
      series: [
        {
          type: "line",
          data: counts,
          smooth: true,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { color: "#22c55e", width: 2.5 },
          itemStyle: { color: "#22c55e", borderColor: "#fff", borderWidth: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(34,197,94,0.3)" },
              { offset: 1, color: "rgba(34,197,94,0)" },
            ]),
          },
        },
      ],
    });
  }

  async function togglePublish(f: FormSummary) {
    try {
      const res = await api.publishForm(f.id, !f.isPublished);
      f.isPublished = res.isPublished;
      forms = [...forms];
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action impossible.");
    }
  }

  async function remove(f: FormSummary) {
    if (!confirm(`Supprimer « ${f.title} » et toutes ses réponses ?`)) return;
    try {
      await api.deleteForm(f.id);
      forms = forms.filter((x) => x.id !== f.id);
      const next = new Set(selected);
      next.delete(f.id);
      selected = next;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }

  async function duplicate(f: FormSummary) {
    try {
      const res = await api.duplicateForm(f.id);
      forms = [res.form, ...forms];
    } catch (e) {
      alert(e instanceof Error ? e.message : "Duplication impossible.");
    }
  }

  function publicUrl(slug: string) {
    return `${location.origin}/f/${slug}`;
  }

  async function copyLink(slug: string) {
    await navigator.clipboard.writeText(publicUrl(slug));
    alert("Lien copié !");
  }

  // --- Actions groupées ---
  async function bulkPublish(publish: boolean) {
    const ids = [...selected];
    await Promise.all(
      ids.map(async (id) => {
        const f = forms.find((x) => x.id === id);
        if (f && f.isPublished !== publish) {
          const res = await api.publishForm(id, publish);
          f.isPublished = res.isPublished;
        }
      })
    );
    forms = [...forms];
    clearSelection();
  }

  async function bulkDelete() {
    const ids = [...selected];
    const count = ids.length;
    if (!confirm(`Supprimer ${count} formulaire(s) et toutes leurs réponses ?`)) return;
    await Promise.all(ids.map((id) => api.deleteForm(id)));
    forms = forms.filter((f) => !ids.includes(f.id));
    clearSelection();
  }
</script>

<svelte:head><title>Formulaires — Admin</title></svelte:head>

<!-- ══════════════════════════════════════════════════
     DASHBOARD STATS GLOBALES (SUPER_ADMIN seulement)
══════════════════════════════════════════════════ -->
{#if auth.isSuperAdmin && activeOrgId === null}
  {#if statsLoading}
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      {#each [0,1,2,3] as _}
        <div class="card animate-pulse h-24 bg-slate-50"></div>
      {/each}
    </div>
  {:else if stats}
    <!-- KPI Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
      <!-- Formulaires -->
      <div class="card stats-card group">
        <div class="stats-icon bg-green-50 text-green-600">
          <IconTable size={20} />
        </div>
        <div>
          <p class="stats-label">Formulaires</p>
          <p class="stats-value">{stats.forms.total}</p>
          <p class="stats-sub">{stats.forms.published} publiés · {stats.forms.draft} brouillons</p>
        </div>
      </div>

      <!-- Réponses totales -->
      <div class="card stats-card group">
        <div class="stats-icon bg-blue-50 text-blue-600">
          <IconChartBar size={20} />
        </div>
        <div>
          <p class="stats-label">Réponses totales</p>
          <p class="stats-value">{stats.responses.total.toLocaleString("fr-FR")}</p>
          <p class="stats-sub">{stats.responses.today} auj. · {stats.responses.week} cette sem.</p>
        </div>
      </div>

      <!-- Ce mois -->
      <div class="card stats-card group">
        <div class="stats-icon bg-purple-50 text-purple-600">
          <IconTrend size={20} />
        </div>
        <div>
          <p class="stats-label">Ce mois</p>
          <p class="stats-value">{stats.responses.month}</p>
          {#if stats.responses.monthDelta !== null}
            <p class="stats-sub flex items-center gap-1">
              {#if stats.responses.monthDelta > 0}
                <IconArrowUp size={12} class="text-green-500" />
                <span class="text-green-600 font-semibold">+{stats.responses.monthDelta}%</span>
              {:else if stats.responses.monthDelta < 0}
                <IconArrowDown size={12} class="text-red-500" />
                <span class="text-red-500 font-semibold">{stats.responses.monthDelta}%</span>
              {:else}
                <IconMinus size={12} class="text-[color:var(--muted)]" />
                <span>Stable</span>
              {/if}
              <span class="text-[color:var(--muted)]">vs mois préc.</span>
            </p>
          {:else}
            <p class="stats-sub">Premier mois</p>
          {/if}
        </div>
      </div>

      <!-- Utilisateurs -->
      <div class="card stats-card group">
        <div class="stats-icon bg-orange-50 text-orange-600">
          <IconUsers size={20} />
        </div>
        <div>
          <p class="stats-label">Utilisateurs</p>
          <p class="stats-value">{stats.users.total}</p>
          <p class="stats-sub">{stats.users.active} actifs · {stats.users.inactive} inactifs</p>
        </div>
      </div>
    </div>

    <!-- Graphique d'activité + Top formulaires -->
    <div class="grid gap-4 lg:grid-cols-5 mb-8">
      <!-- Graphique 30 jours -->
      <div class="card lg:col-span-3">
        <div class="flex items-center gap-2 mb-4">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <IconChartLine size={16} />
          </span>
          <h2 class="font-bold text-sm text-[color:var(--ink)]">Activité — 30 derniers jours</h2>
          <span class="ml-auto text-xs text-[color:var(--muted)]">
            {stats.activity.reduce((s, a) => s + a.count, 0)} réponses
          </span>
        </div>
        <div bind:this={lineChartEl} class="h-44 w-full"></div>
      </div>

      <!-- Top formulaires -->
      <div class="card lg:col-span-2">
        <div class="flex items-center gap-2 mb-4">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-50 text-yellow-600">
            <IconTrend size={16} />
          </span>
          <h2 class="font-bold text-sm text-[color:var(--ink)]">Top formulaires</h2>
        </div>
        {#if stats.topForms.length === 0}
          <p class="text-xs text-[color:var(--muted)] text-center py-6">Aucune donnée</p>
        {:else}
          <div class="space-y-2">
            {#each stats.topForms as f, i}
              {@const max = stats.topForms[0]?.responseCount ?? 1}
              <div class="flex items-center gap-2">
                <span class="text-xs font-black text-[color:var(--muted)] w-4 shrink-0">{i + 1}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between mb-0.5">
                    <span class="text-xs font-semibold text-[color:var(--ink)] truncate">{f.title}</span>
                    <span class="text-xs font-bold text-[color:var(--muted)] shrink-0 ml-2">{f.responseCount}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      class="h-full rounded-full bg-brand-500 transition-all"
                      style="width:{max > 0 ? Math.round((f.responseCount / max) * 100) : 0}%"
                    ></div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/if}

<!-- ══════════════════════════════════════════════════
     LISTE DES FORMULAIRES ET ESPACES
     ══════════════════════════════════════════════════ -->
<div class="flex flex-col lg:flex-row gap-6 mt-6">
  <!-- Barre latérale : Espaces de travail / Organisations -->
  <aside class="w-full lg:w-64 shrink-0 flex flex-col gap-4">
    <div class="card p-4 flex flex-col gap-4 bg-white border border-[color:var(--line)]">
      <div class="flex items-center justify-between">
        <h2 class="font-bold text-xs uppercase tracking-wider text-[color:var(--muted)]">Espaces</h2>
      </div>

      <div class="flex flex-col gap-1">
        <!-- Espace Personnel -->
        <button
          class="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all {activeOrgId === null ? 'bg-brand-500 text-white shadow-md shadow-brand-500/10' : 'text-[color:var(--ink)] hover:bg-slate-50 border border-transparent'}"
          onclick={() => { activeOrgId = null; activeOrgRole = null; }}
        >
          <span class="flex h-5 w-5 items-center justify-center rounded-lg {activeOrgId === null ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}">
            <IconUser size={13} />
          </span>
          Espace personnel
        </button>

        {#each organizations as org}
          <button
            class="flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition-all {activeOrgId === org.id ? 'bg-brand-500 text-white shadow-md shadow-brand-500/10' : 'text-[color:var(--ink)] hover:bg-slate-50 border border-transparent'}"
            onclick={() => selectOrg(org.id)}
          >
            <span class="flex h-5 w-5 items-center justify-center rounded-lg {activeOrgId === org.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}">
              <IconUsers size={13} />
            </span>
            <span class="truncate flex-1">{org.name}</span>
          </button>
        {/each}
      </div>

      <button
        class="btn-secondary !py-2.5 flex items-center justify-center gap-1.5 text-xs w-full font-bold"
        onclick={() => showOrgModal = true}
      >
        <IconPlus size={14} /> Créer une organisation
      </button>
    </div>
  </aside>

  <!-- Section principale du Workspace -->
  <div class="flex-1 min-w-0">
    <!-- En-tête -->
    <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold truncate">
            {activeOrgId ? organizations.find((o) => o.id === activeOrgId)?.name : "Espace personnel"}
          </h1>
          {#if activeOrgId}
            <button
              class="btn-secondary !px-2.5 !py-1 text-xs flex items-center gap-1.5 font-bold shrink-0"
              onclick={() => { showMembersModal = true; loadOrgMembers(); }}
            >
              <IconUsers size={14} /> Membres
            </button>
          {/if}
        </div>
        <p class="text-xs text-[color:var(--muted)] mt-1">
          {activeOrgId ? "Formulaires partagés de cette organisation" : "Vos formulaires personnels"}
        </p>
      </div>
      <div class="flex items-center gap-3 shrink-0">
        {#if filteredForms.length > 0}
          <button
            class="flex items-center gap-2 text-xs font-semibold text-[color:var(--muted)] hover:text-[color:var(--ink)] transition px-2 py-1.5 rounded-lg hover:bg-slate-100"
            onclick={toggleAll}
          >
            <span class="relative flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition {allSelected ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'}">
              {#if allSelected}
                <IconCheck size={10} weight="bold" class="text-white" />
              {:else if someSelected}
                <span class="block h-1.5 w-1.5 rounded-sm bg-brand-400"></span>
              {/if}
            </span>
            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        {/if}
        {#if canCreateForm}
          <button class="btn-primary w-full sm:w-auto font-bold" onclick={() => goto(`/admin/forms/new${activeOrgId ? `?orgId=${activeOrgId}` : ""}`)}>
            Nouveau formulaire
          </button>
        {/if}
      </div>
    </div>

    {#if loading}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
        {#each [1, 2, 3, 4, 5, 6] as _}
          <div class="card flex flex-col min-h-[190px] bg-white border border-[color:var(--line)] p-5">
            <div class="flex items-start justify-between gap-2 mb-3">
              <div class="h-5 bg-slate-200 rounded-md w-2/3"></div>
              <div class="h-5 bg-slate-200 rounded-full w-16"></div>
            </div>
            <div class="flex-1 space-y-2 mb-4">
              <div class="h-3 bg-slate-200 rounded-md w-full"></div>
              <div class="h-3 bg-slate-200 rounded-md w-4/5"></div>
            </div>
            <div class="flex items-center gap-3 mb-4">
              <div class="h-4 bg-slate-200 rounded-md w-20"></div>
              <div class="h-4 bg-slate-200 rounded-md w-16"></div>
            </div>
            <div class="flex items-center gap-2 mt-auto pt-3 border-t border-slate-100">
              <div class="h-8 bg-slate-100 rounded-lg flex-1"></div>
              <div class="h-8 bg-slate-100 rounded-lg flex-1"></div>
              <div class="h-8 bg-slate-100 rounded-lg w-8"></div>
            </div>
          </div>
        {/each}
      </div>
    {:else if error}
      <p class="text-[color:var(--danger)]">{error}</p>
    {:else if filteredForms.length === 0}
      <div class="card flex flex-col items-center gap-3 py-12 text-center text-[color:var(--muted)]">
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-500">
          <IconLeaf size={26} weight="fill" />
        </span>
        Aucun formulaire pour le moment dans cet espace.
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each filteredForms as f (f.id)}
          {@const isSelected = selected.has(f.id)}
          <div
            class="card flex flex-col transition min-h-[190px] cursor-pointer relative {isSelected ? 'ring-2 ring-brand-500 shadow-lg shadow-brand-500/10' : 'hover:shadow-gform-hover'}"
            onclick={() => toggleSelect(f.id)}
            role="checkbox"
            aria-checked={isSelected}
            tabindex="0"
            onkeydown={(e) => e.key === " " && toggleSelect(f.id)}
          >
            <!-- Checkbox -->
            <span
              class="absolute top-3 right-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all {isSelected ? 'border-brand-500 bg-brand-500 scale-110' : 'border-slate-300 bg-white'}"
            >
              {#if isSelected}
                <IconCheck size={11} weight="bold" class="text-white" />
              {/if}
            </span>

            <div class="mb-2 flex items-start justify-between gap-2 pr-7">
              <h3 class="font-bold text-[color:var(--ink)] leading-snug truncate">{f.title}</h3>
              {#if f.isPublished}
                <span class="chip shrink-0"><IconCheck size={12} weight="bold" /> Publié</span>
              {:else}
                <span class="chip-muted shrink-0">Brouillon</span>
              {/if}
            </div>
            <p class="mb-3 flex-1 text-sm text-[color:var(--muted)] line-clamp-2">{f.description ?? "Aucune description."}</p>
            <div class="mb-4 flex items-center gap-3 text-xs font-semibold text-[color:var(--muted)]">
              <span class="flex items-center gap-1"><IconTable size={14} /> {f._count?.responses ?? 0} réponse(s)</span>
              {#if f.isAnonymized}<span class="flex items-center gap-1"><IconLock size={14} /> Anonyme</span>{/if}
              {#if f.visibility === "PUBLIC"}
                <span class="flex items-center gap-1"><IconEye size={14} /> Public</span>
              {:else if f.visibility === "PRIVATE"}
                <span class="flex items-center gap-1"><IconLock size={14} /> Connecté</span>
              {:else if f.visibility === "RESTRICTED"}
                <span class="flex items-center gap-1 text-amber-600"><IconLock size={14} /> Restreint</span>
              {/if}
            </div>

            <div
              class="flex items-center gap-2 mt-auto pt-3 border-t border-slate-100"
              onclick={(e) => e.stopPropagation()}
              role="none"
            >
              <button class="btn-secondary flex-1 !px-3 !py-2 text-xs font-bold" onclick={() => goto(`/admin/forms/${f.id}/responses`)}>
                <IconTable size={15} /> Réponses
              </button>
              {#if canEditForm(f)}
                <button class="btn-secondary flex-1 !px-3 !py-2 text-xs font-bold" onclick={() => goto(`/admin/forms/${f.id}`)}>
                  <IconEdit size={15} /> Éditer
                </button>
              {/if}

              <!-- Menu dropdown -->
              <div class="relative">
                <button
                  class="btn-secondary !p-2 text-xs"
                  onclick={(e) => { e.stopPropagation(); openMenuId = openMenuId === f.id ? null : f.id; }}
                  aria-label="Plus d'actions"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="currentColor" viewBox="0 0 256 256">
                    <circle cx="128" cy="60" r="12"/><circle cx="128" cy="128" r="12"/><circle cx="128" cy="196" r="12"/>
                  </svg>
                </button>

                {#if openMenuId === f.id}
                  <div class="fixed inset-0 z-30" onclick={() => openMenuId = null} role="none"></div>
                  <div class="absolute right-0 bottom-full mb-2 w-48 rounded-xl border border-[color:var(--line)] bg-white p-1.5 shadow-xl z-40 text-left">
                    <button
                      class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                      onclick={() => { openMenuId = null; goto(`/admin/forms/${f.id}/stats`); }}
                    >
                      <IconChartBar size={14} /> Statistiques
                    </button>
                    {#if canEditForm(f)}
                      <button
                        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                        onclick={() => { openMenuId = null; togglePublish(f); }}
                      >
                        <IconEye size={14} /> {f.isPublished ? "Dépublier" : "Publier"}
                      </button>
                    {/if}
                    {#if canCreateForm}
                      <button
                        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                        onclick={() => { openMenuId = null; duplicate(f); }}
                      >
                        <IconDuplicate size={14} /> Dupliquer
                      </button>
                    {/if}
                    {#if f.isPublished}
                      <button
                        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-50 transition"
                        onclick={() => { openMenuId = null; copyLink(f.slug); }}
                      >
                        <IconLink size={14} /> Copier le lien
                      </button>
                    {/if}
                    {#if canManageForm(f)}
                      <hr class="my-1 border-slate-100" />
                      <button
                        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--danger)] hover:bg-red-50 transition"
                        onclick={() => { openMenuId = null; remove(f); }}
                      >
                        <IconTrash size={14} /> Supprimer
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Modale de création d'organisation -->
{#if showOrgModal}
  <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => showOrgModal = false} role="none">
    <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 relative border border-slate-100 flex flex-col gap-4" onclick={(e) => e.stopPropagation()} role="none">
      <button class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition" onclick={() => showOrgModal = false}>
        <IconClose size={20} />
      </button>
      <h3 class="text-lg font-bold text-[color:var(--ink)]">Créer une organisation</h3>
      <p class="text-xs text-[color:var(--muted)]">Créez votre propre espace de travail pour collaborer à plusieurs sur des formulaires et analyser les réponses.</p>
      
      <div class="flex flex-col gap-1.5">
        <label for="orgName" class="text-xs font-semibold text-slate-500">Nom de l'organisation</label>
        <input
          id="orgName"
          type="text"
          bind:value={newOrgName}
          placeholder="Ex: Asso Humanitour"
          class="input w-full"
          onkeydown={(e) => e.key === "Enter" && createOrg()}
        />
      </div>

      <div class="flex gap-2 justify-end mt-2">
        <button class="btn-secondary" onclick={() => showOrgModal = false}>Annuler</button>
        <button class="btn-primary" onclick={createOrg} disabled={!newOrgName.trim()}>Créer</button>
      </div>
    </div>
  </div>
{/if}

<!-- Modale de gestion des membres -->
{#if showMembersModal}
  <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onclick={() => showMembersModal = false} role="none">
    <div class="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 relative border border-slate-100 flex flex-col gap-5" onclick={(e) => e.stopPropagation()} role="none">
      <button class="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition" onclick={() => showMembersModal = false}>
        <IconClose size={20} />
      </button>
      <h3 class="text-lg font-bold text-[color:var(--ink)]">Membres de l'organisation</h3>

      <!-- Formulaire d'invitation -->
      {#if activeOrgRole === "OWNER" || activeOrgRole === "ADMIN" || auth.isSuperAdmin}
        <div class="p-4 bg-slate-50 rounded-xl flex flex-col gap-3">
          <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Inviter un collaborateur</h4>
          <div class="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              bind:value={inviteEmail}
              placeholder="adresse@email.com"
              class="input flex-1"
            />
            <select bind:value={inviteRole} class="input sm:w-32">
              <option value="MEMBER">Membre</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button class="btn-primary shrink-0 font-bold" onclick={inviteMember} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? "Invitation…" : "Inviter"}
            </button>
          </div>
          <p class="text-[10px] text-[color:var(--muted)]">Si cette adresse ne possède pas encore de compte, un lien d'invitation lui sera envoyé par email pour qu'elle définisse son mot de passe.</p>
        </div>
      {/if}

      <!-- Liste des membres -->
      <div class="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
        {#each orgMembers as member (member.id)}
          <div class="flex items-center justify-between p-2.5 rounded-xl border border-slate-100">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600 font-bold shrink-0 text-xs">
                {(member.user.displayName || member.user.email)[0].toUpperCase()}
              </div>
              <div class="min-w-0">
                <p class="text-xs font-semibold text-[color:var(--ink)] truncate">
                  {member.user.displayName || "Sans nom"}
                </p>
                <p class="text-[10px] text-[color:var(--muted)] truncate">{member.user.email}</p>
              </div>
            </div>
            
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider {member.role === 'OWNER' ? 'bg-orange-50 text-orange-600 border border-orange-100' : member.role === 'ADMIN' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-600 border border-slate-100'}">
                {member.role === 'OWNER' ? 'Propriétaire' : member.role === 'ADMIN' ? 'Admin' : 'Membre'}
              </span>

              <!-- Bouton supprimer membre -->
              {#if member.role !== 'OWNER' && (activeOrgRole === "OWNER" || activeOrgRole === "ADMIN" || auth.isSuperAdmin || member.userId === auth.user?.id)}
                <button
                  class="text-slate-400 hover:text-red-500 transition p-1"
                  onclick={() => removeMember(member.id)}
                  title="Retirer le membre"
                >
                  <IconTrash size={14} />
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<!-- Barre d'actions groupées (flottante en bas) -->
{#if someSelected}
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-2xl border border-[color:var(--line)] bg-white px-4 py-3 shadow-2xl shadow-slate-900/15 animate-in">
    <span class="text-sm font-bold text-[color:var(--ink)] mr-1 shrink-0">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
    <div class="w-px h-5 bg-slate-200 mx-1"></div>
    {#if auth.isSuperAdmin}
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--ink)] hover:bg-slate-100 transition"
        onclick={() => bulkPublish(true)}
      >
        <IconEye size={14} /> Publier
      </button>
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--muted)] hover:bg-slate-100 transition"
        onclick={() => bulkPublish(false)}
      >
        Dépublier
      </button>
      <div class="w-px h-5 bg-slate-200 mx-1"></div>
      <button
        class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[color:var(--danger)] hover:bg-red-50 transition"
        onclick={bulkDelete}
      >
        <IconTrash size={14} /> Supprimer
      </button>
    {/if}
    <div class="w-px h-5 bg-slate-200 mx-1"></div>
    <button
      class="flex items-center justify-center h-7 w-7 rounded-full text-[color:var(--muted)] hover:bg-slate-100 transition"
      onclick={clearSelection}
      aria-label="Annuler la sélection"
    >
      <IconClose size={14} />
    </button>
  </div>
{/if}

<style>
  @keyframes animate-in {
    from { opacity: 0; transform: translateX(-50%) translateY(12px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .animate-in {
    animation: animate-in 0.2s ease-out both;
  }

  .stats-card {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
    padding: 1rem 1.25rem;
    transition: box-shadow 0.15s;
  }
  .stats-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
  }
  .stats-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    flex-shrink: 0;
    margin-top: 0.1rem;
  }
  .stats-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 0.125rem;
  }
  .stats-value {
    font-size: 1.5rem;
    font-weight: 800;
    line-height: 1.1;
    color: var(--ink);
    margin-bottom: 0.25rem;
  }
  .stats-sub {
    font-size: 0.7rem;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .animate-pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }
</style>
