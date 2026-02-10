<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission, ALL_PERMISSIONS } from '$lib/utils/permissions';
  import { ORM } from '@workspace/shared/lib/utils/orm';
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Plus } from '@lucide/svelte';
  import RoleDialog from './_role-dialog.svelte';

  type Role = Tables<'public', 'roles'>;

  const { data } = $props();
  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Roles.Write')
  );

  let isDeleting = $state(false);
  let createDialogOpen = $state(false);
  let editDialogOpen = $state(false);
  let editingRole = $state<Role | null>(null);
  let refreshKey = $state(0);

  function getPermissionCount(role: Role): number {
    const attrs = (role.attributes ?? {}) as Record<string, boolean>;
    if (attrs['Global.Admin'] === true) return ALL_PERMISSIONS.length;
    return Object.values(attrs).filter(Boolean).length;
  }

  const columns: DataTableColumn<Role>[] = $derived([
    {
      key: 'name',
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
      key: 'description',
      title: 'Description',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search description...',
      },
    },
    {
      key: 'attributes',
      title: 'Permissions',
      cell: permissionsCell,
    },
    {
      key: 'user_count',
      title: 'User Count',
      cell: usersCell,
    },
  ]);

  let rowActions: RowAction<Role>[] = $derived(
    canWrite
      ? [
          {
            label: 'Delete',
            variant: 'destructive',
            disabled: (rows) => isDeleting || rows.every((r) => r.tenant_id === null),
            onclick: async (rows, fetchData) => {
              const deletable = rows.filter((r) => r.tenant_id !== null);
              if (deletable.length === 0) {
                toast.error('System roles cannot be deleted.');
                return;
              }

              const skipped = rows.length - deletable.length;
              if (skipped > 0) {
                toast.warning(
                  `${skipped} system role${skipped > 1 ? 's' : ''} skipped (cannot be deleted).`
                );
              }

              isDeleting = true;
              const toastId = toast.loading(
                `Deleting ${deletable.length} role${deletable.length > 1 ? 's' : ''}...`
              );

              try {
                const orm = new ORM(supabase);
                const ids = deletable.map((r) => r.id);
                const { error } = await orm.delete('public', 'roles', (q) => q.in('id', ids));
                if (error) throw new Error(error.message);

                toast.success(
                  `Deleted ${deletable.length} role${deletable.length > 1 ? 's' : ''}`,
                  { id: toastId }
                );
                await fetchData();
              } catch (err) {
                console.error('Error deleting roles:', err);
                toast.error('Failed to delete roles. Please try again.', { id: toastId });
              } finally {
                isDeleting = false;
              }
            },
          },
        ]
      : []
  );

  function handleRowClick(row: Role) {
    if (row.tenant_id === null || !canWrite) return;
    editingRole = row;
    editDialogOpen = true;
  }

  function handleDialogSuccess() {
    refreshKey++;
  }
</script>

{#snippet nameCell({ row }: { row: Role; value: string })}
  <span class="flex items-center gap-2">
    {row.name}
    {#if row.tenant_id === null}
      <span class="text-xs bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded border">
        System
      </span>
    {/if}
  </span>
{/snippet}

{#snippet permissionsCell({ row }: { row: Role; value: unknown })}
  {getPermissionCount(row)}
{/snippet}

{#snippet usersCell({ row }: { row: Role; value: string })}
  {@const count = data.users.filter((u) => u.role_id === row.id).length}
  {count}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <div class="flex items-center justify-between">
    <h1 class="h-fit text-2xl font-bold">Roles</h1>
    {#if canWrite}
      <Button onclick={() => (createDialogOpen = true)}>
        <Plus class="size-4 mr-1" />
        Create Role
      </Button>
    {/if}
  </div>

  {#key refreshKey}
    <DataTable
      schema="public"
      table="roles"
      {columns}
      {rowActions}
      onrowclick={handleRowClick}
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

<RoleDialog
  bind:open={createDialogOpen}
  mode="create"
  tenantId={data.user?.tenant_id ?? ''}
  onsuccess={handleDialogSuccess}
/>

<RoleDialog
  bind:open={editDialogOpen}
  mode="edit"
  role={editingRole}
  tenantId={data.user?.tenant_id ?? ''}
  onsuccess={handleDialogSuccess}
/>
