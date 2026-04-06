<script lang="ts">
  import { INTEGRATIONS } from '@workspace/shared/config/integrations/integrations';
  import IntegrationHeader from '../_helpers/integration-header.svelte';
  import SiteLinkingTable from '../_helpers/site-linking-table.svelte';
  import type { ExternalOption } from '../_helpers/site-linking-table.svelte';
  import type { PageProps } from './$types';
  import type { Tables } from '@workspace/shared/types/database';
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Card from '$lib/components/ui/card/index.js';
  import Button from '$lib/components/ui/button/button.svelte';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import { Settings, TriangleAlert } from '@lucide/svelte';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import PermissionGaurd from '$lib/components/auth/permission-gaurd.svelte';
  import ConfirmDialog from '$lib/components/fields/confirm-dialog.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { DattoRMMConfig } from '@workspace/shared/types/integrations/datto/index.js';

  const { data, form }: PageProps = $props();

  const integration = INTEGRATIONS['dattormm'];

  let dbIntegration = $state<Tables<'public', 'integrations'> | null>(null);
  let dbLinks = $state<Tables<'public', 'integration_links'>[]>([]);
  let dbSites = $state<Tables<'public', 'sites'>[]>([]);
  let loading = $state(true);
  let externalOptions = $state<ExternalOption[]>([]);
  let loadingExternal = $state(true);
  let configSheetOpen = $state(false);
  let testingConnection = $state(false);
  let savingConfig = $state(false);

  $effect(() => {
    const load = async () => {
      dbIntegration = (await data.getIntegration) ?? null;
      dbLinks = (await data.getLinks) ?? [];
      dbSites = (await data.getSites) ?? [];
      loading = false;
    };
    load();
  });

  $effect(() => {
    if (form?.error) {
      toast.error(`Action failed: ${form.error}`);
    } else if ((form as any)?.success && savingConfig === false) {
      toast.success('Settings saved successfully!');
      configSheetOpen = false;
    }
  });

  $effect(() => {
    data.getDattoSites.then((result) => {
      externalOptions = (result ?? []).map((d) => ({
        id: d.uid,
        name: d.name,
        meta: { siteName: d.name },
      }));
      loadingExternal = false;
    });
  });

  const existingConfig = $derived((dbIntegration?.config as DattoRMMConfig) ?? null);
</script>

<!-- Configuration Sheet -->
<PermissionGaurd permission="Integrations.Write">
  <Sheet.Root bind:open={configSheetOpen}>
    <Sheet.Portal>
      <Sheet.Overlay />
      <Sheet.Content side="right" class="w-105 flex flex-col gap-0 p-0">
        <Sheet.Header class="p-4 border-b">
          <Sheet.Title>Configure DattoRMM</Sheet.Title>
          <Sheet.Description>Enter your DattoRMM API credentials.</Sheet.Description>
        </Sheet.Header>

        <form
          id="datto-config-form"
          method="POST"
          action="?/save"
          class="flex flex-col flex-1 overflow-hidden"
          use:enhance={({ submitter }) => {
            const isTesting = submitter?.getAttribute('formaction') === '?/testConnection';
            if (isTesting) testingConnection = true;
            else savingConfig = true;

            return async ({ result, update }) => {
              if (isTesting) {
                testingConnection = false;
                if (result.type === 'failure') {
                  toast.error(`Connection test failed: ${(result.data as any)?.error}`);
                } else {
                  toast.success('Connection test successful!');
                }
              } else {
                savingConfig = false;
                await update();
              }
            };
          }}
        >
          <div class="flex flex-col p-4 flex-1 overflow-y-auto gap-4">
            <Card.Root class="bg-primary/5 border-primary/20">
              <Card.Header class="pb-2">
                <Card.Title class="text-base">API Credentials</Card.Title>
              </Card.Header>
              <Card.Content class="flex flex-col gap-3">
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium" for="datto-url">URL</label>
                  <input
                    id="datto-url"
                    name="url"
                    type="url"
                    placeholder="https://pinotage-api.centrastage.net"
                    class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    value={existingConfig?.url ?? ''}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium" for="datto-api-key">API Key</label>
                  <input
                    id="datto-api-key"
                    name="apiKey"
                    type="text"
                    placeholder="API Key"
                    class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    value={existingConfig?.apiKey ?? ''}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium" for="datto-api-secret">API Secret Key</label>
                  <input
                    id="datto-api-secret"
                    name="apiSecretKey"
                    type="password"
                    placeholder={existingConfig ? 'Leave blank to keep current' : 'API Secret Key'}
                    class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium" for="datto-var-name">Site Variable Name</label>
                  <input
                    id="datto-var-name"
                    name="siteVariableName"
                    type="text"
                    placeholder="MSPSiteCode"
                    class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    value={existingConfig?.siteVariableName ?? ''}
                  />
                </div>
                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium" for="datto-credential-expiration">
                    Credential Expiration
                    <span class="text-muted-foreground font-normal text-xs">(optional)</span>
                  </label>
                  <input
                    id="datto-credential-expiration"
                    name="credentialExpiration"
                    type="date"
                    class="w-full px-3 py-2 text-sm rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    value={dbIntegration?.credential_expiration?.split('T')[0] ?? ''}
                  />
                </div>
              </Card.Content>
            </Card.Root>

            <Button
              type="submit"
              formaction="?/testConnection"
              variant="outline"
              size="sm"
              disabled={testingConnection}
            >
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>

          <Sheet.Footer class="flex justify-between p-4 border-t gap-2">
            {#if !!dbIntegration}
              <ConfirmDialog
                title="Delete DattoRMM Integration?"
                description="This will remove the DattoRMM integration and all associated site mappings. This action can be undone within 30 days."
                confirmLabel="Delete Integration"
                destructive
              >
                {#snippet trigger(props)}
                  <Button variant="destructive" size="sm" {...props}>Delete Integration</Button>
                {/snippet}
                {#snippet confirmAction()}
                  <form method="POST" action="?/deleteIntegration">
                    <Button type="submit" variant="destructive" size="sm">Delete Integration</Button
                    >
                  </form>
                {/snippet}
              </ConfirmDialog>
            {:else}
              <div></div>
            {/if}
            <Button size="sm" type="submit" disabled={savingConfig}>
              {savingConfig ? 'Saving...' : 'Save'}
            </Button>
          </Sheet.Footer>
        </form>
      </Sheet.Content>
    </Sheet.Portal>
  </Sheet.Root>
</PermissionGaurd>

<!-- Main Layout -->
<div class="flex flex-col size-full p-4 gap-4 overflow-hidden">
  <div class="flex items-start justify-between shrink-0">
    <IntegrationHeader {integration} active={!!dbIntegration} {loading} />
    <PermissionGaurd permission="Integrations.Write">
      <Button variant="outline" size="sm" onclick={() => (configSheetOpen = true)} class="gap-2">
        <Settings class="size-4" />
        Configure
      </Button>
    </PermissionGaurd>
  </div>

  {#if !!dbIntegration}
    <SiteLinkingTable
      integrationId="dattormm"
      externalLabel="DattoRMM Site"
      {externalOptions}
      {loadingExternal}
      initialLinks={dbLinks}
      {dbSites}
      canWrite={authStore.isAllowed('Integrations.Write')}
      isConfigured={!!dbIntegration}
      {loading}
    />
  {:else if loading}
    <Loader />
  {:else}
    <FadeIn class="flex flex-col size-full justify-center items-center">
      <div
        class="flex items-center gap-3 px-4 py-3 w-fit rounded bg-warning/10 text-warning border border-warning/30"
      >
        <TriangleAlert class="size-4" />
        <span class="text-sm">
          DattoRMM is not configured yet. Click <strong>Configure</strong> to set up your credentials.
        </span>
      </div>
    </FadeIn>
  {/if}
</div>
