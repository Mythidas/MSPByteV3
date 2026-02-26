<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import { supabase } from '$lib/supabase.js';
  import { ORM } from '@workspace/shared/lib/utils/orm.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { toast } from 'svelte-sonner';
  import { hasPermission } from '$lib/utils/permissions';
  import { goto } from '$app/navigation';
  import { INTEGRATIONS, type IntegrationId } from '@workspace/shared/config/integrations.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { formatDate } from '$lib/utils/format';

  type Site = Tables<'views', 'd_sites_view'>;

  const { data } = $props();
  let isDeleting = $state(false);
  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );

  const getColor = (id: IntegrationId) => {
    switch (id) {
      case 'sophos-partner':
        return 'bg-blue-500/30 border-blue-500/70';
      case 'cove':
        return 'bg-fuchsia-500/30 border-fuchsia-500/70';
      case 'dattormm':
        return 'bg-cyan-500/30 border-cyan-500/70';
      case 'halopsa':
        return 'bg-rose-500/30 border-rose-500/70';
      case 'microsoft-365':
        return 'bg-emerald-500/30 border-emerald-500/70';
    }
    return `bg-primary/30 border-primary/70`;
  };

  // Define columns with all features
  const columns: DataTableColumn<Site>[] = $derived([
    {
      key: 'name',
      title: 'Site Name',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search name...',
      },
    },
    {
      key: 'mapped_integrations',
      title: 'Integrations',
      sortable: true,
      searchable: true,
      filter: {
        type: 'select',
        operators: ['cs', 'not.cs'],
        defaultOperator: 'cs',
        options: Object.entries(INTEGRATIONS).map(([key, val]) => ({
          label: val.name,
          value: key,
        })),
        multiple: true,
      },
      cell: integrationsCell,
    },
    {
      key: 'created_at',
      title: 'Created',
      sortable: true,
      filter: {
        type: 'date',
        operators: ['eq', 'gt', 'lt'],
      },
      cell: createdAtCell,
    },
  ]);

  // Bulk actions (only available with write permission)
  let rowActions: RowAction<Site>[] = $derived(
    canWrite
      ? [
          {
            label: 'Delete',
            variant: 'destructive' as const,
            onclick: async (rows: Site[], fetchData: () => Promise<void>) => {
              isDeleting = true;
              const toastId = toast.loading(
                `Deleting ${rows.length} site${rows.length > 1 ? 's' : ''}...`
              );

              const orm = new ORM(supabase);
              const { error } = await orm.delete('public', 'sites', (q) =>
                q.in(
                  'id',
                  rows.map((r) => r.id!)
                )
              );

              if (error) {
                toast.error('Failed to delete sites. Please try again.', { id: toastId });
              } else {
                await fetchData();
                toast.success(
                  `Successfully deleted ${rows.length} site${rows.length > 1 ? 's' : ''}`,
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

  function handleRowClick(row: Site) {
    goto(`/sites/${row.id}`);
  }
</script>

{#snippet integrationsCell({ value }: { row: Site; value: IntegrationId[] })}
  <div class="flex gap-1">
    {#each value as id}
      <Badge variant="outline" class={getColor(id)}>
        {INTEGRATIONS[id].name}
      </Badge>
    {/each}
  </div>
{/snippet}

{#snippet createdAtCell({ value }: { row: Site; value: string })}
  {formatDate(value)}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Sites</h1>

  <DataTable
    schema="views"
    table="d_sites_view"
    {columns}
    {rowActions}
    defaultSort={{ field: 'name', dir: 'asc' }}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={handleRowClick}
  />
</div>
