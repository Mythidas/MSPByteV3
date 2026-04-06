<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { createSophosOverview } from '$lib/hooks/sophos/useSophosOverview.svelte.js';
  import { createSophosLinkGrid } from '$lib/hooks/sophos/useSophosLinkGrid.svelte.js';
  import type { Tier } from '$lib/hooks/sophos/useSophosLinkGrid.svelte.js';
  import SiteRow from './_site-row.svelte';
  import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let search = $state('');

  type SortField = 'name' | 'serverTier' | 'userTier';
  type SortDir = 'asc' | 'desc';
  type TierFilter = Tier | null;
  type StatusFilter = 'active' | 'dispositioned' | null;

  let sortField = $state<SortField>('name');
  let sortDir = $state<SortDir>('asc');
  let filterServerTier = $state<TierFilter>(null);
  let filterUserTier = $state<TierFilter>(null);
  let filterStatus = $state<StatusFilter>(null);

  const TIER_RANK: Record<string, number> = { MDR: 3, XDR: 2, Endpoint: 1 };
  function tierRank(t: Tier | null): number {
    return t ? (TIER_RANK[t] ?? 0) : 0;
  }

  function toggleSort(field: SortField) {
    if (sortField === field) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDir = field === 'name' ? 'asc' : 'desc';
    }
  }

  const tenantId = $derived(authStore.currentTenant?.id ?? '');

  const hook = createSophosOverview(() => {
    if (!tenantId) return null;
    return { tenantId, siteId: scopeStore.currentSite };
  });

  const d = $derived(hook.data);

  const grid = createSophosLinkGrid(() => (scopeStore.currentSite ? null : tenantId || null));

  const filteredLinks = $derived.by(() => {
    let rows = grid.links;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((l) => l.siteName.toLowerCase().includes(q));
    }

    if (filterStatus !== null) {
      rows = rows.filter((l) =>
        filterStatus === 'active' ? l.status !== 'dispositioned' : l.status === 'dispositioned',
      );
    }

    if (filterServerTier !== null) {
      rows = rows.filter((l) => l.serverTier === filterServerTier);
    }

    if (filterUserTier !== null) {
      rows = rows.filter((l) => l.userTier === filterUserTier);
    }

    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.siteName.localeCompare(b.siteName);
      } else if (sortField === 'serverTier') {
        cmp = tierRank(a.serverTier) - tierRank(b.serverTier);
      } else if (sortField === 'userTier') {
        cmp = tierRank(a.userTier) - tierRank(b.userTier);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  });

  const anyFiltersActive = $derived(
    filterServerTier !== null || filterUserTier !== null || filterStatus !== null,
  );

  const TIER_OPTS: { value: TierFilter; label: string }[] = [
    { value: 'MDR', label: 'MDR' },
    { value: 'XDR', label: 'XDR' },
    { value: 'Endpoint', label: 'Endpoint' },
  ];

  const STATUS_OPTS: { value: StatusFilter; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'dispositioned', label: 'Dispositioned' },
  ];
</script>

{#snippet filterBtn(
  label: string,
  value: TierFilter | StatusFilter,
  active: boolean,
  onclick: () => void,
)}
  <button
    class={cn(
      'px-2 py-0.5 rounded border text-xs transition-colors',
      active
        ? 'bg-primary/15 text-primary border-primary/40 font-medium'
        : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80',
    )}
    {onclick}
  >
    {label}
  </button>
{/snippet}

{#snippet sortHeader(label: string, field: SortField)}
  <button
    class="flex items-center gap-1 hover:text-foreground transition-colors"
    onclick={() => toggleSort(field)}
  >
    {label}
    {#if sortField === field}
      {#if sortDir === 'asc'}
        <ChevronUp class="size-3" />
      {:else}
        <ChevronDown class="size-3" />
      {/if}
    {:else}
      <ChevronsUpDown class="size-3 opacity-40" />
    {/if}
  </button>
{/snippet}

<div class="flex flex-col size-full overflow-hidden">
  {#if scopeStore.currentSite}
    <div class="flex flex-col gap-6 p-1 overflow-y-auto flex-1">
      <h1 class="text-2xl font-bold">Overview</h1>

      <!-- Endpoints -->
      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Endpoints
        </h2>
        {#if !hook.loading}
          <FadeIn>
            <div class="grid grid-cols-5 gap-3">
              <a href="/sophos-partner/endpoints">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Total Endpoints</span>
                    <span class="text-2xl font-bold">{d?.totalEndpoints ?? 0}</span>
                  </div>
                </Card.Root>
              </a>
              <a href="/sophos-partner/endpoints?view=health-issues">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Health Issues</span>
                    <span
                      class="text-2xl font-bold {(d?.healthIssues ?? 0) > 0
                        ? 'text-amber-500'
                        : ''}">{d?.healthIssues ?? 0}</span
                    >
                  </div>
                </Card.Root>
              </a>
              <a href="/sophos-partner/endpoints?view=tamper-disabled">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Tamper Protection Disabled</span>
                    <span
                      class="text-2xl font-bold {(d?.tamperDisabledEndpoints ?? 0) > 0
                        ? 'text-destructive'
                        : ''}">{d?.tamperDisabledEndpoints ?? 0}</span
                    >
                  </div>
                </Card.Root>
              </a>
              <a href="/sophos-partner/endpoints?view=upgradable">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Needs Upgrade</span>
                    <span
                      class="text-2xl font-bold {(d?.upgradableEndpoints ?? 0) > 0
                        ? 'text-destructive'
                        : ''}">{d?.upgradableEndpoints ?? 0}</span
                    >
                  </div>
                </Card.Root>
              </a>
              <a href="/sophos-partner/endpoints?view=offline">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Stale Endpoints (60 Days)</span>
                    <span
                      class="text-2xl font-bold {(d?.staleEndpoints ?? 0) > 0
                        ? 'text-destructive'
                        : ''}">{d?.staleEndpoints ?? 0}</span
                    >
                  </div>
                </Card.Root>
              </a>
            </div>
          </FadeIn>
        {:else}
          <div class="grid grid-cols-5 gap-3">
            {#each Array(5) as _}
              <Card.Root class="p-4">
                <div class="flex flex-col gap-1">
                  <span class="text-xs text-muted-foreground">—</span>
                  <span class="text-2xl font-bold text-muted-foreground/30">—</span>
                </div>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </section>

      <!-- Alerts -->
      <section class="flex flex-col gap-3">
        <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Alerts</h2>
        {#if !hook.loading}
          <FadeIn>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <a href="/sophos-partner/alerts">
                <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
                  <div class="flex flex-col gap-1">
                    <span class="text-xs text-muted-foreground">Active Alerts</span>
                    <span
                      class="text-2xl font-bold {(d?.activeAlerts ?? 0) > 0
                        ? 'text-destructive'
                        : ''}">{d?.activeAlerts ?? 0}</span
                    >
                  </div>
                </Card.Root>
              </a>
            </div>
          </FadeIn>
        {:else}
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card.Root class="p-4">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">—</span>
                <span class="text-2xl font-bold text-muted-foreground/30">—</span>
              </div>
            </Card.Root>
          </div>
        {/if}
      </section>
    </div>
  {:else}
    <!-- Unscoped: site grid -->
    <div class="flex flex-col size-full overflow-hidden">
      <!-- Fixed header -->
      <div class="flex flex-col gap-3 p-1 pb-4 shrink-0">
        <div class="flex items-center justify-between gap-4">
          <h1 class="text-2xl font-bold">Sites</h1>
          <div class="relative w-64">
            <Search
              class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
            />
            <Input bind:value={search} placeholder="Search sites..." class="pl-8" />
          </div>
        </div>

        <!-- Filters -->
        <div class="flex items-center gap-5 flex-wrap">
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-muted-foreground">Server</span>
            {#each TIER_OPTS as opt}
              {@render filterBtn(opt.label, opt.value, filterServerTier === opt.value, () => {
                filterServerTier = filterServerTier === opt.value ? null : opt.value;
              })}
            {/each}
          </div>

          <div class="flex items-center gap-1.5">
            <span class="text-xs text-muted-foreground">User</span>
            {#each TIER_OPTS as opt}
              {@render filterBtn(opt.label, opt.value, filterUserTier === opt.value, () => {
                filterUserTier = filterUserTier === opt.value ? null : opt.value;
              })}
            {/each}
          </div>

          <div class="flex items-center gap-1.5">
            <span class="text-xs text-muted-foreground">Status</span>
            {#each STATUS_OPTS as opt}
              {@render filterBtn(opt.label, opt.value, filterStatus === opt.value, () => {
                filterStatus = filterStatus === opt.value ? null : opt.value;
              })}
            {/each}
          </div>

          {#if anyFiltersActive}
            <button
              class="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onclick={() => {
                filterServerTier = null;
                filterUserTier = null;
                filterStatus = null;
              }}
            >
              Clear filters
            </button>
          {/if}
        </div>
      </div>

      <!-- Scrollable rows -->
      <div class="flex-1 overflow-y-auto flex flex-col gap-2 pr-2">
        <div
          class="grid grid-cols-[2fr_120px_90px_90px_110px_1fr] sticky top-0 z-10 items-center px-3 gap-4 py-2 text-xs font-medium text-muted-foreground bg-card rounded border shadow shrink-0"
        >
          {@render sortHeader('Site', 'name')}
          <span>Status</span>
          {@render sortHeader('Server', 'serverTier')}
          {@render sortHeader('User', 'userTier')}
          <span>Alerts</span>
          <span>Note</span>
        </div>

        {#if grid.loading}
          <div class="flex flex-col gap-2">
            {#each Array(5) as _}
              <div
                class="grid grid-cols-[2fr_120px_90px_90px_110px_1fr] items-center border bg-card gap-4 px-3 py-2.5"
              >
                <span class="h-4 w-36 rounded bg-muted-foreground/15"></span>
                <span class="h-4 w-16 rounded bg-muted-foreground/10"></span>
                <span class="h-4 w-14 rounded bg-muted-foreground/10"></span>
                <span class="h-4 w-14 rounded bg-muted-foreground/10"></span>
                <span class="h-4 w-16 rounded bg-muted-foreground/10"></span>
                <span class="h-4 w-24 rounded bg-muted-foreground/10"></span>
              </div>
            {/each}
          </div>
        {:else if filteredLinks.length === 0}
          <div class="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <span class="text-sm">
              {grid.links.length === 0
                ? 'No Sophos Partner sites connected.'
                : 'No sites match your search or filters.'}
            </span>
          </div>
        {:else}
          <FadeIn class="flex flex-col gap-2">
            {#each filteredLinks as link (link.id)}
              <SiteRow {tenantId} {link} />
            {/each}
          </FadeIn>
        {/if}
      </div>
    </div>
  {/if}
</div>
