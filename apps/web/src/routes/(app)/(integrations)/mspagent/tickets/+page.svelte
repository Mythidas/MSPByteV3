<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { dateColumn, textColumn } from '$lib/components/data-table/column-defs.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';

  type Ticket = Tables<'views', 'd_agent_tickets_view'>;

  const columns: DataTableColumn<Ticket>[] = $derived.by(() => {
    const siteSelected = !!scopeStore.currentSite;
    return [
      textColumn<Ticket>('ticket_id', 'Ticket'),
      textColumn<Ticket>('agent_name', 'Agent'),
      textColumn<Ticket>('site_name', 'Site', undefined, { hidden: siteSelected }),
      textColumn<Ticket>('summary', 'Summary'),
      dateColumn<Ticket>('created_at', 'Created'),
    ];
  });

  const modifyQuery = $derived.by(() => {
    const site = scopeStore.currentSite;
    return (q: any) => {
      if (site) {
        q.eq('site_id', site as string);
      }
    };
  });
</script>

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Tickets</h1>

  <DataTable
    schema="views"
    table="d_agent_tickets_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'created_at', dir: 'asc' }}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
  />
</div>
