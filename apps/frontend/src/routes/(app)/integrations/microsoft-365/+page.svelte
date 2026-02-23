<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import {
    LoaderCircle,
    CircleAlert,
    CircleCheck,
    Trash2,
    ExternalLink,
    ShieldAlert,
    ShieldCheck,
    ArrowLeft,
    Settings,
    RefreshCw,
  } from '@lucide/svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import { toast } from 'svelte-sonner';
  import { isMaskedSecret } from '$lib/utils/forms';
  import SingleSelect from '$lib/components/single-select.svelte';
  import { browser } from '$app/environment';
  import { deserialize } from '$app/forms';
  import type { PageProps } from './$types';
  import { microsoft365ConfigSchema } from './_forms';
  import { MS_CAPABILITIES } from '@workspace/shared/config/microsoft';
  import type { MSCapabilityKey } from '@workspace/shared/types/integrations/microsoft/capabilities';

  let { data }: PageProps = $props();

  // svelte-ignore state_referenced_locally
  let currentMode = $state<'direct' | 'partner'>(
    (data.integration?.config as any)?.mode ?? 'direct'
  );

  // svelte-ignore state_referenced_locally
  const form = superForm(data.form, {
    validators: zod4Client(microsoft365ConfigSchema),
    resetForm: false,
    onUpdate({ form }) {
      if (form.message) {
        if (form.valid) {
          toast.success(form.message);
        } else {
          toast.error(form.message);
        }
      }
    },
  });

  const { form: formData, errors, enhance, delayed, submitting } = form;

  const isSecretMasked = $derived(
    currentMode === 'direct' && isMaskedSecret(($formData as any).clientSecret ?? '')
  );

  // Read initial tab from URL
  let currentTab = $state(
    browser
      ? (new URLSearchParams(window.location.search).get('tab') ?? 'configuration')
      : 'configuration'
  );

  // Partner mode state
  let connectingMSP = $state(false);
  let refreshingConnections = $state(false);
  let savingMappings = $state(false);
  let checkingCapabilities = $state(false);

  // Connection list filter/search state
  let searchQuery = $state('');
  let activeFilter = $state<'all' | 'needs-consent' | 'active' | 'has-unmapped' | 'has-orphans'>(
    'all'
  );

  // Orphan detail state
  let orphanedEntities = $state<{ id: string; display_name: string | null; raw_data: any }[]>([]);
  let orphanedTotal = $state(0);
  let loadingOrphans = $state(false);
  let orphanAssignments = $state<Record<string, string>>({});
  let savingAssignments = $state(false);

  // Connections from DB (initial + refreshed)
  // svelte-ignore state_referenced_locally
  let connections = $state<
    {
      id: string;
      external_id: string;
      name: string;
      status: string;
      meta: any;
      integration_id: string;
      tenant_id: string;
      created_at: string;
      updated_at: string;
    }[]
  >((data.connections ?? []) as any[]);

  // Which connection external_id is expanded
  let expandedConnectionId = $state<string | null>(null);

  // Domain assignments: { [connectionExternalId]: { [domain]: siteId } }
  // Initialized from DB-persisted domain mappings
  // svelte-ignore state_referenced_locally
  let domainAssignments = $state<Record<string, Record<string, string>>>(
    Object.fromEntries(
      Object.entries(data.domainMappings ?? {}).map(([extId, domainMap]) => [
        extId,
        { ...(domainMap as Record<string, string>) },
      ])
    )
  );

  const expandedConnection = $derived(
    connections.find((c) => c.external_id === expandedConnectionId) ?? null
  );

  const expandedDomains = $derived<string[]>((expandedConnection?.meta as any)?.domains ?? []);

  const unmappedCount = $derived(
    expandedConnectionId
      ? expandedDomains.filter((d) => !domainAssignments[expandedConnectionId!]?.[d]).length
      : 0
  );

  function getUnmappedCount(conn: (typeof connections)[0]): number {
    const domains: string[] = (conn.meta as any)?.domains ?? [];
    const assignments = domainAssignments[conn.external_id] ?? {};
    return domains.filter((d) => !assignments[d]).length;
  }

  const filteredConnections = $derived.by(() => {
    let list = connections;
    if (searchQuery)
      list = list.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    if (activeFilter === 'needs-consent') list = list.filter((c) => c.status === 'pending');
    else if (activeFilter === 'active') list = list.filter((c) => c.status === 'active');
    else if (activeFilter === 'has-unmapped') list = list.filter((c) => getUnmappedCount(c) > 0);
    else if (activeFilter === 'has-orphans')
      list = list.filter((c) => (data.orphanCounts[c.external_id] ?? 0) > 0);
    return list;
  });

  function selectMode(mode: 'direct' | 'partner') {
    currentMode = mode;
    ($formData as any).mode = mode;
  }

  // Expand a connection — ensure its domain assignments object is initialized
  function expandConnection(externalId: string) {
    if (!domainAssignments[externalId]) {
      domainAssignments[externalId] = {};
    }
    const conn = connections.find((c) => c.external_id === externalId);
    const domains: string[] = (conn?.meta as any)?.domains ?? [];
    for (const domain of domains) {
      if (!(domain in domainAssignments[externalId])) {
        domainAssignments[externalId][domain] =
          (data.domainMappings as any)?.[externalId]?.[domain] ?? '';
      }
    }
    // Reset orphan state when switching connections
    orphanedEntities = [];
    orphanedTotal = 0;
    orphanAssignments = {};
    expandedConnectionId = externalId;
  }

  async function handleLoadOrphans(offset = 0) {
    if (!expandedConnectionId) return;
    loadingOrphans = true;
    try {
      const body = new FormData();
      body.set('externalId', expandedConnectionId);
      body.set('offset', String(offset));
      const response = await fetch('?/getOrphanedEntities', { method: 'POST', body });
      const result = deserialize(await response.text());
      if (result.type === 'failure' || result.type === 'error') {
        const errMsg =
          result.type === 'failure'
            ? (result.data as any)?.error
            : result.type === 'error'
              ? String(result.error)
              : 'Unknown error';
        toast.error(errMsg ?? 'Failed to load orphaned entities');
        return;
      }
      const { entities, total } = (result.type === 'success' ? (result.data as any) : null) ?? {};
      if (offset === 0) {
        orphanedEntities = entities ?? [];
      } else {
        orphanedEntities = [...orphanedEntities, ...(entities ?? [])];
      }
      orphanedTotal = total ?? 0;
    } catch (err) {
      toast.error(`Failed: ${String(err)}`);
    } finally {
      loadingOrphans = false;
    }
  }

  async function handleSaveAssignments() {
    savingAssignments = true;
    try {
      const assignments = Object.entries(orphanAssignments)
        .filter(([, siteId]) => siteId)
        .map(([entityId, siteId]) => ({ entityId, siteId }));

      const body = new FormData();
      body.set('assignments', JSON.stringify(assignments));
      const response = await fetch('?/assignEntitySites', { method: 'POST', body });
      const result = deserialize(await response.text());
      if (result.type === 'failure' || result.type === 'error') {
        const errMsg =
          result.type === 'failure'
            ? (result.data as any)?.error
            : result.type === 'error'
              ? String(result.error)
              : 'Unknown error';
        toast.error(errMsg ?? 'Failed to save assignments');
        return;
      }
      toast.success('Assignments saved successfully');
      await handleLoadOrphans(0);
    } catch (err) {
      toast.error(`Failed: ${String(err)}`);
    } finally {
      savingAssignments = false;
    }
  }

  async function handleDelete() {
    if (
      !confirm('Are you sure you want to delete this integration? This action cannot be undone.')
    ) {
      return;
    }

    const response = await fetch('?/delete', { method: 'POST' });

    if (response.ok) {
      toast.success('Integration deleted successfully');
      window.location.reload();
    } else {
      toast.error('Failed to delete integration');
    }
  }

  async function handleConnect() {
    connectingMSP = true;
    try {
      const response = await fetch('?/generateConsentUrl', {
        method: 'POST',
        body: new FormData(),
      });
      const result = deserialize(await response.text());

      if (result.type === 'failure' || result.type === 'error') {
        const errMsg =
          result.type === 'failure'
            ? (result.data as any)?.error
            : result.type === 'error'
              ? String(result.error)
              : 'Unknown error';
        toast.error(errMsg ?? 'Failed to generate consent URL');
        return;
      }

      const consentUrl = result.type === 'success' ? (result.data as unknown as string) : '';

      if (consentUrl) {
        window.open(consentUrl, '_blank', 'noopener,noreferrer');
        toast.info('Consent page opened in a new tab. Return here after granting access.');
      } else {
        toast.error('No consent URL returned from server');
      }
    } catch (err) {
      toast.error(`Failed: ${String(err)}`);
    } finally {
      connectingMSP = false;
    }
  }

  $effect(() => {
    if (data.consentedTenant) {
      toast.success('Enterprise app consented — click Refresh to load updated status.');
    }
    if (data.consentError) {
      toast.error(data.consentError);
    }
  });

  async function handleGDAPConsent(gdapTenantId: string) {
    const body = new FormData();
    body.set('gdapTenantId', gdapTenantId);
    const response = await fetch('?/generateGDAPConsentUrl', { method: 'POST', body });
    const result = deserialize(await response.text());

    if (result.type === 'failure' || result.type === 'error') {
      const errMsg =
        result.type === 'failure'
          ? (result.data as any)?.error
          : result.type === 'error'
            ? String(result.error)
            : 'Unknown error';
      toast.error(errMsg ?? 'Failed to generate consent URL');
      return;
    }

    const consentUrl = result.type === 'success' ? (result.data as unknown as string) : '';
    if (consentUrl) {
      window.open(consentUrl, '_blank', 'noopener,noreferrer');
      toast.info('Consent page opened in a new tab. Return here after granting access.');
    }
  }

  async function handleRefreshConnections() {
    refreshingConnections = true;
    try {
      const response = await fetch('?/listGDAPTenants', { method: 'POST', body: new FormData() });
      const result = deserialize(await response.text());

      if (result.type === 'failure' || result.type === 'error') {
        const errMsg =
          result.type === 'failure'
            ? (result.data as any)?.error
            : result.type === 'error'
              ? String(result.error)
              : 'Unknown error';
        toast.error(errMsg ?? 'Failed to refresh connections');
        return;
      }

      const updated = (result.type === 'success' ? (result.data as any) : null)?.connections ?? [];
      connections = updated;

      // Preserve existing assignments; initialize any new domains
      for (const conn of updated) {
        const domains: string[] = (conn.meta as any)?.domains ?? [];
        if (!domainAssignments[conn.external_id]) {
          domainAssignments[conn.external_id] = {};
        }
        for (const domain of domains) {
          if (!(domain in domainAssignments[conn.external_id])) {
            domainAssignments[conn.external_id][domain] = '';
          }
        }
      }

      // If the expanded connection changed (e.g., domains updated), keep it expanded
      if (
        expandedConnectionId &&
        !updated.find((c: any) => c.external_id === expandedConnectionId)
      ) {
        expandedConnectionId = null;
      }

      toast.success(`${updated.length} GDAP connection(s) synced`);
    } catch (err) {
      toast.error(`Failed: ${String(err)}`);
    } finally {
      refreshingConnections = false;
    }
  }

  async function handleSaveMappings(connectionExternalId: string) {
    savingMappings = true;
    try {
      const assignments = domainAssignments[connectionExternalId] ?? {};

      // Group domains by site
      const siteMap = new Map<string, string[]>();
      for (const [domain, siteId] of Object.entries(assignments)) {
        if (!siteId) continue;
        if (!siteMap.has(siteId)) siteMap.set(siteId, []);
        siteMap.get(siteId)!.push(domain);
      }

      const siteLinks = [...siteMap.entries()].map(([siteId, domains]) => ({ siteId, domains }));

      const body = new FormData();
      body.append('connectionExternalId', connectionExternalId);
      body.append('siteLinks', JSON.stringify(siteLinks));

      const response = await fetch('?/saveMappings', { method: 'POST', body });
      const result = deserialize(await response.text());

      if (result.type === 'failure' || result.type === 'error') {
        const errMsg =
          result.type === 'failure'
            ? (result.data as any)?.error
            : result.type === 'error'
              ? String(result.error)
              : 'Unknown error';
        toast.error(errMsg ?? 'Failed to save mappings');
        return;
      }

      toast.success('Mappings saved successfully');
    } catch (err) {
      toast.error(`Failed: ${String(err)}`);
    } finally {
      savingMappings = false;
    }
  }

  async function handleRefreshCapabilities(gdapTenantId: string) {
    checkingCapabilities = true;
    try {
      const body = new FormData();
      body.set('gdapTenantId', gdapTenantId);
      const response = await fetch('?/refreshCapabilities', { method: 'POST', body });
      const result = deserialize(await response.text());

      if (result.type === 'failure' || result.type === 'error') {
        const errMsg =
          result.type === 'failure'
            ? (result.data as any)?.error
            : result.type === 'error'
              ? String(result.error)
              : 'Unknown error';
        toast.error(errMsg ?? 'Failed to refresh capabilities');
        return;
      }

      const updated = (result.type === 'success' ? (result.data as any) : null)?.connection;
      if (updated) {
        connections = connections.map((c) => (c.external_id === gdapTenantId ? updated : c));
        toast.success('Capabilities refreshed');
      }
    } catch (err) {
      toast.error(`Failed: ${String(err)}`);
    } finally {
      checkingCapabilities = false;
    }
  }
</script>

<div class="flex flex-col relative size-full items-center p-4 gap-2">
  <div class="flex bg-card w-1/2 h-fit py-2 px-4 shadow rounded">
    <Breadcrumb.Root>
      <Breadcrumb.List>
        <Breadcrumb.Item>
          <Breadcrumb.Link href="/integrations">Integrations</Breadcrumb.Link>
        </Breadcrumb.Item>
        <Breadcrumb.Separator />
        <Breadcrumb.Item>
          <Breadcrumb.Page>Microsoft 365</Breadcrumb.Page>
        </Breadcrumb.Item>
      </Breadcrumb.List>
    </Breadcrumb.Root>
  </div>

  <div class="flex flex-col w-1/2 h-full overflow-hidden shadow rounded">
    <Tabs.Root bind:value={currentTab} class="size-full flex flex-col">
      <div class="flex bg-card w-full h-fit py-2 px-2 shadow rounded">
        <Tabs.List>
          <Tabs.Trigger value="configuration">Configuration</Tabs.Trigger>
          <Tabs.Trigger value="connections" disabled={!data.integration}>Connections</Tabs.Trigger>
        </Tabs.List>
      </div>

      <div class="flex bg-card w-full h-full flex-1 py-4 px-4 shadow rounded overflow-hidden">
        <!-- ================================================================ -->
        <!-- CONFIGURATION TAB                                                 -->
        <!-- ================================================================ -->
        <Tabs.Content value="configuration" class="w-full h-full overflow-auto space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">Microsoft 365 Configuration</h2>
              <p class="text-sm text-muted-foreground">
                Choose how MSPByte connects to your Microsoft 365 environment
              </p>
            </div>
            {#if data.integration}
              <Button variant="destructive" size="sm" onclick={handleDelete} disabled={$submitting}>
                <Trash2 class="h-4 w-4 mr-2" />
                Delete
              </Button>
            {/if}
          </div>

          <!-- Mode toggle -->
          <div class="flex gap-2 p-1 bg-muted rounded-lg w-fit">
            <button
              type="button"
              class="px-4 py-1.5 text-sm rounded-md transition-colors {currentMode === 'direct'
                ? 'bg-background shadow font-medium'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => selectMode('direct')}
            >
              Direct
            </button>
            <button
              type="button"
              class="px-4 py-1.5 text-sm rounded-md transition-colors {currentMode === 'partner'
                ? 'bg-background shadow font-medium'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => selectMode('partner')}
            >
              Partner (GDAP)
            </button>
          </div>

          <form method="POST" action="?/save" class="space-y-6" use:enhance>
            <input type="hidden" name="mode" value={currentMode} />

            {#if currentMode === 'direct'}
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label for="tenantId">
                    Tenant ID
                    <span class="text-destructive">*</span>
                  </Label>
                  <Input
                    id="tenantId"
                    name="tenantId"
                    type="text"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    bind:value={($formData as any).tenantId}
                    aria-invalid={($errors as any).tenantId ? 'true' : undefined}
                    class={($errors as any).tenantId ? 'border-destructive' : ''}
                  />
                  {#if ($errors as any).tenantId}
                    <p class="text-sm text-destructive flex items-center gap-1">
                      <CircleAlert class="h-3 w-3" />
                      {($errors as any).tenantId}
                    </p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <Label for="clientId">
                    Client ID (App ID)
                    <span class="text-destructive">*</span>
                  </Label>
                  <Input
                    id="clientId"
                    name="clientId"
                    type="text"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    bind:value={($formData as any).clientId}
                    aria-invalid={($errors as any).clientId ? 'true' : undefined}
                    class={($errors as any).clientId ? 'border-destructive' : ''}
                  />
                  {#if ($errors as any).clientId}
                    <p class="text-sm text-destructive flex items-center gap-1">
                      <CircleAlert class="h-3 w-3" />
                      {($errors as any).clientId}
                    </p>
                  {/if}
                </div>

                <div class="space-y-2">
                  <Label for="clientSecret">
                    Client Secret
                    <span class="text-destructive">*</span>
                  </Label>
                  <Input
                    id="clientSecret"
                    name="clientSecret"
                    type="password"
                    placeholder={data.integration
                      ? 'Leave unchanged to keep existing'
                      : 'your-client-secret'}
                    bind:value={($formData as any).clientSecret}
                    aria-invalid={($errors as any).clientSecret ? 'true' : undefined}
                    class={($errors as any).clientSecret ? 'border-destructive' : ''}
                  />
                  {#if ($errors as any).clientSecret}
                    <p class="text-sm text-destructive flex items-center gap-1">
                      <CircleAlert class="h-3 w-3" />
                      {($errors as any).clientSecret}
                    </p>
                  {/if}
                  {#if data.integration && isSecretMasked}
                    <p class="text-xs text-muted-foreground">
                      Secret is currently saved. Modify to update.
                    </p>
                  {/if}
                </div>
              </div>
            {:else}
              <!-- Partner mode info card -->
              <div class="rounded-lg border bg-primary/5 border-primary/20 p-4 space-y-3">
                <div class="flex items-center gap-2">
                  <CircleCheck class="h-5 w-5 text-primary" />
                  <h3 class="font-medium">MSPByte Centralized App (GDAP)</h3>
                </div>
                <p class="text-sm text-muted-foreground">
                  In Partner mode, MSPByte uses its own registered Azure multi-tenant application
                  with GDAP. You only need to consent once as the MSP admin — no customer action
                  required.
                </p>
                {#if data.partnerClientId}
                  <p class="text-xs font-mono text-muted-foreground">
                    App ID: {data.partnerClientId}
                  </p>
                {:else}
                  <p class="text-xs text-destructive">
                    Warning: MICROSOFT_CLIENT_ID is not configured in the server environment.
                  </p>
                {/if}

                <div class="border-t pt-3 space-y-2">
                  {#if data.partnerTenantId}
                    <div class="flex items-center gap-2">
                      <CircleCheck class="h-4 w-4 text-primary" />
                      <span class="text-sm font-medium">MSP tenant connected</span>
                    </div>
                    <p class="text-xs font-mono text-muted-foreground">{data.partnerTenantId}</p>
                  {:else}
                    <div class="flex items-center gap-2">
                      <CircleAlert class="h-4 w-4 text-warning" />
                      <span class="text-sm text-muted-foreground">
                        Not connected — click below to grant MSPByte access
                      </span>
                    </div>
                  {/if}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  class="w-full"
                  disabled={connectingMSP || !data.partnerClientId}
                  onclick={handleConnect}
                >
                  {#if connectingMSP}
                    <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
                  {:else}
                    <ExternalLink class="mr-2 h-4 w-4" />
                  {/if}
                  {data.partnerTenantId
                    ? 'Re-connect MSPByte to Microsoft'
                    : 'Connect MSPByte to Microsoft'}
                </Button>
              </div>
            {/if}

            <div class="flex gap-2 justify-end pt-4 border-t">
              <Button
                type="submit"
                formaction="?/testConnection"
                variant="outline"
                disabled={$submitting}
              >
                {#if $delayed && $submitting}
                  <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
                {/if}
                Test Connection
              </Button>
              <Button type="submit" disabled={$submitting}>
                {#if $delayed && $submitting}
                  <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
                {/if}
                {data.integration ? 'Update' : 'Create'} Configuration
              </Button>
            </div>
          </form>
        </Tabs.Content>

        <!-- ================================================================ -->
        <!-- CONNECTIONS TAB                                                    -->
        <!-- ================================================================ -->
        <Tabs.Content value="connections" class="w-full h-full overflow-hidden">
          {#if data.integration}
            {#if expandedConnectionId && expandedConnection}
              <!-- ── CONNECTION DETAIL VIEW ── -->
              <div class="flex flex-col size-full gap-4 overflow-hidden">
                <!-- Detail header -->
                <div class="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground transition-colors"
                    onclick={() => (expandedConnectionId = null)}
                  >
                    <ArrowLeft class="h-4 w-4" />
                  </button>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-semibold truncate">{expandedConnection.name}</h3>
                    <p class="text-xs font-mono text-muted-foreground truncate">
                      {expandedConnection.external_id}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={savingMappings}
                    onclick={() => handleSaveMappings(expandedConnection.external_id)}
                  >
                    {#if savingMappings}
                      <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                    {/if}
                    Save Mappings
                  </Button>
                </div>

                {#if expandedDomains.length === 0}
                  <div
                    class="flex flex-col items-center justify-center flex-1 gap-2 text-center text-muted-foreground"
                  >
                    <CircleAlert class="h-8 w-8 opacity-40" />
                    <p class="text-sm font-medium">No domains cached</p>
                    <p class="text-xs">
                      Refresh connections after granting consent to load domains from this tenant.
                    </p>
                  </div>
                {:else}
                  <div class="flex-1 overflow-auto space-y-1">
                    <!-- Column headers -->
                    <div class="grid grid-cols-2 gap-2 px-2 pb-1 border-b">
                      <span
                        class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Domain
                      </span>
                      <span
                        class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                      >
                        Mapped Site
                      </span>
                    </div>

                    {#each expandedDomains as domain (domain)}
                      {@const isMapped =
                        !!domainAssignments[expandedConnection.external_id]?.[domain]}
                      <div
                        class="grid grid-cols-2 gap-2 items-center px-2 py-1.5 rounded hover:bg-muted/40"
                      >
                        <div class="flex items-center gap-1.5 min-w-0">
                          <span
                            class="text-sm font-mono truncate {isMapped
                              ? 'text-foreground'
                              : 'text-muted-foreground'}"
                          >
                            {domain}
                          </span>
                          {#if !isMapped}
                            <CircleAlert class="h-3 w-3 text-warning shrink-0" />
                          {/if}
                        </div>
                        <SingleSelect
                          placeholder="-- Unmapped --"
                          options={data.sites.map((s) => ({ value: s.id, label: s.name }))}
                          bind:selected={domainAssignments[expandedConnection.external_id][domain]}
                        />
                      </div>
                    {/each}

                    {#if unmappedCount > 0}
                      <div
                        class="mt-3 flex items-center gap-2 rounded-md bg-warning/10 text-warning px-3 py-2"
                      >
                        <CircleAlert class="h-4 w-4 shrink-0" />
                        <p class="text-xs">
                          {unmappedCount} unmapped domain{unmappedCount === 1 ? '' : 's'} — identities
                          from these domains will sync without a site assignment.
                        </p>
                      </div>
                    {/if}

                    <!-- Orphaned Identities section -->
                    <div class="mt-4 border-t pt-4 space-y-3">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                          <h4 class="text-sm font-medium">Orphaned Identities</h4>
                          {#if orphanedTotal > 0}
                            <Badge
                              class="bg-destructive/15 text-destructive border-destructive/30"
                              variant="outline"
                            >
                              {orphanedTotal}
                            </Badge>
                          {/if}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loadingOrphans}
                          onclick={() => handleLoadOrphans(0)}
                        >
                          {#if loadingOrphans}
                            <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                          {/if}
                          Load
                        </Button>
                      </div>

                      {#if orphanedEntities.length > 0}
                        <!-- Column headers -->
                        <div class="grid grid-cols-2 gap-2 px-2 pb-1 border-b">
                          <span
                            class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                          >
                            UPN / Display Name
                          </span>
                          <span
                            class="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                          >
                            Assign to Site
                          </span>
                        </div>

                        {#each orphanedEntities as entity (entity.id)}
                          <div
                            class="grid grid-cols-2 gap-2 items-center px-2 py-1 rounded hover:bg-muted/40"
                          >
                            <p class="text-xs font-mono truncate text-muted-foreground">
                              {entity.raw_data?.userPrincipalName ??
                                entity.display_name ??
                                entity.id}
                            </p>
                            <SingleSelect
                              placeholder="-- Assign Site --"
                              options={data.sites.map((s) => ({ value: s.id, label: s.name }))}
                              bind:selected={orphanAssignments[entity.id]}
                            />
                          </div>
                        {/each}

                        <div class="flex items-center justify-between pt-2">
                          {#if orphanedEntities.length < orphanedTotal}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={loadingOrphans}
                              onclick={() => handleLoadOrphans(orphanedEntities.length)}
                            >
                              {#if loadingOrphans}
                                <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                              {/if}
                              Load More ({orphanedTotal - orphanedEntities.length} remaining)
                            </Button>
                          {:else}
                            <span class="text-xs text-muted-foreground">
                              {orphanedEntities.length} of {orphanedTotal} loaded
                            </span>
                          {/if}
                          <Button
                            size="sm"
                            disabled={savingAssignments ||
                              Object.values(orphanAssignments).every((v) => !v)}
                            onclick={handleSaveAssignments}
                          >
                            {#if savingAssignments}
                              <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                            {/if}
                            Save Assignments
                          </Button>
                        </div>
                      {:else if !loadingOrphans}
                        <p class="text-xs text-muted-foreground px-2">
                          Click "Load" to fetch identities without a site assignment.
                        </p>
                      {/if}
                    </div>

                    <!-- Tenant Capabilities section -->
                    <div class="mt-4 border-t pt-4 space-y-3">
                      <div class="flex items-center justify-between">
                        <div>
                          <h4 class="text-sm font-medium">Tenant Capabilities</h4>
                          {#if (expandedConnection?.meta as any)?.capabilitiesCheckedAt}
                            <p class="text-xs text-muted-foreground">
                              Last checked {new Date(
                                (expandedConnection.meta as any).capabilitiesCheckedAt
                              ).toLocaleString()}
                            </p>
                          {/if}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={checkingCapabilities}
                          onclick={() => handleRefreshCapabilities(expandedConnection.external_id)}
                        >
                          {#if checkingCapabilities}
                            <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                          {/if}
                          Refresh Capabilities
                        </Button>
                      </div>

                      {#each Object.entries(MS_CAPABILITIES) as [key, capMeta] (key)}
                        {@const enabled =
                          (expandedConnection?.meta as any)?.capabilities?.[
                            key as MSCapabilityKey
                          ] ?? null}
                        <div class="flex items-start gap-2 px-2">
                          {#if enabled === true}
                            <CircleCheck class="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <span class="text-sm">{capMeta.label}</span>
                          {:else if enabled === false}
                            <CircleAlert class="h-4 w-4 text-warning mt-0.5 shrink-0" />
                            <div>
                              <span class="text-sm">{capMeta.label}</span>
                              <p class="text-xs text-muted-foreground">
                                Requires {capMeta.requiredLicense}
                              </p>
                            </div>
                          {:else}
                            <CircleAlert class="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <span class="text-sm text-muted-foreground"
                              >{capMeta.label} — not yet checked</span
                            >
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <!-- ── CONNECTION LIST VIEW ── -->
              <div class="flex flex-col size-full gap-3 overflow-hidden">
                <div class="flex flex-col gap-2 shrink-0">
                  <div class="flex items-center justify-between">
                    <div>
                      <h3 class="font-medium">GDAP Connections</h3>
                      <p class="text-sm text-muted-foreground">
                        Customer tenants via delegated admin relationships.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={refreshingConnections || !data.partnerTenantId}
                      onclick={handleRefreshConnections}
                    >
                      {#if refreshingConnections}
                        <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                      {/if}
                      {connections.length > 0 ? 'Refresh' : 'Load Connections'}
                    </Button>
                  </div>
                  <Input
                    bind:value={searchQuery}
                    placeholder="Search by name..."
                    class="h-8 text-sm"
                  />
                  <div class="flex gap-1 flex-wrap">
                    {#each [{ key: 'all', label: 'All' }, { key: 'needs-consent', label: 'Needs Consent' }, { key: 'active', label: 'Active' }, { key: 'has-unmapped', label: 'Has Unmapped' }, { key: 'has-orphans', label: 'Has Orphans' }] as chip}
                      <button
                        type="button"
                        class="px-2.5 py-1 text-xs rounded-full border transition-colors {activeFilter ===
                        chip.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'}"
                        onclick={() => (activeFilter = chip.key as typeof activeFilter)}
                      >
                        {chip.label}
                      </button>
                    {/each}
                  </div>
                </div>

                {#if !data.partnerTenantId}
                  <div
                    class="flex items-center gap-2 rounded-lg border bg-warning/10 text-warning p-3"
                  >
                    <CircleAlert class="h-4 w-4 shrink-0" />
                    <p class="text-sm">
                      Connect MSPByte to Microsoft first (Configuration tab) before loading GDAP
                      connections.
                    </p>
                  </div>
                {/if}

                <div class="flex flex-col gap-2 overflow-auto flex-1 pr-1">
                  {#if connections.length === 0}
                    <div
                      class="flex items-center justify-center h-32 text-muted-foreground text-sm"
                    >
                      No connections loaded — click "Load Connections" to discover GDAP customers.
                    </div>
                  {:else if filteredConnections.length === 0}
                    <div
                      class="flex items-center justify-center h-32 text-muted-foreground text-sm"
                    >
                      No connections match your search or filter.
                    </div>
                  {/if}

                  {#each filteredConnections as conn (conn.id)}
                    {@const isActive = conn.status === 'active'}
                    {@const domains = (conn.meta as any)?.domains ?? []}
                    {@const connUnmapped = getUnmappedCount(conn)}
                    {@const connOrphans = data.orphanCounts[conn.external_id] ?? 0}
                    {@const connCaps = (conn.meta as any)?.capabilities}
                    <div
                      class="flex items-center gap-3 border rounded-lg px-4 py-3 bg-card hover:bg-muted/30 transition-colors"
                    >
                      <!-- Shield status icon -->
                      {#if isActive}
                        <ShieldCheck class="h-5 w-5 text-primary shrink-0" />
                      {:else}
                        <ShieldAlert class="h-5 w-5 text-warning shrink-0" />
                      {/if}

                      <!-- Name + tenant ID -->
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold truncate">{conn.name}</p>
                        <p class="text-xs font-mono text-muted-foreground truncate">
                          {conn.external_id}
                        </p>
                      </div>

                      <!-- Domain count badge (active only) -->
                      {#if isActive && domains.length > 0}
                        <Badge
                          class="bg-primary/15 text-primary border-primary/30"
                          variant="outline"
                        >
                          {domains.length} domain{domains.length === 1 ? '' : 's'}
                        </Badge>
                      {/if}

                      <!-- Unmapped domains badge -->
                      {#if connUnmapped > 0}
                        <Badge
                          class="bg-warning/15 text-warning border-warning/30"
                          variant="outline"
                        >
                          {connUnmapped} unmapped
                        </Badge>
                      {/if}

                      <!-- Orphaned entities badge -->
                      {#if connOrphans > 0}
                        <Badge
                          class="bg-destructive/15 text-destructive border-destructive/30"
                          variant="outline"
                        >
                          {connOrphans} orphaned
                        </Badge>
                      {/if}

                      <!-- Capability warning badges -->
                      {#if connCaps}
                        {#each Object.entries(MS_CAPABILITIES) as [key, capMeta] (key)}
                          {#if connCaps[key as MSCapabilityKey] === false}
                            <Badge
                              class="bg-warning/15 text-warning border-warning/30"
                              variant="outline"
                            >
                              No {capMeta.label}
                            </Badge>
                          {/if}
                        {/each}
                      {/if}

                      <!-- Action button -->
                      {#if isActive}
                        <Button
                          size="sm"
                          variant="ghost"
                          class="text-muted-foreground hover:text-foreground"
                          onclick={() => handleGDAPConsent(conn.external_id)}
                        >
                          <RefreshCw class="h-3 w-3 mr-1" />
                          Reconsent
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onclick={() => expandConnection(conn.external_id)}
                        >
                          <Settings class="h-3 w-3 mr-1" />
                          Configure Mappings
                        </Button>
                      {:else}
                        <Button
                          size="sm"
                          variant="outline"
                          class="border-warning/30 text-warning hover:bg-warning/10"
                          onclick={() => handleGDAPConsent(conn.external_id)}
                        >
                          <ExternalLink class="h-3 w-3 mr-1" />
                          Grant Consent
                        </Button>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        </Tabs.Content>
      </div>
    </Tabs.Root>
  </div>
</div>
