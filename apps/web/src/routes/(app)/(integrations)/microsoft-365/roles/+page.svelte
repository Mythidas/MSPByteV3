<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';
  import { textColumn } from '$lib/components/data-table/column-defs.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import RoleSheet from './_role-sheet.svelte';

  type Role = Tables<'views', 'm365_roles_view'>;

  const { data } = $props();

  let selectedRole = $state<Role | null>(null);
  let sheetOpen = $state(false);

  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );

  const columns: DataTableColumn<Role>[] = $derived.by(() => {
    const linkSelected = !!scopeStore.currentLink;
    return [
      textColumn<Role>('name', 'Name'),
      textColumn<Role>('description', 'Description'),
      textColumn<Role>('link_name', 'Tenant', undefined, { hidden: linkSelected }),
      textColumn<Role>('member_count', 'Members'),
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
  <h1 class="h-fit text-2xl font-bold">Roles</h1>

  <DataTable
    schema="views"
    table="m365_roles_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'member_count', dir: 'desc' }}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={(row) => {
      selectedRole = row;
      sheetOpen = true;
    }}
  />
</div>

<RoleSheet bind:open={sheetOpen} bind:role={selectedRole} />
