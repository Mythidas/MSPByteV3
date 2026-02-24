<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getConnectionIdForScope } from '$lib/utils/scope-filter';
  import Badge from '$lib/components/ui/badge/badge.svelte';

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
      key: 'raw_data.RejectDirectSend',
      title: 'Reject Direct Send',
      cell: rejectDirectSendCell,
    },
    {
      key: 'raw_data.DisplayName',
      title: 'Org Name',
      sortable: true,
      searchable: true,
    },
    {
      key: 'connection_name',
      title: 'Tenant',
      sortable: true,
    },
  ];

  function modifyQuery(q: any) {
    q.eq('integration_id', 'microsoft-365').eq('entity_type', 'exchange-config');
    if (filterConnectionId) {
      q.eq('connection_id', filterConnectionId);
    }
  }
</script>

{#snippet rejectDirectSendCell({ value }: { row: Entity; value: boolean })}
  <Badge
    variant="outline"
    class={value
      ? 'bg-green-500/15 text-green-500 border-green-500/30'
      : 'bg-destructive/15 text-destructive border-destructive/30'}
  >
    {value ? 'True' : 'False'}
  </Badge>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Exchange Config</h1>

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
