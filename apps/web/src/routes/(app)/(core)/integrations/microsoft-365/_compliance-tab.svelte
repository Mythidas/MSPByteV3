<script lang="ts">
  import * as Card from '$lib/components/ui/card/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Plus, ShieldCheck, Pencil, Trash2, Globe, UserCog } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { INTEGRATIONS } from '@workspace/core/config/integrations';
  import FrameworkSheet from './_framework-sheet.svelte';
  import CheckDialog from './_check-dialog.svelte';
  import Switch from '$lib/components/ui/switch/switch.svelte';

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

  const tenantLinks = $derived([...links].filter((l) => !l.site_id).sort((a, b) => a.name!.localeCompare(b?.name ?? '')));

  let selectedFrameworkId = $state<string | null>(null);
  let frameworkSheetOpen = $state(false);
  let frameworkSheetMode = $state<'create' | 'edit'>('create');
  let editingFramework = $state<Framework | null>(null);

  let checkDialogOpen = $state(false);
  let checkDialogMode = $state<'create' | 'edit'>('create');
  let editingCheck = $state<Tables<'public', 'compliance_framework_checks'> | null>(null);

  const selectedFramework = $derived(
    frameworks.find((f) => f.id === selectedFrameworkId) ?? null
  );
  const selectedFrameworkChecks = $derived.by(() =>
    [...(selectedFramework?.compliance_framework_checks ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  );

  const isDefaultAssigned = $derived((frameworkId: string) =>
    assignments.some((a) => a.framework_id === frameworkId && a.link_id === null)
  );

  const isLinkAssigned = $derived((frameworkId: string, linkId: string) =>
    assignments.some((a) => a.framework_id === frameworkId && a.link_id === linkId)
  );

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
    const existing = assignments.find(
      (a) => a.framework_id === frameworkId && a.link_id === null
    );

    if (existing) {
      const { error } = await (supabase as any)
        .from('compliance_assignments' as any)
        .delete()
        .eq('id', existing.id);
      if (error) { toast.error('Failed to remove assignment'); return; }
    } else {
      const { error } = await (supabase as any)
        .from('compliance_assignments' as any)
        .insert({ framework_id: frameworkId, integration_id: 'microsoft-365', tenant_id: tenantId, link_id: null });
      if (error) { toast.error('Failed to add assignment'); return; }
    }
    onmutated?.();
  }

  async function toggleLinkAssignment(frameworkId: string, linkId: string) {
    const tenantId = authStore.currentTenant?.id ?? '';
    const existing = assignments.find(
      (a) => a.framework_id === frameworkId && a.link_id === linkId
    );

    if (existing) {
      const { error } = await (supabase as any)
        .from('compliance_assignments' as any)
        .delete()
        .eq('id', existing.id);
      if (error) { toast.error('Failed to remove assignment'); return; }
    } else {
      const { error } = await (supabase as any)
        .from('compliance_assignments' as any)
        .insert({ framework_id: frameworkId, integration_id: 'microsoft-365', tenant_id: tenantId, link_id: linkId });
      if (error) { toast.error('Failed to add assignment'); return; }
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
    <Button size="sm" onclick={openCreateFramework} class="gap-1.5">
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
                class="p-3 cursor-pointer hover:border-primary/50 transition-colors {selectedFrameworkId === fw.id
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
                    {#each ['critical', 'high', 'medium', 'low', 'info'] as sev}
                      {@const count = fw.compliance_framework_checks.filter(
                        (c) => c.severity === sev
                      ).length}
                      {#if count > 0}
                        <Badge variant="outline" class="text-xs {severityClass[sev]}">
                          {count} {sev}
                        </Badge>
                      {/if}
                    {/each}
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
            <button
              class="p-1.5 rounded hover:bg-primary/20 hover:cursor-pointer transition-colors text-muted-foreground hover:text-primary"
              onclick={() => openEditFramework(selectedFramework)}
            >
              <Pencil class="size-4" />
            </button>
            <button
              class="p-1.5 rounded hover:bg-destructive/10 hover:cursor-pointer text-muted-foreground hover:text-destructive transition-colors"
              onclick={() => deleteFramework(selectedFramework)}
            >
              <Trash2 class="size-4" />
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- Checks section -->
          <div class="flex flex-col gap-3 p-4 border-b">
            <div class="flex items-center justify-between">
              <span class="font-medium text-sm">Checks</span>
              <Button variant="outline" size="sm" onclick={openAddCheck} class="gap-1">
                <Plus class="size-3" /> Add Check
              </Button>
            </div>

            {#if selectedFrameworkChecks.length === 0}
              <div class="flex flex-col items-center py-6 gap-1 text-muted-foreground">
                <ShieldCheck class="size-6 opacity-40" />
                <span class="text-sm">No checks defined</span>
              </div>
            {:else}
              <div class="flex flex-col gap-2">
                {#each selectedFrameworkChecks as check (check.id)}
                  <div class="flex items-center gap-3 p-3 rounded border bg-muted/20">
                    <div class="flex-1 flex flex-col gap-0.5 min-w-0">
                      <span class="text-sm font-medium truncate">{check.name}</span>
                      <span class="text-xs text-muted-foreground">{check.check_type_id}</span>
                    </div>
                    <Badge variant="outline" class="text-xs shrink-0 {severityClass[check.severity] ?? ''}">
                      {check.severity}
                    </Badge>
                    <button
                      class="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                      onclick={() => openEditCheck(check)}
                    >
                      <Pencil class="size-3.5" />
                    </button>
                    <button
                      class="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      onclick={() => deleteCheck(check)}
                    >
                      <Trash2 class="size-3.5" />
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Assignments section -->
          <div class="flex flex-col gap-3 p-4">
            <span class="font-medium text-sm">Assignments</span>

            <!-- Integration default toggle -->
            <div class="flex items-center justify-between p-3 rounded border bg-muted/20">
              <div class="flex flex-col gap-0.5">
                <span class="text-sm font-medium">Integration Default</span>
                <span class="text-xs text-muted-foreground">Apply to all tenants by default</span>
              </div>
              <Switch
                checked={isDefaultAssigned(selectedFramework.id)}
                onCheckedChange={() => toggleDefaultAssignment(selectedFramework.id)}
              />
            </div>

            {#if tenantLinks.length > 0}
              <div class="w-full border-t my-1"></div>
              <span class="text-xs text-muted-foreground font-medium">Per-tenant overrides</span>
              {#each tenantLinks as link (link.id)}
                <div class="flex items-center justify-between p-3 rounded border bg-muted/20">
                  <div class="flex items-center gap-2">
                    <Globe class="size-3.5 text-muted-foreground" />
                    <span class="text-sm">{link.name ?? link.external_id}</span>
                  </div>
                  <Switch
                    checked={isLinkAssigned(selectedFramework.id, link.id)}
                    onCheckedChange={() => toggleLinkAssignment(selectedFramework.id, link.id)}
                  />
                </div>
              {/each}
            {/if}
          </div>
        </div>
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
