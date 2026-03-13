<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { dateColumn, textColumn } from '$lib/components/data-table/column-defs.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';

  type Agent = Tables<'views', 'd_agents_view'>;

  const columns: DataTableColumn<Agent>[] = $derived.by(() => {
    const siteSelected = !!scopeStore.currentSite;
    return [
      textColumn<Agent>('hostname', 'Hostname'),
      textColumn<Agent>('site_name', 'Site', undefined, { hidden: siteSelected }),
      textColumn<Agent>('platform', 'Platform'),
      textColumn<Agent>('ip_address', 'IP'),
      textColumn<Agent>('version', 'Version'),
      dateColumn<Agent>('registered_at', 'Registered'),
      dateColumn<Agent>('updated_at', 'Last Seen'),
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
  <h1 class="h-fit text-2xl font-bold">Agents</h1>

  <DataTable
    schema="views"
    table="d_agents_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'hostname', dir: 'asc' }}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
  />
</div>
