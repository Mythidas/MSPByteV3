<script lang="ts">
  import { page } from '$app/state';
  import { Users, UsersRound, BookKey, ShieldCheck, CreditCard, Mail } from '@lucide/svelte';
  import { formatStringProper } from '$lib/utils/format.js';
  import { severityClass } from '$lib/components/alerts/_alert-config.js';

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let scopeQuery = $derived(scope && scopeId ? `?scope=${scope}&scopeId=${scopeId}` : '');

  const severityLabels: Record<string, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
</script>

<div class="flex flex-col gap-4 p-4 size-full overflow-auto">
  <h1 class="text-2xl font-bold">Microsoft 365 Overview</h1>

  {#if data.connections?.length === 0}
    <div class="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-blue-500 text-sm">
      No active Microsoft 365 connections found.
      <a href="/integrations/microsoft-365" class="underline font-medium">
        Configure integrations
      </a>
      to start syncing tenant data.
    </div>
  {/if}

  {#await data.metrics}
    <!-- 🔄 Loading State -->
    <div class="flex items-center justify-center py-12 text-muted-foreground">
      Loading metrics...
    </div>
  {:then metrics}
    <!-- Derived UI data AFTER metrics resolves -->
    {@const entityCards = [
      {
        label: 'Users',
        count: metrics.entityCounts.identity,
        href: `/microsoft-365/users${scopeQuery}`,
        icon: Users,
      },
      {
        label: 'Groups',
        count: metrics.entityCounts.group,
        href: `/microsoft-365/groups${scopeQuery}`,
        icon: UsersRound,
      },
      {
        label: 'Roles',
        count: metrics.entityCounts.role,
        href: `/microsoft-365/roles${scopeQuery}`,
        icon: BookKey,
      },
      {
        label: 'Policies',
        count: metrics.entityCounts.policy,
        href: `/microsoft-365/policies${scopeQuery}`,
        icon: ShieldCheck,
      },
      {
        label: 'Licenses',
        count: metrics.entityCounts.license,
        href: `/microsoft-365/licenses${scopeQuery}`,
        icon: CreditCard,
      },
      {
        label: 'Exchange',
        count: metrics.entityCounts.exchange,
        href: `/microsoft-365/exchange${scopeQuery}`,
        icon: Mail,
      },
    ]}

    {@const healthConfig = [
      {
        label: 'MFA Risk',
        count: metrics.identityHealth.mfaRisk,
        class: metrics.identityHealth.mfaRisk > 0 ? 'text-destructive' : 'text-muted-foreground',
      },
      {
        label: 'Stale Users',
        count: metrics.identityHealth.staleUsers,
        class: metrics.identityHealth.staleUsers > 0 ? 'text-yellow-500' : 'text-muted-foreground',
      },
      {
        label: 'License Waste',
        count: metrics.identityHealth.licenseWaste,
        class:
          metrics.identityHealth.licenseWaste > 0 ? 'text-orange-500' : 'text-muted-foreground',
      },
    ]}

    {@const totalAlerts =
      metrics.alertCounts.critical +
      metrics.alertCounts.high +
      metrics.alertCounts.medium +
      metrics.alertCounts.low}

    <!-- Entity count cards -->
    <div class="flex flex-wrap gap-3">
      {#each entityCards as card}
        <a
          href={card.href}
          class="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 hover:bg-primary/10 transition-colors min-w-36"
        >
          <card.icon class="size-5 text-primary shrink-0" />
          <div class="flex flex-col">
            <span class="text-xs text-muted-foreground">{card.label}</span>
            <span class="text-xl font-bold">{card.count}</span>
          </div>
        </a>
      {/each}
    </div>

    <!-- Alert summary + Identity health -->
    <div class="flex gap-4 flex-wrap">
      <!-- Alert summary -->
      <div class="flex-1 min-w-64 rounded-lg border bg-card p-4 flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-sm">Alert Summary</h2>
          <span class="text-xs text-muted-foreground">{totalAlerts} active</span>
        </div>

        <div class="flex flex-wrap gap-2">
          {#each Object.entries(metrics.alertCounts) as [severity, count]}
            <span
              class="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium {severityClass(severity)}"
            >
              {severityLabels[severity] ?? formatStringProper(severity)}
              <span class="font-bold">{count}</span>
            </span>
          {/each}
        </div>
      </div>

      <!-- Identity health -->
      <div class="flex-1 min-w-64 rounded-lg border bg-card p-4 flex flex-col gap-3">
        <h2 class="font-semibold text-sm">Identity Health</h2>
        <div class="flex flex-col gap-2">
          {#each healthConfig as metric}
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">{metric.label}</span>
              <span class="font-semibold {metric.class}">{metric.count}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Top alerts -->
    {#if metrics.topAlerts.length > 0}
      <div class="rounded-lg border bg-card p-4 flex flex-col gap-3">
        <h2 class="font-semibold text-sm">Recent Alerts</h2>
        <div class="flex flex-col divide-y divide-border">
          {#each metrics.topAlerts as alert}
            <div class="flex items-start justify-between gap-3 py-2 text-sm">
              <div class="flex flex-col gap-0.5 min-w-0">
                <span class="truncate font-medium">{alert.message}</span>
                {#if alert.entities}
                  <span class="text-xs text-muted-foreground truncate">
                    {(alert.entities as any).display_name ?? '—'}
                  </span>
                {/if}
              </div>
              <span
                class="inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-xs font-medium {severityClass(alert.severity)}"
              >
                {formatStringProper(alert.severity)}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {:catch}
    <!-- ❌ Error state -->
    <div class="text-destructive py-8">Failed to load metrics.</div>
  {/await}
</div>
