<script lang="ts">
  import {
    DataTable,
    type DataTableColumn,
    stateColumn,
    tagsColumn,
    boolBadgeColumn,
    relativeDateColumn,
    displayNameColumn,
  } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { page } from '$app/state';
  import { getSiteIdsForScope, getConnectionIdForScope } from '$lib/utils/scope-filter';
  import Badge from '$lib/components/ui/badge/badge.svelte';

  type Entity = Tables<'views', 'd_entities_view'>;

  const { data } = $props();

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let filterSiteIds = $derived(getSiteIdsForScope(scope, scopeId, data.sites, data.siteToGroup));
  let filterConnectionId = $derived(getConnectionIdForScope(scope, scopeId));

  const columns: DataTableColumn<Entity>[] = [
    stateColumn<Entity>(),
    boolBadgeColumn<Entity>(
      'raw_data.accountEnabled',
      'Status',
      {
        trueLabel: 'Enabled',
        falseLabel: 'Disabled',
        falseVariant: 'destructive',
      },
      {
        filter: {
          type: 'select',
          operators: ['eq'],
          options: [
            { label: 'Enabled', value: 'true' },
            { label: 'Disabled', value: 'false' },
          ],
        },
      }
    ),
    displayNameColumn<Entity>(),
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
      key: 'raw_data.userType',
      title: 'User Type',
      cell: userTypeCell,
    },
    {
      key: 'raw_data.assignedLicenses',
      title: 'Licenses',
      cell: licensesCell,
    },
    relativeDateColumn<Entity>('raw_data.signInActivity.lastSignInDateTime', 'Last Sign-In'),
    tagsColumn<Entity>(),
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

{#snippet licensesCell({ value }: { row: Entity; value: unknown[] })}
  {#if Array.isArray(value) && value.length > 0}
    <Badge variant="outline">{value.length}</Badge>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
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
