<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { ChevronRight } from '@lucide/svelte';
  import { createM365Compliance } from '$lib/hooks/m365/useM365Compliance.svelte.js';

  const { tenantId, linkId }: { tenantId: string; linkId: string } = $props();

  const getParams = () => ({ tenantId, linkId });
  const hook = createM365Compliance(getParams);

  const d = $derived(hook.data);
  const passRate = $derived(
    (d?.total ?? 0) > 0 ? Math.round(((d?.pass ?? 0) / (d?.total ?? 1)) * 100) : 0,
  );

  const rateTint = $derived(
    passRate < 50
      ? 'bg-destructive/5 border-destructive/20'
      : passRate < 80
        ? 'bg-warning/5 border-warning/20'
        : 'bg-success/5 border-success/20',
  );
  const rateTextTint = $derived(
    passRate < 50 ? 'text-destructive' : passRate < 80 ? 'text-warning' : 'text-success',
  );

  const SEVERITY_CLASSES: Record<string, string> = {
    critical: 'bg-destructive/15 text-destructive border border-destructive/30',
    high: 'bg-warning/15 text-warning border border-warning/30',
    medium: 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
    low: 'bg-muted text-muted-foreground border border-border',
    info: 'bg-muted text-muted-foreground border border-border',
  };
</script>

{#if hook.loading}
  <section class="flex flex-col gap-3">
    <span class="h-3 w-24 rounded bg-muted-foreground/15"></span>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {#each Array(4) as _}
        <Card.Root class="p-4">
          <div class="flex flex-col gap-1.5">
            <span class="h-3 w-20 rounded bg-muted-foreground/15"></span>
            <span class="h-7 w-12 rounded bg-muted-foreground/15"></span>
          </div>
        </Card.Root>
      {/each}
    </div>
    <Card.Root class="overflow-hidden">
      {#each Array(3) as _}
        <div class="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
          <span class="h-5 w-16 rounded bg-muted-foreground/15"></span>
          <span class="h-3 flex-1 rounded bg-muted-foreground/15"></span>
        </div>
      {/each}
    </Card.Root>
  </section>
{:else if hook.error}
  <p class="text-sm text-destructive">{hook.error}</p>
{:else if d && d.total > 0}
  <section class="flex flex-col gap-3">
    <h2 class="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Compliance</h2>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <a href="/microsoft-365/compliance">
        <Card.Root
          class="p-4 hover:border-primary/50 cursor-pointer transition-colors {rateTint}"
        >
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Pass Rate</span>
            <span class="text-2xl font-bold {rateTextTint}">{passRate}%</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/compliance">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Passing</span>
            <span class="text-2xl font-bold text-success">{d.pass}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/compliance">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Failing</span>
            <span class="text-2xl font-bold {d.fail > 0 ? 'text-destructive' : ''}">{d.fail}</span>
          </div>
        </Card.Root>
      </a>
      <a href="/microsoft-365/compliance">
        <Card.Root class="p-4 hover:border-primary/50 cursor-pointer transition-colors">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">Total Checks</span>
            <span class="text-2xl font-bold">{d.total}</span>
          </div>
        </Card.Root>
      </a>
    </div>

    {#if d.topFailing.length > 0}
      <Card.Root class="overflow-hidden">
        <div class="px-4 py-3 border-b">
          <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >Top Failing Checks</span
          >
        </div>
        {#each d.topFailing as check (check.id)}
          <a
            href="/microsoft-365/compliance"
            class="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors border-b last:border-b-0"
          >
            <span
              class="text-xs font-medium px-2 py-0.5 rounded capitalize shrink-0 {SEVERITY_CLASSES[
                check.severity
              ] ?? SEVERITY_CLASSES['info']}"
            >
              {check.severity}
            </span>
            <span class="text-sm flex-1 truncate">{check.name}</span>
            <ChevronRight class="size-4 text-muted-foreground shrink-0" />
          </a>
        {/each}
      </Card.Root>
    {/if}
  </section>
{/if}
