<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import {
    ShieldCheck,
    ShieldAlert,
    Globe,
    Users,
    RefreshCw,
    Settings,
    ExternalLink,
    CircleAlert,
  } from '@lucide/svelte';
  import { MS_CAPABILITIES } from '@workspace/shared/config/microsoft';
  import type { MSCapabilityKey } from '@workspace/shared/types/integrations/microsoft/capabilities';

  let {
    connection,
    unmappedCount,
    orphanCount,
    onManage,
    onConsent,
  }: {
    connection: {
      id: string;
      external_id: string;
      name: string;
      status: string;
      meta: any;
    };
    unmappedCount: number;
    orphanCount: number;
    onManage: () => void;
    onConsent: () => void;
  } = $props();

  const isActive = $derived(connection.status === 'active');
  const domains = $derived<string[]>(connection.meta?.domains ?? []);
  const capabilities = $derived(connection.meta?.capabilities);
  const hasCapabilityIssues = $derived(
    !!capabilities && Object.values(capabilities).some((v) => v === false)
  );
  const hasIssues = $derived(unmappedCount > 0 || orphanCount > 0 || hasCapabilityIssues);
  const isHealthy = $derived(isActive && !hasIssues);
</script>

<Card.Root
  class="relative overflow-hidden flex flex-col {!isActive || hasIssues
    ? 'border-warning/40 bg-warning/5'
    : ''}"
>
  <!-- Colored top strip -->
  <div class="h-0.5 w-full shrink-0 {isHealthy ? 'bg-primary' : 'bg-warning'}"></div>

  <Card.Header class="pb-3">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        {#if isActive}
          <ShieldCheck class="h-5 w-5 text-primary shrink-0 mt-0.5" />
        {:else}
          <ShieldAlert class="h-5 w-5 text-warning shrink-0 mt-0.5" />
        {/if}
        <div class="min-w-0">
          <Card.Title class="text-sm font-semibold truncate">{connection.name}</Card.Title>
          <p class="text-xs font-mono text-muted-foreground truncate">{connection.external_id}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <Badge
          variant="outline"
          class={isActive
            ? 'bg-primary/15 text-primary border-primary/30 shrink-0'
            : 'bg-warning/15 text-warning border-warning/30 shrink-0'}
        >
          {isActive ? 'Active' : 'Pending'}
        </Badge>
        {#if connection.meta?.isMspTenant}
          <Badge
            variant="outline"
            class="bg-muted text-muted-foreground border-border shrink-0 text-xs"
          >
            MSP Tenant
          </Badge>
        {/if}
      </div>
    </div>
  </Card.Header>

  <Card.Content class="pb-3 flex-1">
    <div class="flex flex-wrap gap-1.5">
      {#if isActive && domains.length > 0}
        <div class="flex items-center gap-1 text-xs text-muted-foreground">
          <Globe class="h-3 w-3" />
          <span>{domains.length} domain{domains.length === 1 ? '' : 's'}</span>
        </div>
      {/if}

      {#if unmappedCount > 0}
        <Badge variant="outline" class="bg-warning/15 text-warning border-warning/30 text-xs">
          <CircleAlert class="h-3 w-3 mr-1" />
          {unmappedCount} unmapped
        </Badge>
      {/if}

      {#if orphanCount > 0}
        <Badge
          variant="outline"
          class="bg-destructive/15 text-destructive border-destructive/30 text-xs"
        >
          <Users class="h-3 w-3 mr-1" />
          {orphanCount} orphaned
        </Badge>
      {/if}

      {#if capabilities}
        {#each Object.entries(MS_CAPABILITIES) as [key, capMeta] (key)}
          {#if capabilities[key as MSCapabilityKey] === false}
            <Badge variant="outline" class="bg-warning/15 text-warning border-warning/30 text-xs">
              No {capMeta.label}
            </Badge>
          {/if}
        {/each}
      {/if}

      {#if !hasIssues && isActive && domains.length === 0}
        <span class="text-xs text-muted-foreground">No domains cached yet</span>
      {/if}

      {#if !isActive && !hasIssues}
        <span class="text-xs text-muted-foreground">Awaiting consent grant</span>
      {/if}
    </div>
  </Card.Content>

  <Card.Footer class="pt-0 gap-2">
    {#if isActive}
      <Button
        size="sm"
        variant="ghost"
        class="text-muted-foreground hover:text-foreground"
        onclick={onConsent}
      >
        <RefreshCw class="h-3 w-3 mr-1" />
        Reconsent
      </Button>
      <Button size="sm" variant="outline" class="ml-auto" onclick={onManage}>
        <Settings class="h-3 w-3 mr-1" />
        Manage
      </Button>
    {:else}
      <Button
        size="sm"
        variant="outline"
        class="w-full border-warning/30 text-warning hover:bg-warning/10"
        onclick={onConsent}
      >
        <ExternalLink class="h-3 w-3 mr-1" />
        Grant Consent
      </Button>
    {/if}
  </Card.Footer>
</Card.Root>
