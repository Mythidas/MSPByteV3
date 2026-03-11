<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';
  import { boolBadgeColumn, textColumn } from '$lib/components/data-table/column-defs.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import PolicySheet from './_policy-sheet.svelte';

  type Policy = Tables<'vendors', 'm365_policies_view'>;

  const { data } = $props();

  let selectedPolicy = $state<Policy | null>(null);
  let sheetOpen = $state(false);

  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );

  const columns: DataTableColumn<Policy>[] = $derived.by(() => {
    const linkSelected = !!scopeStore.currentLink;
    return [
      textColumn<Policy>('name', 'Name'),
      {
        key: 'policy_state',
        title: 'State',
        sortable: true,
        searchable: true,
        filter: {
          label: 'State',
          type: 'select',
          operators: ['eq', 'neq'],
          options: [
            { label: 'Enabled', value: 'enabled' },
            { label: 'Disabled', value: 'disabled' },
            { label: 'Report Only', value: 'enabledForReportingButNotEnforced' },
          ],
        },
      },
      boolBadgeColumn<Policy>('requires_mfa', 'Requires MFA'),
      textColumn<Policy>('link_name', 'Tenant', undefined, { hidden: linkSelected }),
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
  <h1 class="h-fit text-2xl font-bold">Policies</h1>

  <DataTable
    schema="vendors"
    table="m365_policies_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'name', dir: 'asc' }}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={(row) => { selectedPolicy = row; sheetOpen = true; }}
  />
</div>

<PolicySheet bind:open={sheetOpen} bind:policy={selectedPolicy} />
