<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import { supabase } from '$lib/utils/supabase.js';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { INTEGRATIONS } from '@workspace/shared/config/integrations';

  let loading = $state(true);

  let totalEndpoints = $state(0);
  let healthIssues = $state(0);
  let tamperDisabledEndpoints = $state(0);
  let staleEndpoints = $state(0);
  let upgradableEndpoints = $state(0);
  let activeAlerts = $state(0);

  $effect(() => {
    const site = scopeStore.currentSite;
    const tenantId = authStore.currentTenant?.id ?? '';
    const integration = INTEGRATIONS['sophos-partner'];

    const load = async () => {
      loading = true;

      const applyScope = (q: any) => {
        q.eq('tenant_id', tenantId);
        if (site) q.eq('site_id', site as string);
        return q;
      };

      const [
        endpointsTotal,
        endpointsHealthIssues,
        endpointsTamperDisabled,
        endpointsStale,
        endpointsUpgradable,
        alertsActive,
      ] = await Promise.all([
        applyScope(
          supabase
            .schema('vendors')
            .from('sophos_endpoints')
            .select('*', { count: 'exact', head: true })
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('sophos_endpoints')
            .select('*', { count: 'exact', head: true })
            .neq('health', 'good')
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('sophos_endpoints')
            .select('*', { count: 'exact', head: true })
            .eq('tamper_protection_enabled', false)
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('sophos_endpoints')
            .select('*', { count: 'exact', head: true })
            .or(
              `last_heartbeat_at.is.null,last_heartbeat_at.lt.${new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()}`
            )
        ),
        applyScope(
          supabase
            .schema('vendors')
            .from('sophos_endpoints')
            .select('*', { count: 'exact', head: true })
            .eq('needs_upgrade', true)
        ),
        (() => {
          const q = supabase
            .schema('views')
            .from('d_alerts_view')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .in(
              'entity_type',
              integration.supportedTypes.filter((t) => t.entityKey).map((t) => t.entityKey!)
            );
          if (site) q.eq('site_id', site as string);
          return q;
        })(),
      ]);

      totalEndpoints = endpointsTotal.count ?? 0;
      healthIssues = endpointsHealthIssues.count ?? 0;
      tamperDisabledEndpoints = endpointsTamperDisabled.count ?? 0;
      staleEndpoints = endpointsStale.count ?? 0;
      upgradableEndpoints = endpointsUpgradable.count ?? 0;
      activeAlerts = alertsActive.count ?? 0;

      loading = false;
    };

    load();
  });
</script>

<div class="flex flex-col gap-6 p-1">
  <h1 class="text-2xl font-bold">Overview</h1>

  <!-- Endpoints -->
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Endpoints</h2>
    {#if !loading}
      <FadeIn>
        <div class="grid grid-cols-5 gap-3">
          <a href="/sophos-partner/endpoints">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Total Endpoints</span>
                <span class="text-2xl font-bold">{totalEndpoints}</span>
              </div>
            </Card.Root>
          </a>
          <a href="/sophos-partner/endpoints?view=health-issues">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Health Issues</span>
                <span class="text-2xl font-bold {healthIssues > 0 ? 'text-amber-500' : ''}"
                  >{healthIssues}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/sophos-partner/endpoints?view=tamper-disabled">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Tamper Protection Disabled</span>
                <span
                  class="text-2xl font-bold {tamperDisabledEndpoints > 0 ? 'text-destructive' : ''}"
                  >{tamperDisabledEndpoints}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/sophos-partner/endpoints?view=upgradable">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Needs Upgrade</span>
                <span class="text-2xl font-bold {upgradableEndpoints > 0 ? 'text-destructive' : ''}"
                  >{upgradableEndpoints}</span
                >
              </div>
            </Card.Root>
          </a>
          <a href="/sophos-partner/endpoints?view=offline">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Stale Endpoints (60 Days)</span>
                <span class="text-2xl font-bold {staleEndpoints > 0 ? 'text-destructive' : ''}"
                  >{staleEndpoints}</span
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
    {#if !loading}
      <FadeIn>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <a href="/sophos-partner/alerts">
            <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">Active Alerts</span>
                <span class="text-2xl font-bold {activeAlerts > 0 ? 'text-destructive' : ''}"
                  >{activeAlerts}</span
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
