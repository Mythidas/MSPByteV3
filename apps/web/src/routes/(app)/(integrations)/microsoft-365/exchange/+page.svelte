<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';
  import { boolBadgeColumn, textColumn } from '$lib/components/data-table/column-defs.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';

  type ExchangeConfig = Tables<'vendors', 'm365_exchange_configs_view'>;

  const { data } = $props();

  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );

  const columns: DataTableColumn<ExchangeConfig>[] = $derived.by(() => {
    const linkSelected = !!scopeStore.currentLink;
    return [
      textColumn<ExchangeConfig>('link_name', 'Tenant', undefined, { hidden: linkSelected }),
      boolBadgeColumn<ExchangeConfig>('reject_direct_send', 'Reject Direct Send'),
    ];
  });

  const modifyQuery = $derived.by(() => {
    const link = scopeStore.currentLink;
    return (q: any) => {
      if (link) {
        q.eq('link_id', link as string);
      }
    };
  });
</script>

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Exchange</h1>

  <DataTable
    schema="vendors"
    table="m365_exchange_configs_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'link_name', dir: 'asc' }}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
  />
</div>
