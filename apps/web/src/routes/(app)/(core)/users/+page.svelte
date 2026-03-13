<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import { supabase } from '$lib/utils/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { toast } from 'svelte-sonner';
  import { hasPermission, canActOnLevel } from '$lib/utils/permissions';
  import PermissionGuard from '$lib/components/auth/permission-gaurd.svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import UserSheet from './_user-sheet.svelte';

  type User = Tables<'views', 'd_users_view'>;

  const { data } = $props();

  let sheetOpen = $state(false);
  let sheetMode = $state<'create' | 'edit'>('create');
  let selectedUser = $state<User | null>(null);
  let refreshKey = $state(0);
  let isDeleting = $state(false);

  const currentUserLevel = $derived(data.role?.level ?? null);
  const canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Users.Write')
  );

  function getUserRoleLevel(row: User): number | null {
    const role = (data.roles ?? []).find((r: any) => r.id === row.role_id);
    return role?.level ?? null;
  }

  const columns: DataTableColumn<User>[] = [
    {
      key: 'full_name',
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
      key: 'role_name',
      title: 'Role',
      sortable: true,
    },
  ];

  const rowActions: RowAction<User>[] = $derived(
    canWrite
      ? [
          {
            label: 'Delete',
            variant: 'destructive' as const,
            onclick: async (rows: User[], fetchData: () => Promise<void>) => {
              const eligible = rows.filter(
                (r) =>
                  r.id !== data.user?.id && canActOnLevel(currentUserLevel, getUserRoleLevel(r))
              );
              const skipped = rows.length - eligible.length;

              if (skipped > 0) {
                toast.warning(
                  `Skipped ${skipped} user${skipped > 1 ? 's' : ''} (self or insufficient level)`
                );
              }

              if (!eligible.length) return;

              isDeleting = true;
              const toastId = toast.loading(
                `Deleting ${eligible.length} user${eligible.length > 1 ? 's' : ''}...`
              );

              const { error } = await supabase
                .from('users')
                .delete()
                .in(
                  'id',
                  eligible.map((r) => r.id!)
                );

              if (error) {
                toast.error('Failed to delete users. Please try again.', { id: toastId });
              } else {
                await fetchData();
                toast.success(
                  `Successfully deleted ${eligible.length} user${eligible.length > 1 ? 's' : ''}`,
                  { id: toastId }
                );
              }

              isDeleting = false;
            },
            disabled: () => isDeleting,
          },
        ]
      : []
  );

  function handleRowClick(row: User) {
    if (row.id === data.user?.id) return;
    if (!canActOnLevel(currentUserLevel, getUserRoleLevel(row))) return;

    selectedUser = row;
    sheetMode = 'edit';
    sheetOpen = true;
  }

  function handleCreateClick() {
    selectedUser = null;
    sheetMode = 'create';
    sheetOpen = true;
  }

  function handleSuccess() {
    refreshKey++;
  }
</script>

{#snippet nameCell({ row, value }: { row: User; value: string })}
  <div class="flex items-center gap-2">
    <span>{value}</span>
    {#if row.id === data.user?.id}
      <Badge variant="outline" class="bg-primary/15 text-primary border-primary/30 text-xs"
        >You</Badge
      >
    {/if}
  </div>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Users</h1>
    <PermissionGuard permission="Users.Write">
      <Button onclick={handleCreateClick}>Create User</Button>
    </PermissionGuard>
  </div>

  {#key refreshKey}
    <DataTable
      schema="views"
      table="d_users_view"
      {columns}
      {rowActions}
      defaultSort={{ field: 'full_name', dir: 'asc' }}
      enableRowSelection={canWrite}
      enableGlobalSearch={true}
      enableFilters={true}
      enablePagination={true}
      enableColumnToggle={true}
      enableExport={true}
      enableURLState={true}
      onrowclick={handleRowClick}
    />
  {/key}
</div>

<UserSheet
  bind:open={sheetOpen}
  mode={sheetMode}
  user={selectedUser}
  roles={data.roles ?? []}
  {currentUserLevel}
  onsuccess={handleSuccess}
/>
