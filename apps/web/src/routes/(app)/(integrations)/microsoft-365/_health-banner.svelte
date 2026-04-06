<script lang="ts">
  import * as Item from '$lib/components/ui/item/index.js';
  import { BellRing } from '@lucide/svelte';
  import { createM365Alerts } from '$lib/hooks/m365/useM365Alerts.svelte.js';
  import { cn } from '$lib/utils';

  const { tenantId, linkId }: { tenantId: string; linkId: string } = $props();

  const getParams = () => ({ tenantId, linkId });

  const alerts = createM365Alerts(getParams);

  const activeAlerts = $derived(alerts.data?.active ?? 0);
</script>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
  <!-- Active Alerts -->
  <Item.Root
    variant="muted"
    class={cn(activeAlerts > 0 && 'bg-destructive/5 border-destructive/20')}
  >
    {#snippet child({ props })}
      <a href="/microsoft-365/alerts" {...props}>
        <Item.Media>
          <BellRing
            class="size-4 {activeAlerts > 0 ? 'text-destructive' : 'text-muted-foreground'}"
          />
        </Item.Media>
        <Item.Content>Active Alerts</Item.Content>
        <Item.Actions>
          {#if alerts.loading}
            <span class="w-10 rounded bg-muted-foreground/15 inline-block"></span>
          {:else}
            <span
              class="text-2xl font-bold leading-none {activeAlerts > 0 ? 'text-destructive' : ''}"
              >{activeAlerts}</span
            >
          {/if}
        </Item.Actions>
      </a>
    {/snippet}
  </Item.Root>
</div>
