<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';
  import { boolBadgeColumn, textColumn } from '$lib/components/data-table/column-defs.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import LicenseSheet from './_license-sheet.svelte';

  type License = Tables<'views', 'm365_licenses_view'>;

  const { data } = $props();

  let selectedLicense = $state<License | null>(null);
  let sheetOpen = $state(false);

  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );

  const columns: DataTableColumn<License>[] = $derived.by(() => {
    const linkSelected = !!scopeStore.currentLink;
    return [
      boolBadgeColumn<License>('enabled', 'Active'),
      textColumn<License>('friendly_name', 'License'),
      textColumn<License>('link_name', 'Tenant', undefined, { hidden: linkSelected }),
      textColumn<License>('total_units', 'Total'),
      textColumn<License>('consumed_units', 'Consumed'),
      textColumn<License>('available_units', 'Available'),
      textColumn<License>('warning_units', 'Warning', undefined, { defaultHidden: true }),
      textColumn<License>('suspended_units', 'Suspended', undefined, { defaultHidden: true }),
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
  <h1 class="h-fit text-2xl font-bold">Licenses</h1>

  <DataTable
    schema="views"
    table="m365_licenses_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'friendly_name', dir: 'asc' }}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={(row) => {
      selectedLicense = row;
      sheetOpen = true;
    }}
  />
</div>

<LicenseSheet bind:open={sheetOpen} bind:license={selectedLicense} />
