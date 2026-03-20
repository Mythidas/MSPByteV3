<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import {
    boolBadgeColumn,
    relativeDateColumn,
  } from '$lib/components/data-table/column-defs.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { authStore } from '$lib/stores/auth.svelte';

  type Task = Tables<'public', 'tasks'>;

  const tenantId = $derived(authStore.currentTenant?.id ?? '');

  const columns: DataTableColumn<Task>[] = [
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
    boolBadgeColumn<Task>('enabled', 'Status', {
      trueLabel: 'Enabled',
      falseLabel: 'Disabled',
      falseVariant: 'destructive',
    }),
    {
      key: 'trigger_type',
      title: 'Trigger',
      sortable: true,
      filter: {
        type: 'select',
        operators: ['eq'],
        options: [
          { label: 'Manual', value: 'manual' },
          { label: 'Schedule', value: 'schedule' },
        ],
      },
      cell: triggerCell,
    },
    {
      key: 'schedule',
      title: 'Schedule',
      cell: scheduleCell,
    },
    relativeDateColumn<Task>('next_run_at', 'Next Run'),
    relativeDateColumn<Task>('last_run_at', 'Last Run'),
  ];

  const modifyQuery = $derived.by(() => {
    const tid = tenantId;
    return (q: any) => {
      if (tid) {
        q.eq('tenant_id', tid);
      }
    };
  });
</script>

{#snippet triggerCell({ value }: { row: Task; value: string })}
  <Badge class="bg-amber-500/15 text-amber-500 border-amber-500/30 text-xs capitalize"
    >{value}</Badge
  >
{/snippet}

{#snippet scheduleCell({ value }: { row: Task; value: any })}
  {#if value && typeof value === 'object'}
    <span class="text-sm font-mono">{value.cron ?? JSON.stringify(value)}</span>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <DataTable
    schema="public"
    table="tasks"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'name', dir: 'asc' }}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={false}
    enableURLState={true}
  />
</div>
