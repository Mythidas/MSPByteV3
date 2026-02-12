<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction } from '$lib/components/data-table';
  import { supabase } from '$lib/supabase.js';
  import { ORM } from '@workspace/shared/lib/utils/orm.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { toast } from 'svelte-sonner';
  import { hasPermission } from '$lib/utils/permissions';
  import { page } from '$app/state';
  import { getSiteIdsForScope } from '$lib/utils/scope-filter';

  type Agent = Tables<'views', 'd_agents_view'>;

  const { data } = $props();
  let isDeleting = $state(false);
  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Integrations.Write')
  );

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  function formatRelative(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    return `${diffDays}d ago`;
  }

  const columns: DataTableColumn<Agent>[] = $derived([
    {
      key: 'hostname',
      title: 'Hostname',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search hostname...',
      },
    },
    {
      key: 'site_name',
      title: 'Site',
      sortable: true,
      searchable: true,
    },
    {
      key: 'platform',
      title: 'Platform',
      sortable: true,
      filter: {
        type: 'select',
        operators: ['eq'],
        options: [
          { label: 'Windows', value: 'windows' },
          { label: 'Linux', value: 'linux' },
          { label: 'macOS', value: 'macos' },
        ],
      },
    },
    {
      key: 'version',
      title: 'Version',
      sortable: true,
    },
    {
      key: 'ip_address',
      title: 'IP Address',
      sortable: true,
    },
    {
      key: 'ext_address',
      title: 'External IP',
      sortable: true,
    },
    {
      key: 'registered_at',
      title: 'Registered',
      sortable: true,
      filter: {
        type: 'date',
        operators: ['eq', 'gt', 'lt'],
      },
      cell: registeredAtCell,
    },
    {
      key: 'updated_at',
      title: 'Last Seen',
      sortable: true,
      cell: lastSeenCell,
    },
  ]);

  let rowActions: RowAction<Agent>[] = $derived(
    canWrite
      ? [
          {
            label: 'Delete',
            variant: 'destructive' as const,
            onclick: async (rows: Agent[], fetchData: () => Promise<void>) => {
              isDeleting = true;
              const toastId = toast.loading(
                `Deleting ${rows.length} agent${rows.length > 1 ? 's' : ''}...`
              );

              const orm = new ORM(supabase);
              const { error } = await orm.delete('public', 'agents', (q) =>
                q.in(
                  'id',
                  rows.map((r) => r.id!)
                )
              );

              if (error) {
                toast.error('Failed to delete agents. Please try again.', { id: toastId });
              } else {
                await fetchData();
                toast.success(
                  `Successfully deleted ${rows.length} agent${rows.length > 1 ? 's' : ''}`,
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

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));

  function modifyQuery(q: any) {
    q.is('deleted_at', null);
    if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet registeredAtCell({ value }: { row: Agent; value: string })}
  {formatDate(value)}
{/snippet}

{#snippet lastSeenCell({ value }: { row: Agent; value: string })}
  {formatRelative(value)}
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Agents</h1>

  {#key `${scope}-${scopeId}`}
    <DataTable
      schema="views"
      table="d_agents_view"
      {columns}
      {rowActions}
      {modifyQuery}
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
