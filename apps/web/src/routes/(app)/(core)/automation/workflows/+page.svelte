<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import {
    boolBadgeColumn,
    nullableTextColumn,
    relativeDateColumn,
    tagsColumn,
  } from '$lib/components/data-table/column-defs.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { authStore } from '$lib/stores/auth.svelte';
  import WorkflowSheet from '$lib/components/automation/workflow-sheet.svelte';

  type Workflow = Tables<'public', 'workflows'>;

  let selectedWorkflow = $state<Workflow | null>(null);
  let sheetOpen = $state(false);

  const tenantId = $derived(authStore.currentTenant?.id ?? '');

  const columns: DataTableColumn<Workflow>[] = [
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
    },
    nullableTextColumn<Workflow>('description', 'Description'),
    tagsColumn<Workflow>(),
    {
      key: 'target_entity_type',
      title: 'Entity Type',
      sortable: true,
      cell: entityTypeCell,
    },
    {
      key: 'target_scope_type',
      title: 'Scope',
      sortable: true,
    },
    boolBadgeColumn<Workflow>('is_managed', 'Type', {
      trueLabel: 'Managed',
      falseLabel: 'Custom',
    }),
    relativeDateColumn<Workflow>('created_at', 'Created'),
  ];

  const modifyQuery = $derived.by(() => {
    const tid = tenantId;
    return (q: any) => {
      if (tid) {
        q.or(`tenant_id.eq.${tid},tenant_id.is.null`);
      } else {
        q.is('tenant_id', null);
      }
    };
  });

  function handleRowClick(row: Workflow) {
    selectedWorkflow = row;
    sheetOpen = true;
  }
</script>

{#snippet entityTypeCell({ value }: { row: Workflow; value: string })}
  <Badge class="bg-primary/15 text-primary border-primary/30 text-xs">{value}</Badge>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <DataTable
    schema="public"
    table="workflows"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'name', dir: 'asc' }}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={false}
    enableURLState={true}
    onrowclick={handleRowClick}
  />
</div>

<WorkflowSheet bind:open={sheetOpen} workflow={selectedWorkflow} />
