<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';

  type User = Tables<'public', 'users'>;

  const { data } = $props();
  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Users.Write')
  );

  // Define columns with all features
  const columns: DataTableColumn<User>[] = $derived([
    {
      key: 'first_name',
      title: 'Name',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search name...',
      },
      cell: nameCell,
    },
    {
      key: 'email',
      title: 'Email',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search email...',
      },
    },
    {
      key: 'role_id',
      title: 'Role',
      sortable: true,
      cell: roleCell,
    },
  ]);
</script>

{#snippet nameCell({ row }: { row: User; value: string })}
  {row.first_name + ' ' + row.last_name}
{/snippet}

{#snippet roleCell({ row }: { row: User; value: string })}
  {@const role = data.roles.find((r) => r.id === row.role_id)}
  {role?.name || row.role_id}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Users</h1>

  <DataTable
    schema="public"
    table="users"
    {columns}
    globalSearchFields={['first_name', 'last_name', 'email']}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
  />
</div>
