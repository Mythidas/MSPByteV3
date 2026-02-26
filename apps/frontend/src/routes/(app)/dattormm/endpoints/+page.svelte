<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type RowAction,
    stateColumn,
    tagsColumn,
    relativeDateColumn,
    displayNameColumn,
  } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  const columns: DataTableColumn<Entity>[] = $derived([
    stateColumn<Entity>(),
    displayNameColumn<Entity>(),
    {
      key: 'site_name',
      title: 'Site',
      sortable: true,
      searchable: true,
    },
    {
      key: 'raw_data.deviceType.category',
      title: 'Type',
      sortable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search type...',
      },
    },
    relativeDateColumn<Entity>('raw_data.lastSeen', 'Last Online', { sortable: true }),
    tagsColumn<Entity>(),
  ]);

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function modifyQuery(q: any) {
    q.eq('integration_id', 'dattormm').eq('entity_type', 'endpoint');
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Endpoints</h1>

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
