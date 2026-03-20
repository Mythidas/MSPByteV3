<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { createDattoOverview } from '$lib/hooks/dattormm/useDattoOverview.svelte.js';

  const hook = createDattoOverview(() => {
    const tenantId = authStore.currentTenant?.id;
    if (!tenantId) return null;
    return { tenantId, siteId: scopeStore.currentSite };
  });

  const d = $derived(hook.data);
</script>

<div class="flex flex-col gap-6 p-1">
  <h1 class="text-2xl font-bold">Overview</h1>

  <!-- Devices -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Endpoints</h2>
    {#if !hook.loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <a href="/dattormm/endpoints">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Endpoints</span>
                <span class="text-2xl font-bold">{d?.totalDevices ?? 0}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/dattormm/endpoints?view=stale">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Stale Endpoints (60 Days)</span>
                <span class="text-2xl font-bold {(d?.staleDevices ?? 0) > 0 ? 'text-destructive' : ''}"
                  >{d?.staleDevices ?? 0}</span
                >
              </div>
            </Card.Root>
          </a>
        </div>
      </FadeIn>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
          <a href="/dattormm/alerts">
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
