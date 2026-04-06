<script lang="ts">
  import { supabase } from '$lib/utils/supabase.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import { INTEGRATIONS } from '@workspace/shared/config/integrations/integrations';
  import { cn } from '$lib/utils';
  import type { SophosLinkGridRow, Tier } from '$lib/hooks/sophos/useSophosLinkGrid.svelte.js';

  const { tenantId, link }: { tenantId: string; link: SophosLinkGridRow } = $props();

  let alertCount = $state<number | null>(null);
  let alertLoading = $state(true);

  const isDispositioned = $derived(link.status === 'dispositioned');

  $effect(() => {
    if (!link.siteId) {
      alertLoading = false;
      return;
    }

    alertLoading = true;
    const integration = INTEGRATIONS['sophos-partner'];

    void (async () => {
      try {
        const q = supabase
          .schema('views')
          .from('d_alerts_view')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('site_id', link.siteId!)
          .eq('status', 'active')
          .in(
            'entity_type',
            integration.supportedTypes.filter((t) => t.type).map((t) => t.type)
          );
        const res = await (q as any);
        alertCount = res.count ?? 0;
      } finally {
        alertLoading = false;
      }
    })();
  });

  function handleClick() {
    if (!isDispositioned && link.siteId) {
      scopeStore.currentSite = link.siteId;
    }
  }

  function dispositionLabel(d: string | null): string {
    if (d === 'third_party') return 'Third Party';
    if (d === 'not_managed') return 'Not Managed';
    return 'Dispositioned';
  }
</script>

{#snippet tierBadge(tier: Tier | null)}
  {#if tier === 'MDR'}
    <span
      class="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium bg-primary/15 text-primary border-primary/30 w-fit"
    >
      MDR
    </span>
  {:else if tier === 'XDR'}
    <span
      class="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium bg-warning/15 text-warning border-warning/30 w-fit"
    >
      XDR
    </span>
  {:else if tier === 'Endpoint'}
    <span
      class="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium bg-success/15 text-success border-success/30 w-fit"
    >
      Endpoint
    </span>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

<div
  class={cn(
    'grid grid-cols-[2fr_120px_90px_90px_110px_1fr] items-center gap-4 px-3 py-2.5 rounded border bg-card/70 text-sm',
    isDispositioned
      ? 'opacity-60 cursor-default'
      : 'cursor-pointer hover:bg-muted/40 hover:border-border transition-colors'
  )}
  role={isDispositioned ? undefined : 'button'}
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  <!-- Site Name -->
  <span class="font-medium truncate">{link.siteName}</span>

  <!-- Status -->
  {#if isDispositioned}
    <span
      class="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium bg-muted text-muted-foreground border-border w-fit"
    >
      {dispositionLabel(link.disposition)}
    </span>
  {:else}
    <span
      class="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium bg-success/15 text-success border-success/30 w-fit"
    >
      Active
    </span>
  {/if}

  <!-- Server tier -->
  {@render tierBadge(link.serverTier)}

  <!-- User tier -->
  {@render tierBadge(link.userTier)}

  <!-- Alerts -->
  {#if alertLoading}
    <span class="h-4 w-16 rounded bg-muted-foreground/15 inline-block"></span>
  {:else if (alertCount ?? 0) > 0}
    <span
      class="text-xs font-medium px-2 py-0.5 rounded-full border bg-destructive/15 text-destructive border-destructive/30 w-fit"
    >
      ● {alertCount} alert{alertCount === 1 ? '' : 's'}
    </span>
  {:else}
    <span class="text-xs text-muted-foreground">● No alerts</span>
  {/if}

  <!-- Note -->
  <span class="text-xs text-muted-foreground truncate">{link.note ?? ''}</span>
</div>
