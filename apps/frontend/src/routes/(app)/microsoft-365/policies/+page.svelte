<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getConnectionIdForScope, getSiteIdsForScope } from '$lib/utils/scope-filter';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { formatStringProper, formatRelativeDate } from '$lib/utils/format.js';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterConnectionId = $derived(getConnectionIdForScope(scope, scopeId));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  const columns: DataTableColumn<Entity>[] = [
    {
      key: 'raw_data.state',
      title: 'State',
      sortable: true,
      cell: policyStateCell,
      filter: {
        type: 'select',
        operators: ['eq'],
        options: [
          { label: 'Enabled', value: 'enabled' },
          { label: 'Disabled', value: 'disabled' },
          { label: 'Report Only', value: 'enabledForReportingButNotEnforced' },
        ],
      },
    },
    {
      key: 'display_name',
      title: 'Name',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search name...',
      },
    },
    {
      key: 'connection_name',
      title: 'Tenant',
      sortable: true,
    },
    {
      key: 'raw_data.grantControls.builtInControls',
      title: 'Controls',
      cell: controlsCell,
    },
    {
      key: 'raw_data.conditions.users.includeUsers',
      title: 'Scope',
      cell: scopeCell,
    },
    {
      key: 'raw_data.modifiedDateTime',
      title: 'Last Modified',
      cell: lastModifiedCell,
    },
  ];

  function modifyQuery(q: any) {
    q.eq('integration_id', 'microsoft-365').eq('entity_type', 'policy');
    if (filterConnectionId) {
      q.eq('connection_id', filterConnectionId);
    }
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet policyStateCell({ value }: { row: Entity; value: string })}
  <Badge
    variant="outline"
    class={value === 'enabled'
      ? 'bg-green-500/15 text-green-500 border-green-500/30'
      : value === 'enabledForReportingButNotEnforced'
        ? 'bg-blue-500/15 text-blue-500 border-blue-500/30'
        : 'bg-muted/15 text-muted-foreground border-muted/30'}
  >
    {value === 'enabledForReportingButNotEnforced' ? 'Report Only' : formatStringProper(value)}
  </Badge>
{/snippet}

{#snippet controlsCell({ value }: { row: Entity; value: string[] })}
  {#if Array.isArray(value) && value.length > 0}
    <div class="flex flex-wrap gap-1">
      {#each value as control}
        <Badge variant="outline" class="bg-primary/15 text-primary border-primary/30 text-xs">
          {formatStringProper(control)}
        </Badge>
      {/each}
    </div>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet scopeCell({ value }: { row: Entity; value: string[] })}
  {#if Array.isArray(value) && value.includes('All')}
    <span class="text-sm">All Users</span>
  {:else if Array.isArray(value)}
    <span class="text-sm">{value.length} user(s)</span>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet lastModifiedCell({ value }: { row: Entity; value: string | null })}
  {value ? formatRelativeDate(value) : '—'}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Conditional Access Policies</h1>

  {#key `${scope}-${scopeId}`}
    <DataTable
      schema="views"
      table="d_entities_view"
      {columns}
      {modifyQuery}
      enableGlobalSearch={true}
      enableFilters={true}
      enablePagination={true}
      enableColumnToggle={true}
      enableExport={true}
      enableURLState={true}
    />
  {/key}
</div>
