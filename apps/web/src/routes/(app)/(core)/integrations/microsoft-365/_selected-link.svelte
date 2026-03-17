<script lang="ts">
  import { CONSENT_VERSION, MS_CAPABILITIES } from '@workspace/shared/config/microsoft';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import {
    CircleAlert,
    X,
    TriangleAlert,
    Users,
    Globe,
    Activity,
    CircleCheck,
  } from '@lucide/svelte';
  import SingleSelect from '$lib/components/single-select.svelte';
  import { CircleQuestionMark } from 'lucide-svelte';
  import { enhance } from '$app/forms';
  import type { Tables, TablesInsert } from '@workspace/shared/types/database';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import { toast } from 'svelte-sonner';
  import PermissionGaurd from '$lib/components/auth/permission-gaurd.svelte';

  const {
    selectedLink,
    domainSiteMap,
    dbSites,
    deselect,
    onSaveMappings,
    onRefreshed,
  }: {
    selectedLink: Tables<'public', 'integration_links'>;
    domainSiteMap: Map<string, string>;
    dbSites: Tables<'public', 'sites'>[];
    deselect?: () => void;
    onSaveMappings?: () => void;
    onRefreshed?: () => void;
  } = $props();

  const mappings = $derived<Record<string, string | null>>(
    Object.fromEntries(domainSiteMap.entries())
  );

  let saving = $state(false);
  let mappingsChanged = $state(false);
  let refreshing = $state(false);

  const onMappingChange = (domain: string, v: string | null) => {
    mappings[domain] = v;
    mappingsChanged = Object.keys(mappings).some(
      (d) => (domainSiteMap.get(d) ?? null) !== mappings[d]
    );
  };

  const handleSaveMappings = async () => {
    saving = true;

    try {
      const siteDomainMap: Map<string, string[]> = new Map();
      for (const [k, v] of Object.entries(mappings)) {
        if (!v) continue;

        if (siteDomainMap.has(v)) {
          siteDomainMap.get(v)?.push(k);
        } else {
          siteDomainMap.set(v, [k]);
        }
      }

      const toUpsert = siteDomainMap
        .keys()
        .map(
          (k) =>
            ({
              tenant_id: selectedLink.tenant_id,
              integration_id: selectedLink.integration_id,
              external_id: selectedLink.external_id,
              site_id: k,
              meta: { domains: siteDomainMap.get(k) },
            }) as TablesInsert<'public', 'integration_links'>
        )
        .toArray();

      const { data, error } = await supabase
        .from('integration_links')
        .upsert(toUpsert, { onConflict: 'tenant_id,integration_id,external_id,site_id' })
        .select('id');

      if (error) {
        throw error.message;
      }

      const { error: deleteError } = await supabase
        .from('integration_links')
        .delete()
        .notIn(
          'id',
          data.map((d) => d.id)
        )
        .eq('external_id', selectedLink.external_id)
        .eq('integration_id', selectedLink.integration_id)
        .eq('tenant_id', selectedLink.tenant_id)
        .not('site_id', 'is', null);

      if (deleteError) {
        console.log(deleteError.message);
      }

      onSaveMappings?.();
      toast.info('Successfully saved mappings!');
    } catch (err) {
      console.log(err);
      toast.error(`Failed to process mappings changes`);
    } finally {
      saving = false;
    }
  };
</script>

<div class="flex-1 flex flex-col overflow-hidden border rounded bg-card/70">
  <!-- Tenant header -->
  <div class="flex items-start justify-between px-4 py-3 border-b shrink-0">
    <div class="flex flex-col gap-0.5">
      <h2 class="font-semibold">{selectedLink.name ?? selectedLink.external_id}</h2>
      <span class="text-xs text-muted-foreground font-mono">Tenant: {selectedLink.external_id}</span
      >
    </div>
    <button
      class="p-1 rounded hover:bg-muted transition-colors"
      onclick={() => deselect?.()}
      aria-label="Close panel"
    >
      <X class="size-4" />
    </button>
  </div>

  {#if selectedLink.status === 'active'}
    {@const needsConsent = (selectedLink.meta as any)?.consentVersion !== CONSENT_VERSION}
    {#if needsConsent}
      <div
        class="flex items-center justify-between gap-3 mx-4 mt-3 px-3 py-2 rounded bg-warning/10 text-warning border border-warning/30 shrink-0"
      >
        <div class="flex items-center gap-2">
          <TriangleAlert class="size-4 shrink-0" />
          <span class="text-xs">Consent is outdated — re-consent to restore full access.</span>
        </div>
        <form method="POST" action="?/gdapConsent" use:enhance>
          <input name="gdapTenantId" value={selectedLink.external_id} hidden />
          <Button
            size="sm"
            variant="outline"
            class="text-warning border-warning/40 hover:bg-warning/10 shrink-0"
            type="submit"
          >
            Re-consent
          </Button>
        </form>
      </div>
    {/if}
    <!-- Tabs -->
    <Tabs.Root value="domains" class="flex flex-col flex-1 overflow-hidden">
      <Tabs.List class="mx-4 mt-3 shrink-0">
        <Tabs.Trigger value="domains">Domains</Tabs.Trigger>
        <Tabs.Trigger value="capabilities">Capabilities</Tabs.Trigger>
      </Tabs.List>

      <!-- Domains tab -->
      <Tabs.Content value="domains" class="flex flex-col overflow-y-auto p-4 gap-2">
        {#if !(selectedLink.meta as any)?.domains?.length}
          <div class="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Globe class="size-8 opacity-40" />
            <span class="text-sm">No domains cached</span>
          </div>
        {:else}
          <div class="flex flex-col h-full gap-3 overflow-auto">
            <div class="grid grid-cols-2 gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Domain</span>
              <span>Mapped Site</span>
            </div>
            {#each (selectedLink.meta as any).domains as domain}
              {@const mappedSiteId = domainSiteMap.get(domain)}
              <div class="grid grid-cols-2 gap-2 items-center">
                <span class="text-sm font-mono truncate">{domain}</span>
                <SingleSelect
                  options={dbSites.map((ds) => ({ label: ds.name, value: ds.id }))}
                  selected={mappedSiteId}
                  onchange={(v) => onMappingChange(domain, v.length ? v : null)}
                />
              </div>
            {/each}
          </div>
        {/if}
        <div class="flex h-fit pt-4">
          <PermissionGaurd permission="Integrations.Write">
            <Button size="sm" disabled={!mappingsChanged || saving} onclick={handleSaveMappings}
              >Save Mappings</Button
            >
          </PermissionGaurd>
        </div>
      </Tabs.Content>

      <!-- Capabilities tab -->
      <Tabs.Content value="capabilities" class="flex-1 overflow-y-auto px-4 pb-4 mt-3">
        <div class="flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <span class="font-medium text-sm">Tenant Capabilities</span>
            <form
              method="POST"
              action="?/refreshCapabilities"
              use:enhance={() => {
                refreshing = true;
                return async ({ result, update }) => {
                  refreshing = false;
                  await update({ reset: false });
                  if (result.type === 'failure') {
                    toast.error((result.data as any)?.error ?? 'Failed to refresh capabilities');
                  } else {
                    toast.info('Capabilities refreshed');
                    onRefreshed?.();
                  }
                };
              }}
            >
              <input name="gdapTenantId" value={selectedLink.external_id} hidden />
              <PermissionGaurd permission="Integrations.Write">
                <Button size="sm" variant="outline" type="submit" disabled={refreshing}>
                  <Activity class="size-4 mr-1.5" />
                  {refreshing ? 'Refreshing...' : 'Refresh Capabilities'}
                </Button>
              </PermissionGaurd>
            </form>
          </div>
          <div class="flex flex-col gap-2">
            {#each Object.entries(MS_CAPABILITIES) as [key, cap]}
              {@const hasCapability = (selectedLink.meta as any)?.capabilities?.[key] as boolean}
              <div class="flex items-start gap-3 p-3 rounded border bg-muted/30">
                {#if hasCapability}
                  <CircleCheck class="size-4 text-primary mt-0.5 shrink-0" />
                {:else if (selectedLink.meta as any)?.capabilities?.[key] === undefined}
                  <CircleQuestionMark class="size-4 text-amber-500 mt-0.5 shrink-0" />
                {:else}
                  <CircleAlert class="size-4 text-red-500 mt-0.5 shrink-0" />
                {/if}
                <div class="flex flex-col gap-0.5">
                  <span class="text-sm font-medium">{cap.label}</span>
                  <span class="text-xs text-muted-foreground">{cap.description}</span>
                  {#if (selectedLink.meta as any)?.capabilities?.[key] === undefined}
                    <span class="text-xs text-muted-foreground/60 italic">not yet checked</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>
  {:else}
    <div class="flex flex-col size-full p-4 items-center justify-center">
      <div class="flex flex-col h-fit justify-center items-center w-full gap-2">
        Process consent flow to activate this tenant.
        <form method="POST" action="?/gdapConsent" use:enhance>
          <input name="gdapTenantId" bind:value={selectedLink.external_id} hidden />
          <Button type="submit">Consent</Button>
        </form>
      </div>
    </div>
  {/if}
</div>
