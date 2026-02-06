<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    type TableView,
    type RowAction,
  } from '$lib/components/data-table';
  import { supabase } from '$lib/supabase.js';
  import { ORM } from '@workspace/shared/lib/utils/orm.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { toast } from 'svelte-sonner';

  type Site = Tables<'public', 'sites'>;

  const { data } = $props();
  let isDeleting = $state(false);

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  // Define columns with all features
  const columns: DataTableColumn<Site>[] = $derived([
    {
      key: 'id',
      title: 'ID',
      sortable: true,
      width: '80px',
      filter: {
        type: 'number',
        operators: ['eq', 'gt', 'lt'],
      },
    },
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

  // Predefined views
  // const views: TableView[] = [
  //   {
  //     id: 'recent',
  //     label: 'Recently Created',
  //     filters: [{ field: 'created_at', operator: 'gt', value: '2024-01-01' }],
  //   },
  // ];

  // Bulk actions
  const rowActions: RowAction<Site>[] = [
    {
      label: 'Delete',
      variant: 'destructive',
      onclick: async (rows, fetchData) => {
        isDeleting = true;
        const toastId = toast.loading(
          `Deleting ${rows.length} site${rows.length > 1 ? 's' : ''}...`
        );

        const orm = new ORM(supabase);
        const { error } = await orm.delete('public', 'sites', (q) =>
          q.in(
            'id',
            rows.map((r) => r.id)
          )
        );

        if (error) {
          toast.error('Failed to delete sites. Please try again.', { id: toastId });
        } else {
          await fetchData();
          toast.success(`Successfully deleted ${rows.length} site${rows.length > 1 ? 's' : ''}`, {
            id: toastId,
          });
        }

        isDeleting = false;
      },
      disabled: () => isDeleting,
    },
  ];

  function handleRowClick(row: Site) {
    console.log('Clicked:', row);
  }
</script>

{#snippet createdAtCell({ value }: { row: Site; value: string })}
  {formatDate(value)}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Sites</h1>

  <DataTable
    schema="public"
    table="sites"
    {columns}
    {rowActions}
    enableRowSelection={true}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={handleRowClick}
  />
</div>
