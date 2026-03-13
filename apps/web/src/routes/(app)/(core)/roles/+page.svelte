<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import { supabase } from '$lib/utils/supabase.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { toast } from 'svelte-sonner';
  import { hasPermission, canActOnLevel } from '$lib/utils/permissions';
  import PermissionGuard from '$lib/components/auth/permission-gaurd.svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import RoleSheet from './_role-sheet.svelte';

  type Role = Tables<'views', 'd_roles_view'>;

  const { data } = $props();

  let sheetOpen = $state(false);
  let sheetMode = $state<'create' | 'edit'>('create');
  let selectedRole = $state<Role | null>(null);
  let refreshKey = $state(0);
  let isDeleting = $state(false);

  const currentUserLevel = $derived(data.role?.level ?? null);
  const canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Users.Write')
  );

  const columns: DataTableColumn<Role>[] = [
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
    },
    {
      key: 'level',
      title: 'Level',
      sortable: true,
      cell: levelCell,
    },
    {
      key: 'user_count',
      title: 'Users',
      sortable: true,
    },
  ];

  const rowActions: RowAction<Role>[] = $derived(
    canWrite
      ? [
          {
            label: 'Delete',
            variant: 'destructive' as const,
            onclick: async (rows: Role[], fetchData: () => Promise<void>) => {
              const eligible = rows.filter(
                (r) => r.tenant_id !== null && canActOnLevel(currentUserLevel, r.level)
              );
              const skipped = rows.length - eligible.length;

              if (skipped > 0) {
                toast.warning(
                  `Skipped ${skipped} role${skipped > 1 ? 's' : ''} (system or insufficient level)`
                );
              }

              if (!eligible.length) return;

              isDeleting = true;
              const toastId = toast.loading(
                `Deleting ${eligible.length} role${eligible.length > 1 ? 's' : ''}...`
              );

              const { error } = await supabase
                .from('roles')
                .delete()
                .in(
                  'id',
                  eligible.map((r) => r.id!)
                );

              if (error) {
                toast.error('Failed to delete roles. Please try again.', { id: toastId });
              } else {
                await fetchData();
                toast.success(
                  `Successfully deleted ${eligible.length} role${eligible.length > 1 ? 's' : ''}`,
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

  function handleRowClick(row: Role) {
    if (row.tenant_id === null) return;
    if (!canActOnLevel(currentUserLevel, row.level)) return;

    selectedRole = row;
    sheetMode = 'edit';
    sheetOpen = true;
  }

  function handleCreateClick() {
    selectedRole = null;
    sheetMode = 'create';
    sheetOpen = true;
  }

  function handleSuccess() {
    refreshKey++;
  }
</script>

{#snippet nameCell({ row, value }: { row: Role; value: string })}
  <div class="flex items-center gap-2">
    <span>{value}</span>
    {#if row.tenant_id === null}
      <Badge variant="outline" class="bg-muted text-muted-foreground border-muted-foreground/30 text-xs"
        >System</Badge
      >
    {/if}
  </div>
{/snippet}

{#snippet levelCell({ value }: { row: Role; value: number | null })}
  <span class="text-sm">{value ?? '—'}</span>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-bold">Roles</h1>
    <PermissionGuard permission="Users.Write">
      <Button onclick={handleCreateClick}>Create Role</Button>
    </PermissionGuard>
  </div>

  {#key refreshKey}
    <DataTable
      schema="views"
      table="d_roles_view"
      {columns}
      {rowActions}
      defaultSort={{ field: 'level', dir: 'desc' }}
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

<RoleSheet
  bind:open={sheetOpen}
  mode={sheetMode}
  role={selectedRole}
  tenantId={data.tenant?.id ?? ''}
  maxLevel={currentUserLevel}
  onsuccess={handleSuccess}
/>
