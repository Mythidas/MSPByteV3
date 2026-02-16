<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import type { Tables } from '@workspace/shared/types/database';

  type EntityAlert = Tables<'public', 'entity_alerts'>;
  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  let currentTab = $state('alerts');

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function formatRelative(dateStr: string | null): string {
    if (!dateStr) return '—';
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString();
  }

  // --- Severity badge ---
  function severityClass(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'high':
        return 'bg-orange-500/15 text-orange-600 border-orange-500/30';
      case 'medium':
        return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
      case 'low':
        return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }

  // --- Alert status badge ---
  function alertStatusClass(status: string): string {
    switch (status) {
      case 'active':
        return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'resolved':
        return 'bg-green-500/15 text-green-600 border-green-500/30';
      case 'suppressed':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }

  // --- Entity state badge ---
  function stateClass(state: string | null): string {
    switch (state) {
      case 'normal':
        return 'bg-green-500/15 text-green-600 border-green-500/30';
      case 'warn':
        return 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30';
      case 'critical':
        return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'low':
        return 'bg-blue-500/15 text-blue-600 border-blue-500/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  }

  // --- Shared query modifier for site scope ---
  function applySiteFilter(q: any) {
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }

  // --- Alerts ---
  const alertColumns: DataTableColumn<EntityAlert>[] = [
    { key: 'alert_type', title: 'Type', sortable: true, searchable: true },
    { key: 'severity', title: 'Severity', sortable: true, cell: severityCell },
    { key: 'status', title: 'Status', sortable: true, cell: alertStatusCell },
    { key: 'message', title: 'Message', sortable: false, searchable: true },
    { key: 'last_seen_at', title: 'Last Seen', sortable: true, cell: relativeCell },
    { key: 'created_at', title: 'Created', sortable: true, cell: dateCell },
  ];

  function modifyAlertQuery(q: any) {
    q.eq('integration_id', 'dattormm');
    applySiteFilter(q);
  }

  // --- Endpoints ---
  const endpointColumns: DataTableColumn<Entity>[] = [
    { key: 'display_name', title: 'Name', sortable: true, searchable: true },
    { key: 'state', title: 'State', sortable: true, cell: stateCell },
    { key: 'tags', title: 'Tags', sortable: false, cell: tagsCell },
    { key: 'last_seen_at', title: 'Last Seen', sortable: true, cell: relativeCell },
    { key: 'updated_at', title: 'Updated', sortable: true, cell: relativeCell },
  ];

  function modifyEndpointQuery(q: any) {
    q.eq('entity_type', 'endpoint');
    q.eq('integration_id', 'dattormm');
    applySiteFilter(q);
  }

  // --- Companies ---
  const companyColumns: DataTableColumn<Entity>[] = [
    { key: 'display_name', title: 'Name', sortable: true, searchable: true },
    { key: 'state', title: 'State', sortable: true, cell: stateCell },
    { key: 'tags', title: 'Tags', sortable: false, cell: tagsCell },
    { key: 'last_seen_at', title: 'Last Seen', sortable: true, cell: relativeCell },
    { key: 'updated_at', title: 'Updated', sortable: true, cell: relativeCell },
  ];

  function modifyCompanyQuery(q: any) {
    q.eq('entity_type', 'company');
    q.eq('integration_id', 'dattormm');
    applySiteFilter(q);
  }
</script>

{#snippet severityCell({ value }: { row: EntityAlert; value: string })}
  <Badge variant="outline" class={severityClass(value)}>{value}</Badge>
{/snippet}

{#snippet alertStatusCell({ value }: { row: EntityAlert; value: string })}
  <Badge variant="outline" class={alertStatusClass(value)}>{value}</Badge>
{/snippet}

{#snippet stateCell({ value }: { row: Entity; value: string | null })}
  <Badge variant="outline" class={stateClass(value)}>{value ?? '—'}</Badge>
{/snippet}

{#snippet tagsCell({ value }: { row: Entity; value: string[] | null })}
  {#if value?.length}
    <div class="flex flex-wrap gap-1">
      {#each value as tag}
        <Badge variant="outline" class="bg-primary/15 text-primary border-primary/30 text-xs">
          {tag}
        </Badge>
      {/each}
    </div>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet relativeCell({ value }: { row: any; value: string | null })}
  {formatRelative(value)}
{/snippet}

{#snippet dateCell({ value }: { row: any; value: string | null })}
  {formatDate(value)}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <Tabs.Root bind:value={currentTab} class="size-full flex flex-col">
    <Tabs.List>
      <Tabs.Trigger value="alerts">Alerts</Tabs.Trigger>
      <Tabs.Trigger value="endpoints">Endpoints</Tabs.Trigger>
      <Tabs.Trigger value="companies">Companies</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="alerts" class="flex-1 min-h-0">
      {#key `${scope}-${scopeId}`}
        <DataTable
          schema="public"
          table="entity_alerts"
          columns={alertColumns}
          modifyQuery={modifyAlertQuery}
          enableGlobalSearch={true}
          enableFilters={true}
          enablePagination={true}
          enableColumnToggle={true}
          enableExport={true}
          enableURLState={true}
        />
      {/key}
    </Tabs.Content>

    <Tabs.Content value="endpoints" class="flex-1 min-h-0">
      {#key `${scope}-${scopeId}`}
        <DataTable
          schema="views"
          table="d_entities_view"
          columns={endpointColumns}
          modifyQuery={modifyEndpointQuery}
          enableGlobalSearch={true}
          enableFilters={true}
          enablePagination={true}
          enableColumnToggle={true}
          enableExport={true}
          enableURLState={true}
        />
      {/key}
    </Tabs.Content>

    <Tabs.Content value="companies" class="flex-1 min-h-0">
      {#key `${scope}-${scopeId}`}
        <DataTable
          schema="views"
          table="d_entities_view"
          columns={companyColumns}
          modifyQuery={modifyCompanyQuery}
          enableGlobalSearch={true}
          enableFilters={true}
          enablePagination={true}
          enableColumnToggle={true}
          enableExport={true}
          enableURLState={true}
        />
      {/key}
    </Tabs.Content>
  </Tabs.Root>
</div>
