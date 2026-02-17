<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';
  import { formatDate } from '$lib/utils/format.js';

  type Tickets = Tables<'views', 'd_agent_tickets_view'>;

  const { data } = $props();

  const columns: DataTableColumn<Tickets>[] = $derived([
    {
      key: 'ticket_id',
      title: 'Halo ID',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search Halo ID...',
      },
    },
    {
      key: 'site_name',
      title: 'Site',
      sortable: true,
      searchable: true,
    },
    {
      key: 'agent_name',
      title: 'Agent',
      sortable: true,
      searchable: true,
    },
    {
      key: 'created_at',
      title: 'Created At',
      sortable: true,
      cell: createdAtCell,
    },
  ]);

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function modifyQuery(q: any) {
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet createdAtCell({ value }: { row: Tickets; value: string })}
  {formatDate(value)}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Tickets</h1>

  {#key `${scope}-${scopeId}`}
    <DataTable
      schema="views"
      table="d_agent_tickets_view"
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
