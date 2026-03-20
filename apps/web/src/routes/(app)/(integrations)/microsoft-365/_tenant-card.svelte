<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { cn } from '$lib/utils';
  import { createM365TenantCard } from '$lib/hooks/m365/useM365TenantCard.svelte.js';

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
    return 'bg-emerald-500';
  }

  function complianceTextColor(pct: number, total: number): string {
    if (total === 0) return '';
    if (pct === 100) return 'text-success';
    if (pct >= 80) return 'text-warning';
    return 'text-destructive';
  }

  function handleClick() {
    scopeStore.currentLink = link.id;
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
  <div class="flex items-center justify-between mb-2">
    <span class="font-semibold text-base">{link.name}</span>
    {#if hook.loading}
      <span class="h-4 w-20 rounded bg-muted-foreground/15"></span>
    {:else if d && d.alerts > 0}
      <span
        class="text-xs font-medium px-2 py-0.5 rounded-full border bg-destructive/15 text-destructive border-destructive/30"
      >
        ● {d.alerts} active alert{d.alerts === 1 ? '' : 's'}
      </span>
    {:else}
      <span class="text-xs text-muted-foreground">● No alerts</span>
    {/if}
  </div>

  {#if hook.loading}
    <div class="flex flex-col gap-2">
      {#each Array(3) as _}
        <div class="h-3 w-full rounded bg-muted-foreground/10"></div>
      {/each}
    </div>
  {:else if d}
    <div class="flex flex-col gap-1">
      <!-- Identities row -->
      <div class="flex items-center gap-2 text-sm">
        <span class="w-24 text-muted-foreground text-xs shrink-0">Identities</span>
        <span class="font-medium">{d.identities.total} total</span>
        {#if d.identities.noMfa > 0}
          <span
            class="text-xs px-1.5 py-0.5 rounded border bg-warning/15 text-warning border-warning/30"
          >
            {d.identities.noMfa} no-MFA
          </span>
        {/if}
        {#if d.identities.disabled > 0}
          <span
            class="text-xs px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border"
          >
            {d.identities.disabled} disabled
          </span>
        {/if}
      </div>

      <!-- Licenses row -->
      <div class="flex items-center gap-2 text-sm">
        <span class="w-24 text-muted-foreground text-xs shrink-0">Licenses</span>
        {#if d.licenses.total === 0}
          <span class="text-muted-foreground">—</span>
        {:else}
          {@const pct = licensePct(d.licenses.consumed, d.licenses.total)}
          <span class={cn('font-medium', licenseTextColor(pct))}
            >{d.licenses.consumed} / {d.licenses.total} seats</span
          >
          <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              class={cn('h-full rounded-full', licenseBarColor(pct))}
              style="width: {pct}%"
            ></div>
          </div>
          <span class="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
        {/if}
      </div>

      <!-- Compliance row -->
      <div class="flex items-center gap-2 text-sm">
        <span class="w-24 text-muted-foreground text-xs shrink-0">Compliance</span>
        {#if d.compliance.total === 0}
          <span class="text-muted-foreground text-xs">No checks run</span>
        {:else}
          {@const pct = compliancePct(d.compliance.pass, d.compliance.total)}
          <span class="font-medium {complianceTextColor(pct, d.compliance.total)}"
            >{d.compliance.pass} / {d.compliance.total} passing</span
          >
          <div class="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full {complianceBarColor(pct, d.compliance.total)}"
              style="width: {pct}%"
            ></div>
          </div>
          <span class="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
        {/if}
      </div>
    </div>
  {/if}
</Card.Root>
