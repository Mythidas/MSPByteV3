<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import { BellRing, ShieldAlert, ShieldCheck } from '@lucide/svelte';
  import { createM365Alerts } from '$lib/hooks/m365/useM365Alerts.svelte.js';
  import { createM365Compliance } from '$lib/hooks/m365/useM365Compliance.svelte.js';
  import { createM365Identities } from '$lib/hooks/m365/useM365Identities.svelte.js';

  const { tenantId, linkId }: { tenantId: string; linkId: string } = $props();

  const getParams = () => ({ tenantId, linkId });

  const alerts = createM365Alerts(getParams);
  const compliance = createM365Compliance(getParams);
  const identities = createM365Identities(getParams);

  const activeAlerts = $derived(alerts.data?.active ?? 0);
  const noMfa = $derived(identities.data?.noMfa ?? 0);
  const compliancePassRate = $derived(
    (compliance.data?.total ?? 0) > 0
      ? Math.round(((compliance.data?.pass ?? 0) / (compliance.data?.total ?? 1)) * 100)
      : 0,
  );
  const complianceTotal = $derived(compliance.data?.total ?? 0);

  const compBannerTint = $derived(
    complianceTotal === 0
      ? ''
      : compliancePassRate < 50
        ? 'bg-destructive/5 border-destructive/20'
        : compliancePassRate < 80
          ? 'bg-warning/5 border-warning/20'
          : 'bg-success/5 border-success/20',
  );
  const compBannerIconTint = $derived(
    complianceTotal === 0
      ? 'bg-muted'
      : compliancePassRate < 50
        ? 'bg-destructive/10'
        : compliancePassRate < 80
          ? 'bg-warning/10'
          : 'bg-success/10',
  );
  const compBannerTextTint = $derived(
    complianceTotal === 0
      ? 'text-muted-foreground'
      : compliancePassRate < 50
        ? 'text-destructive'
        : compliancePassRate < 80
          ? 'text-warning'
          : 'text-success',
  );
</script>

<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
  <!-- Active Alerts -->
  <a href="/microsoft-365/alerts">
    <Card.Root
      class="p-4 hover:border-primary/50 cursor-pointer transition-colors {activeAlerts > 0
        ? 'bg-destructive/5 border-destructive/20'
        : ''}"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center size-9 rounded-full shrink-0 {activeAlerts > 0
            ? 'bg-destructive/10'
            : 'bg-muted'}"
        >
          <BellRing
            class="size-4 {activeAlerts > 0 ? 'text-destructive' : 'text-muted-foreground'}"
          />
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-muted-foreground">Active Alerts</span>
          {#if alerts.loading}
            <span class="h-7 w-10 rounded bg-muted-foreground/15 inline-block"></span>
          {:else}
            <span class="text-2xl font-bold leading-none {activeAlerts > 0 ? 'text-destructive' : ''}"
              >{activeAlerts}</span
            >
          {/if}
        </div>
      </div>
    </Card.Root>
  </a>

  <!-- MFA Not Enforced -->
  <a href="/microsoft-365/identities?view=no-mfa">
    <Card.Root
      class="p-4 hover:border-primary/50 cursor-pointer transition-colors {noMfa > 0
        ? 'bg-warning/5 border-warning/20'
        : ''}"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center size-9 rounded-full shrink-0 {noMfa > 0
            ? 'bg-warning/10'
            : 'bg-muted'}"
        >
          <ShieldAlert
            class="size-4 {noMfa > 0 ? 'text-warning' : 'text-muted-foreground'}"
          />
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-muted-foreground">MFA Not Enforced</span>
          {#if identities.loading}
            <span class="h-7 w-10 rounded bg-muted-foreground/15 inline-block"></span>
          {:else}
            <span class="text-2xl font-bold leading-none {noMfa > 0 ? 'text-warning' : ''}"
              >{noMfa}</span
            >
          {/if}
        </div>
      </div>
    </Card.Root>
  </a>

  <!-- Compliance % -->
  <a href="/microsoft-365/compliance">
    <Card.Root
      class="p-4 hover:border-primary/50 cursor-pointer transition-colors {compBannerTint}"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center size-9 rounded-full shrink-0 {compBannerIconTint}"
        >
          <ShieldCheck class="size-4 {compBannerTextTint}" />
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-xs text-muted-foreground">Compliance</span>
          {#if compliance.loading}
            <span class="h-7 w-10 rounded bg-muted-foreground/15 inline-block"></span>
          {:else}
            <span class="text-2xl font-bold leading-none {compBannerTextTint}">
              {complianceTotal === 0 ? '—' : `${compliancePassRate}%`}
            </span>
          {/if}
        </div>
      </div>
    </Card.Root>
  </a>
</div>
