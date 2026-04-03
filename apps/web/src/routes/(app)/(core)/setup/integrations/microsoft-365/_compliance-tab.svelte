<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Plus, ShieldCheck, Pencil, Trash2, Globe } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { INTEGRATIONS } from '@workspace/shared/config/integrations/integrations';
  import FrameworkSheet from './_framework-sheet.svelte';
  import CheckDialog from './_check-dialog.svelte';
  import Switch from '$lib/components/ui/switch/switch.svelte';
  import SearchBar from '$lib/components/search-bar.svelte';
  import SingleSelect from '$lib/components/single-select.svelte';
  import ConfirmDialog from '$lib/components/fields/confirm-dialog.svelte';
  import { formatStringProper } from '$lib/utils/format';

  type Framework = Tables<'public', 'compliance_frameworks'> & {
    compliance_framework_checks: Tables<'public', 'compliance_framework_checks'>[];
  };
  type Assignment = Tables<'public', 'compliance_assignments'>;
  type Link = Tables<'public', 'integration_links'>;

  const severityClass: Record<string, string> = {
    critical: 'bg-destructive/15 text-destructive border-destructive/30',
    high: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
    medium: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/30',
    low: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
    info: 'bg-muted/50 text-muted-foreground',
  };

  let {
    frameworks,
    assignments,
    links,
    onmutated,
  }: {
    frameworks: Framework[];
    assignments: Assignment[];
    links: Link[];
    onmutated?: () => void;
  } = $props();

  const tenantLinks = $derived(
    [...links].filter((l) => !l.site_id).sort((a, b) => a.name!.localeCompare(b?.name ?? ''))
  );

  let selectedFrameworkId = $state<string | null>(null);
  let frameworkSheetOpen = $state(false);
  let frameworkSheetMode = $state<'create' | 'edit'>('create');
  let editingFramework = $state<Framework | null>(null);

  let checkDialogOpen = $state(false);
  let checkDialogMode = $state<'create' | 'edit'>('create');
  let editingCheck = $state<Tables<'public', 'compliance_framework_checks'> | null>(null);

  let detailTab = $state<'checks' | 'assignments'>('checks');
  let checksSearch = $state('');
  let overrideSearch = $state('');
  let addOverrideSelected = $state<string | undefined>(undefined);

  const selectedFramework = $derived(frameworks.find((f) => f.id === selectedFrameworkId) ?? null);
  const selectedFrameworkChecks = $derived.by(() =>
    [...(selectedFramework?.compliance_framework_checks ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  );

  const isDefaultAssigned = $derived((frameworkId: string) =>
    assignments.some((a) => a.framework_id === frameworkId && a.link_id === null)
  );

  const isDefaultEnabled = $derived(
    assignments.some((a) => a.framework_id === selectedFrameworkId && a.link_id === null)
  );

  const overrideLinkIds = $derived(
    new Set(
      assignments
        .filter((a) => a.framework_id === selectedFrameworkId && a.link_id !== null)
        .map((a) => a.link_id!)
    )
  );

  const overrideLinks = $derived(tenantLinks.filter((l) => overrideLinkIds.has(l.id)));
  const availableToAdd = $derived(tenantLinks.filter((l) => !overrideLinkIds.has(l.id)));

  const filteredOverrideLinks = $derived(
    overrideLinks.filter((l) =>
      (l.name ?? l.external_id ?? '').toLowerCase().includes(overrideSearch.toLowerCase())
    )
  );

  const filteredChecks = $derived(
    selectedFrameworkChecks.filter((c) => c.name.toLowerCase().includes(checksSearch.toLowerCase()))
  );

  $effect(() => {
    if (selectedFrameworkId) {
      detailTab = 'checks';
      checksSearch = '';
      overrideSearch = '';
      addOverrideSelected = undefined;
    }
  });

  function openCreateFramework() {
    frameworkSheetMode = 'create';
    editingFramework = null;
    frameworkSheetOpen = true;
  }

  function openEditFramework(fw: Framework) {
    frameworkSheetMode = 'edit';
    editingFramework = fw;
    frameworkSheetOpen = true;
  }

  function openAddCheck() {
    checkDialogMode = 'create';
    editingCheck = null;
    checkDialogOpen = true;
  }

  function openEditCheck(check: Tables<'public', 'compliance_framework_checks'>) {
    checkDialogMode = 'edit';
    editingCheck = check;
    checkDialogOpen = true;
  }

  async function deleteFramework(fw: Framework) {
    const { error } = await (supabase as any)
      .from('compliance_frameworks' as any)
      .delete()
      .eq('id', fw.id);
    if (error) {
      toast.error(`Failed to delete framework: ${error.message}`);
      return;
    }
    if (selectedFrameworkId === fw.id) selectedFrameworkId = null;
    toast.info('Framework deleted');
    onmutated?.();
  }

  async function deleteCheck(check: Tables<'public', 'compliance_framework_checks'>) {
    const { error } = await (supabase as any)
      .from('compliance_framework_checks' as any)
      .delete()
      .eq('id', check.id);
    if (error) {
      toast.error(`Failed to delete check: ${error.message}`);
      return;
    }
    toast.info('Check deleted');
    onmutated?.();
  }

  async function toggleDefaultAssignment(frameworkId: string) {
    const tenantId = authStore.currentTenant?.id ?? '';

    // Clear per-tenant overrides — they change meaning on default toggle
    const perTenantIds = assignments
      .filter((a) => a.framework_id === frameworkId && a.link_id !== null)
      .map((a) => a.id);
    if (perTenantIds.length > 0) {
      await (supabase as any)
        .from('compliance_assignments' as any)
        .delete()
        .in('id', perTenantIds);
    }

    const existing = assignments.find((a) => a.framework_id === frameworkId && a.link_id === null);

    if (existing) {
      const { error } = await (supabase as any)
        .from('compliance_assignments' as any)
        .delete()
        .eq('id', existing.id);
      if (error) {
        toast.error('Failed to remove assignment');
        return;
      }
    } else {
      const { error } = await (supabase as any).from('compliance_assignments' as any).insert({
        framework_id: frameworkId,
        integration_id: 'microsoft-365',
        tenant_id: tenantId,
        link_id: null,
      });
      if (error) {
        toast.error('Failed to add assignment');
        return;
      }
    }
    onmutated?.();
  }

  async function addOverride(linkId: string) {
    const tenantId = authStore.currentTenant?.id ?? '';
    const { error } = await (supabase as any).from('compliance_assignments' as any).insert({
      framework_id: selectedFrameworkId,
      integration_id: 'microsoft-365',
      tenant_id: tenantId,
      link_id: linkId,
    });
    if (error) {
      toast.error('Failed to add override');
      return;
    }
    addOverrideSelected = undefined;
    onmutated?.();
  }

  async function removeOverride(linkId: string) {
    const existing = assignments.find(
      (a) => a.framework_id === selectedFrameworkId && a.link_id === linkId
    );
    if (!existing) return;
    const { error } = await (supabase as any)
      .from('compliance_assignments' as any)
      .delete()
      .eq('id', existing.id);
    if (error) {
      toast.error('Failed to remove override');
      return;
    }
    onmutated?.();
  }
</script>

<FrameworkSheet
  bind:open={frameworkSheetOpen}
  mode={frameworkSheetMode}
  framework={editingFramework}
  onsuccess={onmutated}
/>

{#if selectedFramework}
  <CheckDialog
    bind:open={checkDialogOpen}
    mode={checkDialogMode}
    check={editingCheck}
    frameworkId={selectedFramework.id}
    integration={INTEGRATIONS['microsoft-365']}
    onsuccess={onmutated}
  />
{/if}

<div class="flex flex-col size-full gap-4 overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between shrink-0">
    <span class="text-sm text-muted-foreground">
      Manage compliance frameworks and their checks for Microsoft 365.
    </span>
    <Button
      size="sm"
      onclick={openCreateFramework}
      class="gap-1.5"
      disabled={!authStore.isAllowed('Integrations.Write')}
    >
      <Plus class="size-4" /> New Framework
    </Button>
  </div>

  <!-- Body -->
  <div class="flex-1 flex gap-4 overflow-hidden min-h-0">
    <!-- Left: framework list -->
    <div class="w-72 shrink-0 flex flex-col overflow-hidden gap-2">
      <div class="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
        {#if frameworks.length === 0}
          <div class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <ShieldCheck class="size-8 opacity-40" />
            <span class="text-sm">No frameworks yet</span>
          </div>
        {:else}
          {#each frameworks as fw (fw.id)}
            {@const isDefault = isDefaultAssigned(fw.id)}
            <button
              class="text-left w-full"
              onclick={() => (selectedFrameworkId = selectedFrameworkId === fw.id ? null : fw.id)}
            >
              <Card.Root
                class="p-3 cursor-pointer hover:border-primary/50 transition-colors {selectedFrameworkId ===
                fw.id
                  ? 'border-primary bg-primary/10'
                  : 'bg-card/70'}"
              >
                <div class="flex flex-col gap-2">
                  <div class="flex items-start justify-between gap-2">
                    <span class="font-medium text-sm leading-tight">{fw.name}</span>
                    <div class="flex items-center gap-1 shrink-0">
                      {#if isDefault}
                        <Badge
                          variant="outline"
                          class="text-xs bg-primary/15 text-primary border-primary/30"
                        >
                          Default
                        </Badge>
                      {/if}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{fw.compliance_framework_checks.length} checks</span>
                  </div>
                </div>
              </Card.Root>
            </button>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Right: detail panel -->
    {#if selectedFramework}
      <div class="flex-1 flex flex-col overflow-hidden border rounded bg-card/70">
        <!-- Framework header -->
        <div class="flex items-start justify-between px-4 py-3 border-b shrink-0">
          <div class="flex flex-col gap-0.5">
            <h2 class="font-semibold">{selectedFramework.name}</h2>
            {#if selectedFramework.description}
              <span class="text-xs text-muted-foreground">{selectedFramework.description}</span>
            {/if}
          </div>
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              onclick={() => openEditFramework(selectedFramework)}
              class="p-1.5! h-fit rounded text-muted-foreground hover:text-primary"
            >
              <Pencil class="size-4" />
            </Button>

            <ConfirmDialog
              title="Delete Framework?"
              description="This will permanently delete '{selectedFramework.name}' and all its checks."
              confirmLabel="Delete"
              destructive
              onconfirm={() => deleteFramework(selectedFramework)}
            >
              {#snippet trigger(props)}
                <Button
                  variant="ghost"
                  disabled={!authStore.isAllowed('Integrations.Write')}
                  class="p-1.5! h-fit rounded text-muted-foreground hover:text-destructive hover:bg-destructive/20!"
                  {...props}
                >
                  <Trash2 class="size-4" />
                </Button>
              {/snippet}
            </ConfirmDialog>
          </div>
        </div>

        <Tabs.Root bind:value={detailTab} class="flex flex-col flex-1 overflow-hidden gap-0">
          <Tabs.List class="shrink-0 mx-4 mt-3 w-fit">
            <Tabs.Trigger value="checks">Checks</Tabs.Trigger>
            <Tabs.Trigger value="assignments">Assignments</Tabs.Trigger>
          </Tabs.List>

          <!-- Checks Tab -->
          <Tabs.Content value="checks" class="flex-1 overflow-y-auto p-4 mt-0 flex flex-col gap-3">
            <div class="flex items-center gap-2">
              <div class="flex-1">
                <SearchBar bind:value={checksSearch} placeholder="Search checks..." />
              </div>
              <Button
                variant="outline"
                size="sm"
                onclick={openAddCheck}
                class="gap-1 shrink-0"
                disabled={!authStore.isAllowed('Integrations.Write')}
              >
                <Plus class="size-3" /> Add Check
              </Button>
            </div>

            {#if selectedFrameworkChecks.length === 0}
              <div class="flex flex-col items-center py-6 gap-1 text-muted-foreground">
                <ShieldCheck class="size-6 opacity-40" />
                <span class="text-sm">No checks defined</span>
              </div>
            {:else if filteredChecks.length === 0}
              <div class="flex flex-col items-center py-6 gap-1 text-muted-foreground">
                <span class="text-sm">No checks match your search</span>
              </div>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredChecks as check (check.id)}
                  <div class="flex items-center gap-3 p-3 rounded border bg-muted/20">
                    <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                      <span class="text-sm font-medium truncate">{check.name}</span>
                      <span class="text-xs text-muted-foreground"
                        >{formatStringProper(check.check_type_id)}</span
                      >
                    </div>
                    <Badge
                      variant="outline"
                      class="text-xs shrink-0 {severityClass[check.severity] ?? ''}"
                    >
                      {formatStringProper(check.severity)}
                    </Badge>
                    <Button
                      variant="ghost"
                      onclick={() => openEditCheck(check)}
                      class="p-1.5! h-fit rounded text-muted-foreground hover:text-primary"
                    >
                      <Pencil class="size-4" />
                    </Button>
                    <ConfirmDialog
                      title="Delete Check?"
                      description="This will permanently delete '{check.name}'."
                      confirmLabel="Delete"
                      destructive
                      onconfirm={() => deleteCheck(check)}
                    >
                      {#snippet trigger(props)}
                        <Button
                          variant="ghost"
                          disabled={!authStore.isAllowed('Integrations.Write')}
                          class="p-1.5! h-fit rounded text-muted-foreground hover:text-destructive hover:bg-destructive/20!"
                          {...props}
                        >
                          <Trash2 class="size-4" />
                        </Button>
                      {/snippet}
                    </ConfirmDialog>
                  </div>
                {/each}
              </div>
            {/if}
          </Tabs.Content>

          <!-- Assignments Tab -->
          <Tabs.Content
            value="assignments"
            class="flex-1 overflow-y-auto p-4 mt-0 flex flex-col gap-3"
          >
            <!-- Integration default toggle -->
            <div class="flex items-center justify-between p-3 rounded border bg-muted/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-sm font-medium">Integration Default</span>
                <span class="text-xs text-muted-foreground">Apply to all tenants by default</span>
              </div>
              <Switch
                disabled={!authStore.isAllowed('Integrations.Write')}
                checked={isDefaultEnabled}
                onCheckedChange={() => toggleDefaultAssignment(selectedFramework.id)}
              />
            </div>

            <div class="w-full border-t my-1"></div>

            <!-- Dynamic section label -->
            <div class="flex flex-col gap-0.5">
              <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {isDefaultEnabled ? 'Excluded Tenants' : 'Included Tenants'}
              </span>
              <span class="text-xs text-muted-foreground">
                {isDefaultEnabled
                  ? 'These tenants will NOT have this framework applied.'
                  : 'Only these tenants will have this framework applied.'}
              </span>
            </div>

            <!-- Add override picker -->
            {#if authStore.isAllowed('Integrations.Write') && availableToAdd.length > 0}
              <SingleSelect
                bind:selected={addOverrideSelected}
                placeholder={isDefaultEnabled ? 'Exclude a tenant...' : 'Include a tenant...'}
                options={availableToAdd.map((l) => ({
                  value: l.id,
                  label: l.name ?? l.external_id ?? l.id,
                }))}
                onchange={(linkId) => {
                  if (linkId) addOverride(linkId);
                }}
              />
            {/if}

            <!-- Override search (shown when list has entries) -->
            {#if overrideLinks.length > 0}
              <SearchBar bind:value={overrideSearch} placeholder="Filter tenants..." />
            {/if}

            <!-- Override list -->
            {#if overrideLinks.length === 0}
              <div class="flex flex-col items-center py-4 gap-1 text-muted-foreground">
                <Globe class="size-5 opacity-40" />
                <span class="text-sm">
                  {isDefaultEnabled
                    ? 'No exclusions — all tenants included'
                    : 'No tenants included'}
                </span>
              </div>
            {:else}
              <div class="flex flex-col gap-2">
                {#each filteredOverrideLinks as link (link.id)}
                  <div class="flex items-center justify-between p-3 rounded border bg-muted/20">
                    <div class="flex items-center gap-2">
                      <Globe class="size-3.5 text-muted-foreground" />
                      <span class="text-sm">{link.name ?? link.external_id}</span>
                    </div>
                    <Button
                      variant="ghost"
                      disabled={!authStore.isAllowed('Integrations.Write')}
                      onclick={() => removeOverride(link.id)}
                      class="p-1.5! h-fit rounded text-muted-foreground hover:text-destructive hover:bg-destructive/20!"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                {/each}
              </div>
            {/if}
          </Tabs.Content>
        </Tabs.Root>
      </div>
    {:else}
      <div class="flex-1 flex items-center justify-center text-muted-foreground">
        <div class="flex flex-col items-center gap-2">
          <ShieldCheck class="size-8 opacity-40" />
          <span class="text-sm">Select a framework to view details</span>
        </div>
      </div>
    {/if}
  </div>
</div>
