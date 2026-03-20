<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { formatBytes } from '$lib/utils/format.js';
  import { createCoveOverview } from '$lib/hooks/cove/useCoveOverview.svelte.js';

  const hook = createCoveOverview(() => {
    const tenantId = authStore.currentTenant?.id;
    if (!tenantId) return null;
    return { tenantId, siteId: scopeStore.currentSite };
  });

  const d = $derived(hook.data);
</script>

<div class="flex flex-col gap-6 p-1">
  <h1 class="text-2xl font-bold">Overview</h1>

  <!-- Endpoints -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Endpoints</h2>
    {#if !hook.loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <a href="/cove/endpoints">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Endpoints</span>
                <span class="text-2xl font-bold">{d?.totalEndpoints ?? 0}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/cove/endpoints?view=failed">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Most Recent Backup Failed</span>
                <span class="text-2xl font-bold {(d?.failedEndpoints ?? 0) > 0 ? 'text-destructive' : ''}"
                  >{d?.failedEndpoints ?? 0}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/cove/endpoints?view=no-recent-backup">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">No Recent Backup (7 Days)</span>
                <span class="text-2xl font-bold {(d?.noRecentBackup ?? 0) > 0 ? 'text-amber-500' : ''}"
                  >{d?.noRecentBackup ?? 0}</span
                >
              </div>
            </Card.Root>
          </a>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {#each Array(3) as _}
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

  <!-- Storage -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Storage</h2>
    {#if !hook.loading}
      <FadeIn>
        <div class="grid grid-cols-2 gap-3">
          <Card.Root class="p-4">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Total Selected Size</span>
              <span class="text-2xl font-bold">{formatBytes(d?.totalSelectedSize ?? 0)}</span>
            </div>
          </Card.Root>
          <Card.Root class="p-4">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">Total Used Storage</span>
              <span class="text-2xl font-bold">{formatBytes(d?.totalUsedStorage ?? 0)}</span>
            </div>
          </Card.Root>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 gap-3">
        {#each Array(2) as _}
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
          <a href="/cove/alerts">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Active Alerts</span>
                <span class="text-2xl font-bold {(d?.activeAlerts ?? 0) > 0 ? 'text-destructive' : ''}"
                  >{d?.activeAlerts ?? 0}</span
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
