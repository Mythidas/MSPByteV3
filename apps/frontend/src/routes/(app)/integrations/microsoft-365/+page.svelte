<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { LoaderCircle, CircleAlert, CircleCheck, Trash2, ExternalLink } from '@lucide/svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import { toast } from 'svelte-sonner';
  import { isMaskedSecret } from '$lib/utils/forms';
  import { browser } from '$app/environment';
  import { deserialize } from '$app/forms';
  import type { PageProps } from './$types';
  import { microsoft365ConfigSchema } from './_forms';

  let { data }: PageProps = $props();

  // Track current mode independently so toggling is instant
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

  // Read initial tab from URL (consent callback redirects with ?tab=mappings)
  let currentTab = $state(
    browser
      ? (new URLSearchParams(window.location.search).get('tab') ?? 'configuration')
      : 'configuration'
  );

  // Partner mode state
  let connectingMSP = $state(false);
  let loadingGDAP = $state(false);
  let savingMappings = $state(false);
  let gdapTenants = $state<{ tenantId: string; displayName: string; domains: string[] }[]>([]);
  let gdapLoaded = $state(false);
  let gdapStatus = $state<Record<string, 'idle' | 'testing' | 'ok' | 'fail'>>({});

  // Domain → siteId assignments (initialized from saved config)
  // svelte-ignore state_referenced_locally
  let domainAssignments = $state<Record<string, string>>(
    Object.fromEntries((data.domainMappings ?? []).map((m: any) => [m.domain, m.siteId ?? '']))
  );

  // Sync mode toggle to form data
  function selectMode(mode: 'direct' | 'partner') {
    currentMode = mode;
    ($formData as any).mode = mode;
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

      const consentUrl = result.type === 'success' ? (result.data as string) : '';

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

  async function handleLoadGDAP() {
    loadingGDAP = true;
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
        toast.error(errMsg ?? 'Failed to load GDAP customers');
        return;
      }

      gdapTenants = (result.data as any)?.gdapTenants ?? [];
      gdapLoaded = true;

      // Pre-populate domain assignments from saved mappings for newly discovered domains
      for (const tenant of gdapTenants) {
        for (const domain of tenant.domains) {
          if (!(domain in domainAssignments)) {
            domainAssignments[domain] = '';
          }
        }
      }

      toast.success(`Found ${gdapTenants.length} GDAP customer tenant(s)`);
    } catch (err) {
      toast.error(`Failed: ${String(err)}`);
    } finally {
      loadingGDAP = false;
    }
  }

  async function testGDAPTenant(tenantId: string) {
    gdapStatus[tenantId] = 'testing';
    try {
      const body = new FormData();
      body.append('gdapTenantId', tenantId);
      const response = await fetch('?/testGDAPTenant', { method: 'POST', body });
      const result = deserialize(await response.text());
      gdapStatus[tenantId] = result.type === 'success' ? 'ok' : 'fail';
      if (result.type === 'failure') {
        toast.error((result.data as any)?.error ?? 'GDAP access test failed');
      }
    } catch (err) {
      gdapStatus[tenantId] = 'fail';
      toast.error(`Test failed: ${String(err)}`);
    }
  }

  async function handleSaveMappings() {
    savingMappings = true;
    try {
      // Group domains by site+tenant pair
      const linkMap = new Map<string, { siteId: string; gdapTenantId: string; domains: string[] }>();
      for (const [domain, siteId] of Object.entries(domainAssignments)) {
        if (!siteId) continue; // "Don't sync"
        const tenant = gdapTenants.find((t) => t.domains.includes(domain));
        if (!tenant) continue;
        const key = `${siteId}:${tenant.tenantId}`;
        if (!linkMap.has(key)) {
          linkMap.set(key, { siteId, gdapTenantId: tenant.tenantId, domains: [] });
        }
        linkMap.get(key)!.domains.push(domain);
      }

      const body = new FormData();
      body.append('siteLinks', JSON.stringify([...linkMap.values()]));

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
          <Tabs.Trigger value="mappings" disabled={!data.integration}>Mappings</Tabs.Trigger>
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
            <!-- Hidden mode field -->
            <input type="hidden" name="mode" value={currentMode} />

            {#if currentMode === 'direct'}
              <!-- Direct mode fields -->
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

                <!-- MSP tenant connection status -->
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
        <!-- MAPPINGS TAB                                                       -->
        <!-- ================================================================ -->
        <Tabs.Content value="mappings" class="w-full h-full overflow-hidden">
          {#if data.integration}
            {#if currentMode === 'partner'}
              <!-- Partner mode: GDAP domain-to-site mapping -->
              <div class="flex flex-col size-full gap-4 overflow-hidden">
                <div class="flex items-center justify-between shrink-0">
                  <div>
                    <h3 class="font-medium">GDAP Customer Mappings</h3>
                    <p class="text-sm text-muted-foreground">
                      Assign each customer domain to a MSPByte site for identity sync.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingGDAP || !data.partnerTenantId}
                    onclick={handleLoadGDAP}
                  >
                    {#if loadingGDAP}
                      <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                    {/if}
                    {gdapLoaded ? 'Refresh' : 'Load GDAP Customers'}
                  </Button>
                </div>

                {#if !data.partnerTenantId}
                  <div
                    class="flex items-center gap-2 rounded-lg border bg-warning/10 text-warning p-3"
                  >
                    <CircleAlert class="h-4 w-4 shrink-0" />
                    <p class="text-sm">
                      Connect MSPByte to Microsoft first (Configuration tab) before loading GDAP
                      customers.
                    </p>
                  </div>
                {/if}

                <div class="flex flex-col gap-3 overflow-auto flex-1 pr-1">
                  {#if gdapLoaded && gdapTenants.length === 0}
                    <div
                      class="flex items-center justify-center h-32 text-muted-foreground text-sm"
                    >
                      No active GDAP relationships found.
                    </div>
                  {/if}

                  {#if !gdapLoaded && Object.keys(domainAssignments).length > 0}
                    <!-- Show saved assignments before GDAP is loaded -->
                    <div class="border rounded-lg p-4 space-y-2">
                      <p class="text-sm font-medium text-muted-foreground">Saved assignments</p>
                      {#each Object.entries(domainAssignments) as [domain, siteId] (domain)}
                        {#if siteId}
                          <div class="flex items-center gap-2 text-sm">
                            <span class="font-mono text-xs">{domain}</span>
                            <span class="text-muted-foreground">→</span>
                            <span class="text-xs">
                              {data.sites.find((s) => s.id === siteId)?.name ?? siteId}
                            </span>
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}

                  {#each gdapTenants as tenant (tenant.tenantId)}
                    <div class="border rounded-lg p-4 space-y-3">
                      <!-- Header row -->
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="font-semibold text-sm">{tenant.displayName}</p>
                          <p class="text-xs font-mono text-muted-foreground truncate">
                            {tenant.tenantId}
                          </p>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            class="text-xs px-2 py-0.5 rounded border transition-colors
                              {gdapStatus[tenant.tenantId] === 'ok'
                                ? 'border-primary/30 bg-primary/10 text-primary'
                                : gdapStatus[tenant.tenantId] === 'fail'
                                  ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                  : 'border-border bg-background text-muted-foreground hover:text-foreground'}"
                            onclick={() => testGDAPTenant(tenant.tenantId)}
                            disabled={gdapStatus[tenant.tenantId] === 'testing'}
                          >
                            {#if gdapStatus[tenant.tenantId] === 'testing'}
                              Testing...
                            {:else if gdapStatus[tenant.tenantId] === 'ok'}
                              Connected
                            {:else if gdapStatus[tenant.tenantId] === 'fail'}
                              Failed
                            {:else}
                              Test Access
                            {/if}
                          </button>
                          <Badge class="bg-primary/15 text-primary border-primary/30" variant="outline">
                            {tenant.domains.length} domain{tenant.domains.length === 1 ? '' : 's'}
                          </Badge>
                        </div>
                      </div>

                      {#if tenant.domains.length === 0}
                        <div class="flex items-center gap-2 rounded-md bg-warning/10 text-warning px-3 py-2">
                          <CircleAlert class="h-4 w-4 shrink-0" />
                          <p class="text-xs">
                            No verified domains found — users from this tenant cannot be filtered by
                            site
                          </p>
                        </div>
                      {:else}
                        <div class="space-y-2">
                          {#each tenant.domains as domain (domain)}
                            <div class="flex items-center gap-2">
                              <span
                                class="text-sm font-mono flex-1 truncate {domainAssignments[domain]
                                  ? 'text-foreground'
                                  : 'text-muted-foreground'}"
                              >
                                {domain}
                              </span>
                              <select
                                class="text-sm border rounded px-2 py-1 bg-background text-foreground min-w-48"
                                bind:value={domainAssignments[domain]}
                              >
                                <option value="">Don't sync</option>
                                {#each data.sites as site (site.id)}
                                  <option value={site.id}>{site.name}</option>
                                {/each}
                              </select>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>

                {#if gdapLoaded}
                  <div class="shrink-0 pt-2 border-t flex justify-end">
                    <Button size="sm" disabled={savingMappings} onclick={handleSaveMappings}>
                      {#if savingMappings}
                        <LoaderCircle class="h-3 w-3 mr-1 animate-spin" />
                      {/if}
                      Save Mappings
                    </Button>
                  </div>
                {/if}
              </div>
            {:else}
              <!-- Direct mode: standard domain-based mapper -->
              <div
                class="flex flex-col items-center justify-center h-full gap-2 text-center text-muted-foreground"
              >
                <p class="text-sm">
                  Direct mode uses domain mappings configured in the integration config.
                </p>
                <p class="text-xs">
                  Site-to-tenant mappings are created automatically based on user principal name
                  domains.
                </p>
              </div>
            {/if}
          {/if}
        </Tabs.Content>
      </div>
    </Tabs.Root>
  </div>
</div>
