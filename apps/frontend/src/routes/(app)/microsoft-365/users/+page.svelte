<script lang="ts">
  import { DataTable, type DataTableColumn } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope, getConnectionIdForScope } from '$lib/utils/scope-filter';
  import { formatStringProper, formatRelativeDate } from '$lib/utils/format.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { stateClass } from '$lib/utils/state.js';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));
  let filterConnectionId = $derived(getConnectionIdForScope(scope, scopeId));

  const columns: DataTableColumn<Entity>[] = [
    {
      key: 'display_name',
      title: 'Name',
      sortable: true,
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike', 'eq'],
        placeholder: 'Search name...',
      },
    },
    {
      key: 'raw_data.userPrincipalName',
      title: 'UPN',
      searchable: true,
      filter: {
        type: 'text',
        operators: ['ilike'],
        placeholder: 'Search UPN...',
      },
    },
    {
      key: 'raw_data.accountEnabled',
      title: 'Status',
      cell: accountEnabledCell,
      filter: {
        type: 'select',
        operators: ['eq'],
        options: [
          { label: 'Enabled', value: 'true' },
          { label: 'Disabled', value: 'false' },
        ],
      },
    },
    {
      key: 'raw_data.userType',
      title: 'User Type',
      cell: userTypeCell,
    },
    {
      key: 'raw_data.signInActivity.lastSignInDateTime',
      title: 'Last Sign-In',
      cell: lastSignInCell,
    },
    {
      key: 'raw_data.assignedLicenses',
      title: 'Licenses',
      cell: licensesCell,
    },
    {
      key: 'tags',
      title: 'Tags',
      cell: tagsCell,
    },
    {
      key: 'site_name',
      title: 'Site',
      sortable: true,
    },
    {
      key: 'connection_name',
      title: 'Tenant',
      sortable: true,
    },
    {
      key: 'state',
      title: 'State',
      sortable: true,
      cell: stateCell,
      filter: {
        type: 'select',
        operators: ['eq', 'neq'],
        options: [
          { label: 'Normal', value: 'normal' },
          { label: 'Warn', value: 'warn' },
        ],
      },
    },
  ];

  function modifyQuery(q: any) {
    q.eq('integration_id', 'microsoft-365').eq('entity_type', 'identity');
    if (filterConnectionId) {
      q.eq('connection_id', filterConnectionId);
    } else if (filterSiteIds) {
      if (filterSiteIds.length === 1) q.eq('site_id', filterSiteIds[0]);
      else if (filterSiteIds.length > 1) q.in('site_id', filterSiteIds);
    }
  }
</script>

{#snippet accountEnabledCell({ value }: { row: Entity; value: boolean })}
  <Badge
    variant="outline"
    class={value
      ? 'bg-green-500/15 text-green-500 border-green-500/30'
      : 'bg-destructive/15 text-destructive border-destructive/30'}
  >
    {value ? 'Enabled' : 'Disabled'}
  </Badge>
{/snippet}

{#snippet userTypeCell({ value }: { row: Entity; value: string | null })}
  {#if value === 'Member'}
    <Badge variant="outline" class="bg-blue-500/15 text-blue-500 border-blue-500/30">Member</Badge>
  {:else if value === 'Guest'}
    <Badge variant="outline" class="bg-yellow-500/15 text-yellow-500 border-yellow-500/30"
      >Guest</Badge
    >
  {:else if value}
    <Badge variant="outline">{value}</Badge>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet lastSignInCell({ value }: { row: Entity; value: string | null })}
  {value ? formatRelativeDate(value) : '—'}
{/snippet}

{#snippet licensesCell({ value }: { row: Entity; value: unknown[] })}
  {#if Array.isArray(value) && value.length > 0}
    <Badge variant="outline">{value.length}</Badge>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet tagsCell({ value }: { row: Entity; value: string[] })}
  {#if Array.isArray(value) && value.length > 0}
    {#each value as tag}
      <Badge variant="outline" class="mr-1">{formatStringProper(tag)}</Badge>
    {/each}
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

{#snippet stateCell({ value }: { row: Entity; value: string | null })}
  <Badge variant="outline" class={stateClass(value)}>
    {value ? formatStringProper(value) : '—'}
  </Badge>
{/snippet}

<div class="flex flex-col gap-2 p-4 size-full">
  <h1 class="h-fit text-2xl font-bold">Users</h1>

  {#key `${scope}-${scopeId}`}
    <DataTable
      schema="views"
      table="d_entities_view"
      {columns}
      {modifyQuery}
      enableGlobalSearch={true}
      enableFilters={true}
      enablePagination={true}
      enableColumnToggle={true}
      enableExport={true}
      enableURLState={true}
    />
  {/key}
</div>
