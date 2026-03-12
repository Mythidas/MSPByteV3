<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';
  import {
    boolBadgeColumn,
    nullableTextColumn,
    relativeDateColumn,
    textColumn,
  } from '$lib/components/data-table/column-defs.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import GroupSheet from './_group-sheet.svelte';

  type Group = Tables<'vendors', 'm365_groups_view'>;

  const { data } = $props();

  let selectedGroup = $state<Group | null>(null);
  let sheetOpen = $state(false);

  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );

  const columns: DataTableColumn<Group>[] = $derived.by(() => {
    const linkSelected = !!scopeStore.currentLink;
    return [
      boolBadgeColumn<Group>('security_enabled', 'Security Group'),
      boolBadgeColumn<Group>('mail_enabled', 'Mail Enabled'),
      textColumn<Group>('name', 'Name', undefined),
      textColumn<Group>('description', 'Description', undefined, { cell: descriptionCell }),
      textColumn<Group>('link_name', 'Tenant', undefined, { hidden: linkSelected }),
      nullableTextColumn<Group>('member_count', 'Members'),
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

{#snippet descriptionCell({ value }: { row: Group; value: string })}
  <span>{value?.substring(0, 50)}{value && value?.length > 50 ? '...' : ''}</span>
{/snippet}

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Groups</h1>

  <DataTable
    schema="vendors"
    table="m365_groups_view"
    {columns}
    {modifyQuery}
    defaultSort={{ field: 'name', dir: 'asc' }}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={(row) => {
      selectedGroup = row;
      sheetOpen = true;
    }}
  />
</div>

<GroupSheet bind:open={sheetOpen} bind:group={selectedGroup} />
