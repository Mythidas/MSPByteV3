<script lang="ts">
  import { DataTable, type DataTableColumn, type RowAction, type TableView } from '$lib/components/data-table';
  import type { Tables } from '@workspace/shared/types/database';
  import { hasPermission } from '$lib/utils/permissions';
  import {
    boolBadgeColumn,
    relativeDateColumn,
    stateColumn,
    textColumn,
  } from '$lib/components/data-table/column-defs.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { supabase } from '$lib/utils/supabase.js';
  import { authStore } from '$lib/stores/auth.svelte.js';
  import { scopeStore } from '$lib/stores/scope.svelte.js';
  import IdentitySheet from './_identity-sheet.svelte';

  type Identity = Tables<'vendors', 'm365_identities_view'>;

  const { data } = $props();

  let selectedIdentity = $state<Identity | null>(null);
  let sheetOpen = $state(false);

  let canWrite = $derived(
    hasPermission(data.role?.attributes as Record<string, unknown>, 'Sites.Write')
  );
  let licenseOptions = $state<{ label: string; value: string }[]>([]);

  const licenseMap = $derived<Record<string, string>>(
    Object.fromEntries(licenseOptions.map((l) => [l.value, l.label]))
  );

  const columns: DataTableColumn<Identity>[] = $derived.by(() => {
    const linkSelected = !!scopeStore.currentLink;
    return [
      stateColumn<Identity>(),
      boolBadgeColumn<Identity>('enabled', 'Enabled'),
      textColumn<Identity>('name', 'Name'),
      textColumn<Identity>('email', 'Email'),
      textColumn<Identity>('type', 'Type'),
      textColumn<Identity>('link_name', 'Tenant', undefined, { hidden: linkSelected }),
      textColumn<Identity>('site_name', 'Site'),
      boolBadgeColumn<Identity>('mfa_enforced', 'MFA Enforced', { falseVariant: 'destructive' }),
      {
        key: 'assigned_licenses',
        title: 'Licenses',
        cell: licensesCell,
        filter: {
          label: 'License',
          type: 'select',
          operators: ['cs'],
          defaultOperator: 'cs',
          options: licenseOptions,
        },
        exportValue: ({ value }) => {
          if (!Array.isArray(value) || value.length === 0) return '';
          return (value as { skuId: string }[])
            .map((l) => licenseMap[l.skuId] ?? l.skuId)
            .join(', ');
        },
      },
      relativeDateColumn<Identity>('last_sign_in_at', 'Last Login'),
      relativeDateColumn<Identity>('last_non_interactive_sign_in_at', 'Last Non-Interactive Login'),
    ];
  });

  $effect(() => {
    const load = async () => {
      const { data: licenses } = await supabase
        .schema('vendors')
        .from('m365_licenses')
        .select('external_id,friendly_name')
        .eq('tenant_id', authStore.currentTenant?.id ?? '')
        .order('friendly_name');

      licenseOptions = (licenses ?? []).map((l) => ({
        label: l.friendly_name,
        value: l.external_id,
      }));
    };

    load();
  });

  const views: TableView[] = [
    { id: 'disabled', label: 'Disabled', filters: [{ field: 'enabled', operator: 'eq', value: false }] },
    { id: 'no-mfa', label: 'MFA Not Enforced', filters: [{ field: 'mfa_enforced', operator: 'eq', value: false }] },
    {
      id: 'no-sign-in',
      label: 'No Recent Sign-In',
      filters: [{ field: 'enabled', operator: 'eq', value: true }],
      modifyQuery: (q: any) => {
        const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        q.or(`last_sign_in_at.is.null,last_sign_in_at.lt.${cutoff}`)
         .or(`last_non_interactive_sign_in_at.is.null,last_non_interactive_sign_in_at.lt.${cutoff}`);
      },
    },
  ];

  const modifyQuery = $derived.by(() => {
    const link = scopeStore.currentLink;
    return (q: any) => {
      if (link) {
        q.eq('link_id', link as string);
      }
    };
  });
</script>

{#snippet licensesCell({ value }: { row: Identity; value: unknown[] })}
  {#if Array.isArray(value) && value.length > 0}
    <Badge variant="outline">{value.length}</Badge>
  {:else}
    <span class="text-muted-foreground">—</span>
  {/if}
{/snippet}

<div class="flex flex-col gap-2 size-full">
  <h1 class="h-fit text-2xl font-bold">Identities</h1>

  <DataTable
    schema="vendors"
    table="m365_identities_view"
    {columns}
    {modifyQuery}
    {views}
    defaultSort={{ field: 'name', dir: 'asc' }}
    enableRowSelection={canWrite}
    enableGlobalSearch={true}
    enableFilters={true}
    enablePagination={true}
    enableColumnToggle={true}
    enableExport={true}
    enableURLState={true}
    onrowclick={(row) => { selectedIdentity = row; sheetOpen = true; }}
  />
</div>

<IdentitySheet bind:open={sheetOpen} bind:identity={selectedIdentity} />
