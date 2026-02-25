<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getConnectionIdForScope, getSiteIdsForScope } from '$lib/utils/scope-filter';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterConnectionId = $derived(getConnectionIdForScope(scope, scopeId));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  const columns: DataTableColumn<Entity>[] = [
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
      key: 'raw_data.skuPartNumber',
      title: 'SKU',
      sortable: true,
      searchable: true,
    },
    {
      key: 'raw_data.prepaidUnits.enabled',
      title: 'Total',
      sortable: true,
    },
    {
      key: 'raw_data.consumedUnits',
      title: 'Assigned',
      sortable: true,
    },
    {
      key: 'raw_data',
      title: 'Available',
      cell: availableCell,
    },
    {
      key: 'raw_data.capabilityStatus',
      title: 'Status',
      filter: {
        type: 'select',
        operators: ['eq'],
        options: [
          { label: 'Enabled', value: 'Enabled' },
          { label: 'Warning', value: 'Warning' },
          { label: 'Suspended', value: 'Suspended' },
          { label: 'Deleted', value: 'Deleted' },
          { label: 'Locked Out', value: 'LockedOut' },
        ],
      },
      cell: capabilityStatusCell,
    },
    {
      key: 'connection_name',
      title: 'Tenant',
      sortable: true,
    },
  ];

  function modifyQuery(q: any) {
    q.eq('integration_id', 'microsoft-365').eq('entity_type', 'license');
    if (filterConnectionId) {
      q.eq('connection_id', filterConnectionId);
    }
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet availableCell({ value }: { row: Entity; value: Record<string, any> })}
  {@const total = value?.prepaidUnits?.enabled ?? 0}
  {@const consumed = value?.consumedUnits ?? 0}
  {@const available = total - consumed}
  <span class={available < 0 ? 'text-destructive font-semibold' : ''}>
    {available}
  </span>
{/snippet}

{#snippet capabilityStatusCell({ value }: { row: Entity; value: string })}
  <Badge
    variant="outline"
    class={value === 'Enabled'
      ? 'bg-green-500/15 text-green-500 border-green-500/30'
      : value === 'Warning'
        ? 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30'
        : 'bg-destructive/15 text-destructive border-destructive/30'}
  >
    {value}
  </Badge>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Licenses</h1>

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
