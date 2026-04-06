<script lang="ts">
  import { DataTable, type DataTableColumn, type TableView } from '$lib/components/data-table';
  import {
    textColumn,
    relativeDateColumn,
    stateColumn,
    boolBadgeColumn,
    numberColumn,
    dateColumn,
  } from '$lib/components/data-table/column-defs.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { scopeStore } from '$lib/stores/scope.svelte.js';

  type License = Tables<'views', 'sophos_licenses_view'>;

  const columns: DataTableColumn<License>[] = $derived.by(() => {
    const siteSelected = !!scopeStore.currentSite;
    return [
      stateColumn<License>(),
      textColumn<License>('code', 'Code'),
      textColumn<License>('name', 'Name'),
      textColumn<License>('site_name', 'Site', undefined, { hidden: siteSelected }),
      textColumn<License>('type', 'Type'),
      boolBadgeColumn<License>('perpetual', 'Perpetual'),
      boolBadgeColumn<License>('unlimited', 'Unlimited'),
      numberColumn<License>('quantity', 'Total', undefined, { defaultHidden: true }),
      numberColumn<License>('usage_count', 'Used'),
      dateColumn<License>('started_at', 'Starts'),
      dateColumn<License>('ends_at', 'Ends'),
    ];
  });

  const modifyQuery = $derived.by(() => {
    const site = scopeStore.currentSite;
    return (q: any) => {
      if (site) q.eq('site_id', site as string);
    };
  });
</script>

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Licenses</h1>

  <DataTable
    schema="views"
    table="sophos_licenses_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'name', dir: 'asc' }}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
  />
</div>
