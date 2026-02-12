<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission, canActOnLevel } from '$lib/utils/permissions';
  import { toast } from 'svelte-sonner';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Plus } from '@lucide/svelte';
  import UserDialog from './_user-dialog.svelte';

  type User = Tables<'views', 'd_users_view'>;

  const { data } = $props();
  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Users.Write')
  );
  let currentUserLevel = $derived(data.role?.level ?? null);

  let isDeleting = $state(false);
  let createDialogOpen = $state(false);
  let editDialogOpen = $state(false);
  let editingUser = $state<User | null>(null);
  let refreshKey = $state(0);

  function getUserRoleLevel(user: User): number | null {
    const role = data.roles.find((r) => r.id === user.role_id);
    return role?.level ?? null;
  }

  const columns: DataTableColumn<User>[] = $derived([
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
  ]);

  let rowActions: RowAction<User>[] = $derived(
    canWrite
      ? [
          {
            label: 'Delete',
            variant: 'destructive',
            disabled: (rows) =>
              isDeleting ||
              rows.every(
                (u) =>
                  u.id === data.user?.id || !canActOnLevel(currentUserLevel, getUserRoleLevel(u))
              ),
            onclick: async (rows, fetchData) => {
              const deletable = rows.filter(
                (u) =>
                  u.id !== data.user?.id && canActOnLevel(currentUserLevel, getUserRoleLevel(u))
              );
              if (deletable.length === 0) {
                toast.error('No users can be deleted from this selection.');
                return;
              }

              const skipped = rows.length - deletable.length;
              if (skipped > 0) {
                toast.warning(
                  `${skipped} user${skipped > 1 ? 's' : ''} skipped (self or insufficient level).`
                );
              }

              isDeleting = true;
              const toastId = toast.loading(
                `Deleting ${deletable.length} user${deletable.length > 1 ? 's' : ''}...`
              );

              try {
                for (const user of deletable) {
                  const formData = new FormData();
                  formData.set('user_id', user.id!);

                  const res = await fetch('?/deleteUser', {
                    method: 'POST',
                    body: formData,
                  });

                  const result = await res.json();
                  const resData = result?.data?.[0] ?? result?.data ?? result;
                  if (resData?.error) throw new Error(resData.error);
                }

                toast.success(
                  `Deleted ${deletable.length} user${deletable.length > 1 ? 's' : ''}`,
                  { id: toastId }
                );
                await fetchData();
              } catch (err) {
                console.error('Error deleting users:', err);
                toast.error('Failed to delete users. Please try again.', { id: toastId });
              } finally {
                isDeleting = false;
              }
            },
          },
        ]
      : []
  );

  function handleRowClick(row: User) {
    if (!canWrite) return;
    if (row.id === data.user?.id) return;
    if (!canActOnLevel(currentUserLevel, getUserRoleLevel(row))) return;
    editingUser = row;
    editDialogOpen = true;
  }

  function handleDialogSuccess() {
    refreshKey++;
  }
</script>

{#snippet nameCell({ row }: { row: User; value: string })}
  <span class="flex items-center gap-2">
    {row.first_name + ' ' + row.last_name}
    {#if row.id === data.user?.id}
      <span
        class="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/30"
      >
        You
      </span>
    {/if}
  </span>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <div class="flex items-center justify-between">
    <h1 class="h-fit text-2xl font-bold">Users</h1>
    {#if canWrite}
      <Button onclick={() => (createDialogOpen = true)}>
        <Plus class="size-4 mr-1" />
        Invite User
      </Button>
    {/if}
  </div>

  {#key refreshKey}
    <DataTable
      schema="views"
      table="d_users_view"
      {columns}
      {rowActions}
      onrowclick={handleRowClick}
      globalSearchFields={['first_name', 'last_name', 'email']}
      enableRowSelection={canWrite}
      enableGlobalSearch={true}
      enableFilters={true}
      enablePagination={true}
      enableColumnToggle={true}
      enableExport={true}
      enableURLState={true}
    />
  {/key}
</div>

<UserDialog
  bind:open={createDialogOpen}
  mode="create"
  roles={data.roles}
  {currentUserLevel}
  onsuccess={handleDialogSuccess}
/>

<UserDialog
  bind:open={editDialogOpen}
  mode="edit"
  user={editingUser}
  roles={data.roles}
  {currentUserLevel}
  onsuccess={handleDialogSuccess}
/>
