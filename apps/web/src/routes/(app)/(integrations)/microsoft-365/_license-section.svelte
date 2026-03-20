<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { createM365Licenses } from '$lib/hooks/m365/useM365Licenses.svelte.js';

  const { tenantId, linkId }: { tenantId: string; linkId: string } = $props();

  const getParams = () => ({ tenantId, linkId });
  const hook = createM365Licenses(getParams);

  const d = $derived(hook.data);
  const utilPct = $derived(
    d && d.totalConsumed + d.totalAvailable > 0
      ? Math.round((d.totalConsumed / (d.totalConsumed + d.totalAvailable)) * 100)
      : 0,
  );
  const barColor = $derived(
    utilPct >= 90 ? 'bg-destructive' : utilPct >= 75 ? 'bg-amber-500' : 'bg-success',
  );
  const textColor = $derived(
    utilPct >= 90 ? 'text-destructive' : utilPct >= 75 ? 'text-amber-500' : '',
  );
</script>

<section class="flex flex-col gap-3">
  <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Licenses</h2>

  {#if hook.loading}
    <Card.Root class="p-4">
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <div class="flex flex-col gap-1.5">
            <span class="h-3 w-28 rounded bg-muted-foreground/15"></span>
            <span class="h-7 w-16 rounded bg-muted-foreground/15"></span>
          </div>
          <div class="flex flex-col gap-1.5 items-end">
            <span class="h-3 w-24 rounded bg-muted-foreground/15"></span>
            <span class="h-3 w-16 rounded bg-muted-foreground/15"></span>
          </div>
        </div>
        <div class="w-full h-2 rounded-full bg-muted-foreground/15"></div>
      </div>
    </Card.Root>
  {:else if hook.error}
    <p class="text-sm text-destructive">{hook.error}</p>
  {:else if d}
    <a href="/microsoft-365/licenses">
      <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="flex flex-col gap-0.5">
              <span class="text-xs text-muted-foreground">Seat Utilization</span>
              <span class="text-2xl font-bold {textColor}">{utilPct}%</span>
            </div>
            <div class="flex flex-col items-end gap-0.5 text-right">
              <span class="text-xs text-muted-foreground"
                >{d.totalConsumed} / {d.totalConsumed + d.totalAvailable} seats</span
              >
              <span class="text-xs text-muted-foreground">{d.totalSKUs} SKUs</span>
            </div>
          </div>
          <div class="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div class="h-full rounded-full transition-all {barColor}" style="width: {utilPct}%"
            ></div>
          </div>
        </div>
      </Card.Root>
    </a>
  {/if}
</section>
