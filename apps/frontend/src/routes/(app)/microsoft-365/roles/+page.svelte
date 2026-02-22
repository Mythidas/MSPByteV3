<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getConnectionIdForScope } from '$lib/utils/scope-filter';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterConnectionId = $derived(getConnectionIdForScope(scope, scopeId));

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
      key: 'member_count',
      title: 'Members',
      sortable: true,
    },
    {
      key: 'raw_data.description',
      title: 'Description',
    },
    {
      key: 'connection_name',
      title: 'Tenant',
      sortable: true,
    },
  ];

  function modifyQuery(q: any) {
    q.eq('integration_id', 'microsoft-365').eq('entity_type', 'role');
    if (filterConnectionId) {
      q.eq('connection_id', filterConnectionId);
    }
  }
</script>

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Roles</h1>

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
