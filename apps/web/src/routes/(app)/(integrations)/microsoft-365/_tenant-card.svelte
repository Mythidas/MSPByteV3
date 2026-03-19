<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { cn } from '$lib/utils';

  export type TenantStats = {
    link: { id: string; name: string };
    identities: { total: number; noMfa: number; disabled: number };
    licenses: { consumed: number; total: number };
    compliance: { pass: number; total: number };
    alerts: number;
  };

  const { stats }: { stats: TenantStats } = $props();

  function licensePct(s: TenantStats['licenses']): number {
    if (s.total === 0) return 0;
    return Math.round((s.consumed / s.total) * 100);
  }

  function compliancePct(s: TenantStats['compliance']): number {
    if (s.total === 0) return 0;
    return Math.round((s.pass / s.total) * 100);
  }

  function licenseBarColor(pct: number): string {
    if (pct >= 75) return 'bg-amber-500';
    return 'bg-success';
  }

  function licenseTextColor(pct: number): string {
    if (pct >= 75) return 'text-amber-500';
    return '';
  }

  function complianceBarColor(pct: number, total: number): string {
    if (total === 0) return 'bg-muted-foreground';
    if (pct === 100) return 'bg-success';
    if (pct >= 80) return 'bg-warning';
    return 'bg-destructive';
  }

  function complianceTextColor(pct: number, total: number): string {
    if (total === 0) return '';
    if (pct === 100) return 'text-success';
    if (pct >= 80) return 'text-warning';
    return 'text-destructive';
  }

  function handleClick() {
    scopeStore.currentLink = stats.link.id;
  }
</script>

<Card.Root
  class="p-4 cursor-pointer hover:border-primary/50 transition-colors"
  onclick={handleClick}
  role="button"
  tabindex={0}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  <!-- Header -->
  <div class="flex items-center justify-between">
    <span class="font-semibold text-base">{stats.link.name}</span>
    {#if stats.alerts > 0}
      <span
        class="text-xs font-medium px-2 py-0.5 rounded-full border bg-destructive/15 text-destructive border-destructive/30"
      >
        ● {stats.alerts} active alert{stats.alerts === 1 ? '' : 's'}
      </span>
    {:else}
      <span class="text-xs text-muted-foreground">● No alerts</span>
    {/if}
  </div>

  <div class="flex flex-col gap-1">
    <!-- Identities row -->
    <div class="flex items-center gap-2 text-sm">
      <span class="w-24 text-muted-foreground text-xs shrink-0">Identities</span>
      <span class="font-medium">{stats.identities.total} total</span>
      {#if stats.identities.noMfa > 0}
        <span
          class="text-xs px-1.5 py-0.5 rounded border bg-warning/15 text-warning border-warning/30"
        >
          {stats.identities.noMfa} no-MFA
        </span>
      {/if}
      {#if stats.identities.disabled > 0}
        <span
          class="text-xs px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border"
        >
          {stats.identities.disabled} disabled
        </span>
      {/if}
    </div>

    <!-- Licenses row -->
    <div class="flex items-center gap-2 text-sm">
      <span class="w-24 text-muted-foreground text-xs shrink-0">Licenses</span>
      {#if stats.licenses.total === 0}
        <span class="text-muted-foreground">—</span>
      {:else}
        {@const pct = licensePct(stats.licenses)}
        <span class={cn('font-medium', licenseTextColor(pct))}
          >{stats.licenses.consumed} / {stats.licenses.total} seats</span
        >
        <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div class={cn('h-full rounded-full', licenseBarColor(pct))} style="width: {pct}%"></div>
        </div>
        <span class="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
      {/if}
    </div>

    <!-- Compliance row -->
    <div class="flex items-center gap-2 text-sm">
      <span class="w-24 text-muted-foreground text-xs shrink-0">Compliance</span>
      {#if stats.compliance.total === 0}
        <span class="text-muted-foreground text-xs">No checks run</span>
      {:else}
        {@const pct = compliancePct(stats.compliance)}
        <span class="font-medium {complianceTextColor(pct, stats.compliance.total)}"
          >{stats.compliance.pass} / {stats.compliance.total} passing</span
        >
        <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full {complianceBarColor(pct, stats.compliance.total)}"
            style="width: {pct}%"
          ></div>
        </div>
        <span class="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
      {/if}
    </div>
  </div>
</Card.Root>
