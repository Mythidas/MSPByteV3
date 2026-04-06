<script lang="ts">
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { cn } from '$lib/utils';
  import { createM365TenantCard } from '$lib/hooks/m365/useM365TenantCard.svelte.js';
  import * as Tooltip from '$lib/components/ui/tooltip/index.js';

  const GRID_SIZE = 'grid-cols-[0.75fr_240px_230px_230px_110px]';

  const { tenantId, link }: { tenantId: string; link: { id: string; name: string } } = $props();

  const hook = createM365TenantCard(() => ({ tenantId, linkId: link.id }));
  const d = $derived(hook.data);

  function licensePct(consumed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((consumed / total) * 100);
  }

  function compliancePct(pass: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((pass / total) * 100);
  }

  function licenseBarColor(pct: number): string {
    if (pct > 100) return 'bg-destructive';
    if (pct < 80) return 'bg-warning';
    return 'bg-success';
  }

  function licenseTextColor(pct: number): string {
    if (pct > 100) return 'text-destructive';
    if (pct < 80) return 'text-warning';
    return 'text-success';
  }

  function complianceBarColor(pct: number, total: number): string {
    if (total === 0) return 'bg-muted-foreground';
    if (pct === 100) return 'bg-success';
    if (pct >= 80) return 'bg-warning';
    return 'bg-destructive';
  }

  function complianceTextColor(pct: number, total: number): string {
    if (total === 0) return 'text-muted-foreground';
    if (pct === 100) return 'text-success';
    if (pct >= 80) return 'text-warning';
    return 'text-destructive';
  }

  function handleClick() {
    scopeStore.currentLink = link.id;
  }
</script>

<div
  class="grid {GRID_SIZE} items-center gap-6 px-3 py-2.5 rounded border bg-card/70 text-sm cursor-pointer hover:bg-muted/40 hover:border-border transition-colors"
  role="button"
  tabindex={0}
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  <!-- Tenant Name -->
  <span class="font-medium truncate">{link.name}</span>

  <!-- Identities: segmented bar with tooltip -->
  {#if hook.loading}
    <span class="h-4 w-28 rounded bg-muted-foreground/15"></span>
  {:else if d}
    {@const healthy = Math.max(0, d.identities.total - d.identities.noMfa - d.identities.disabled)}
    {@const healthyPct = d.identities.total > 0 ? (healthy / d.identities.total) * 100 : 100}
    {@const noMfaPct = d.identities.total > 0 ? (d.identities.noMfa / d.identities.total) * 100 : 0}
    {@const disabledPct =
      d.identities.total > 0 ? (d.identities.disabled / d.identities.total) * 100 : 0}
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <div class="flex items-center gap-2" {...props}>
              <span class="font-medium text-xs tabular-nums w-6 shrink-0 text-right">
                {d.identities.total}
              </span>
              <div class="flex-1 h-1.5 rounded-full overflow-hidden flex bg-muted">
                <div class="bg-success h-full" style="width: {healthyPct}%"></div>
                <div class="bg-warning h-full" style="width: {noMfaPct}%"></div>
                <div class="bg-muted-foreground/50 h-full" style="width: {disabledPct}%"></div>
              </div>
              <!-- Fixed-width slots: always rendered so bar position never shifts -->
              <div class="flex items-center gap-1.5 text-xs shrink-0">
                <span
                  class={cn(
                    'tabular-nums w-8 text-right font-medium',
                    d.identities.noMfa > 0 ? 'text-warning' : 'invisible'
                  )}
                >
                  ● {d.identities.noMfa}
                </span>
                <span
                  class={cn(
                    'tabular-nums w-8 text-right',
                    d.identities.disabled > 0 ? 'text-muted-foreground' : 'invisible'
                  )}
                >
                  ● {d.identities.disabled}
                </span>
              </div>
            </div>
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content side="top" sideOffset={6}>
          <div class="flex flex-col gap-1.5 text-xs">
            <div class="flex items-center gap-2">
              <span class="size-2 rounded-full bg-success shrink-0"></span>
              <span class="text-background/70">Healthy</span>
              <span class="ml-auto tabular-nums font-medium">{healthy}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="size-2 rounded-full bg-warning shrink-0"></span>
              <span class="text-background/70">No MFA enforced</span>
              <span class="ml-auto tabular-nums font-medium">{d.identities.noMfa}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="size-2 rounded-full bg-muted-foreground/50 shrink-0"></span>
              <span class="text-background/70">Disabled</span>
              <span class="ml-auto tabular-nums font-medium">{d.identities.disabled}</span>
            </div>
          </div>
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}

  <!-- Licenses -->
  {#if hook.loading}
    <span class="h-4 w-28 rounded bg-muted-foreground/15"></span>
  {:else if d}
    {#if d.licenses.total === 0}
      <span class="text-muted-foreground">—</span>
    {:else}
      {@const pct = licensePct(d.licenses.consumed, d.licenses.total)}
      <div class="flex items-center gap-2">
        <span class={cn('text-xs font-medium tabular-nums min-w-18', licenseTextColor(pct))}>
          {d.licenses.consumed} / {d.licenses.total}
        </span>
        <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
          <div class={cn('h-full rounded-full', licenseBarColor(pct))} style="width: {pct}%"></div>
        </div>
        <span class="text-xs text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
      </div>
    {/if}
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}

  <!-- Compliance -->
  {#if hook.loading}
    <span class="h-4 w-28 rounded bg-muted-foreground/15"></span>
  {:else if d}
    {#if d.compliance.total === 0}
      <span class="text-xs text-muted-foreground">No checks run</span>
    {:else}
      {@const pct = compliancePct(d.compliance.pass, d.compliance.total)}
      <div class="flex items-center gap-2">
        <span
          class={cn(
            'text-xs font-medium tabular-nums min-w-14',
            complianceTextColor(pct, d.compliance.total)
          )}
        >
          {d.compliance.pass} / {d.compliance.total}
        </span>
        <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden shrink-0">
          <div
            class={cn('h-full rounded-full', complianceBarColor(pct, d.compliance.total))}
            style="width: {pct}%"
          ></div>
        </div>
        <span class="text-xs text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
      </div>
    {/if}
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}

  <!-- Alerts -->
  {#if hook.loading}
    <span class="h-4 w-16 rounded bg-muted-foreground/15"></span>
  {:else if d && d.alerts > 0}
    <span
      class="text-xs font-medium px-2 py-0.5 rounded-full border bg-destructive/15 text-destructive border-destructive/30 w-fit"
    >
      ● {d.alerts} alert{d.alerts === 1 ? '' : 's'}
    </span>
  {:else}
    <span class="text-xs text-muted-foreground">● No alerts</span>
  {/if}
</div>
