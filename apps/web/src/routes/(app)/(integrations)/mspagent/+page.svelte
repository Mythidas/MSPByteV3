<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { createMSPAgentOverview } from '$lib/hooks/mspagent/useMSPAgentOverview.svelte.js';

  const hook = createMSPAgentOverview(() => {
    const tenantId = authStore.currentTenant?.id;
    if (!tenantId) return null;
    return { tenantId, siteId: scopeStore.currentSite };
  });

  const d = $derived(hook.data);
</script>

<div class="flex flex-col gap-6 p-1">
  <h1 class="text-2xl font-bold">Overview</h1>

  <!-- Agents -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Agents</h2>
    {#if !hook.loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <a href="/mspagent/agents">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Agents</span>
                <span class="text-2xl font-bold">{d?.totalAgents ?? 0}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/mspagent/agents">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Stale Agents (60 Days)</span>
                <span class="text-2xl font-bold {(d?.staleAgents ?? 0) > 0 ? 'text-destructive' : ''}"
                  >{d?.staleAgents ?? 0}</span
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

  <!-- Tickets -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tickets</h2>
    {#if !hook.loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <a href="/mspagent/tickets">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Tickets</span>
                <span class="text-2xl font-bold">{d?.totalTickets ?? 0}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/mspagent/tickets">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Recent Tickets (7 Days)</span>
                <span class="text-2xl font-bold {(d?.recentTickets ?? 0) > 0 ? 'text-amber-500' : ''}"
                  >{d?.recentTickets ?? 0}</span
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
</div>
