<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import * as Tabs from '$lib/components/ui/tabs/index.js';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Loader2, AlertCircle, Trash2 } from 'lucide-svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import { toast } from 'svelte-sonner';
  import { isMaskedSecret } from '$lib/utils/forms';
  import type { PageProps } from './$types';
  import { dattoConfigSchema } from './_forms';
  import Mapper from '../_mapper.svelte';

  let { data }: PageProps = $props();

  // svelte-ignore state_referenced_locally
  const form = superForm(data.form, {
    validators: zod4Client(dattoConfigSchema),
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
  const isSecretMasked = $derived(isMaskedSecret($formData.apiSecretKey));
  let currentTab = $state('configuration');

  async function handleDelete() {
    if (
      !confirm('Are you sure you want to delete this integration? This action cannot be undone.')
    ) {
      return;
    }

    const response = await fetch('?/delete', {
      method: 'POST',
    });

    if (response.ok) {
      toast.success('Integration deleted successfully');
      window.location.reload();
    } else {
      toast.error('Failed to delete integration');
    }
  }

  const getMappingData = async () => {
    const tenants = await data.tenants;
    const links = await data.siteLinks;

    if (tenants.error) {
      throw tenants.error;
    }

    return { tenants: tenants.data, links: links.data };
  };
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
          <Breadcrumb.Page>DattoRMM</Breadcrumb.Page>
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
        <Tabs.Content value="configuration" class="w-full h-full overflow-hidden space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">DattoRMM Configuration</h2>
              <p class="text-sm text-muted-foreground">
                Configure your DattoRMM integration credentials
              </p>
            </div>
            {#if data.integration}
              <Button variant="destructive" size="sm" onclick={handleDelete} disabled={$submitting}>
                <Trash2 class="h-4 w-4 mr-2" />
                Delete
              </Button>
            {/if}
          </div>

          <form method="POST" action="?/save" class="space-y-6" use:enhance>
            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="url">
                  Server URL
                  <span class="text-destructive">*</span>
                </Label>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  placeholder="https://zinfandel-api.centrastage.net"
                  bind:value={$formData.url}
                  aria-invalid={$errors.url ? 'true' : undefined}
                  class={$errors.url ? 'border-destructive' : ''}
                />
                {#if $errors.url}
                  <p class="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle class="h-3 w-3" />
                    {$errors.url}
                  </p>
                {/if}
              </div>

              <div class="space-y-2">
                <Label for="apiKey">
                  APIKey
                  <span class="text-destructive">*</span>
                </Label>
                <Input
                  id="apiKey"
                  name="apiKey"
                  type="text"
                  placeholder="your-username"
                  bind:value={$formData.apiKey}
                  aria-invalid={$errors.apiKey ? 'true' : undefined}
                  class={$errors.apiKey ? 'border-destructive' : ''}
                />
                {#if $errors.apiKey}
                  <p class="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle class="h-3 w-3" />
                    {$errors.apiKey}
                  </p>
                {/if}
              </div>

              <div class="space-y-2">
                <Label for="APISecretKey">
                  Secret
                  <span class="text-destructive">*</span>
                </Label>
                <Input
                  id="apiSecretKey"
                  name="apiSecretKey"
                  type="password"
                  placeholder={data.integration
                    ? 'Leave unchanged to keep existing'
                    : 'your-secret'}
                  bind:value={$formData.apiSecretKey}
                  aria-invalid={$errors.apiSecretKey ? 'true' : undefined}
                  class={$errors.apiSecretKey ? 'border-destructive' : ''}
                />
                {#if $errors.apiSecretKey}
                  <p class="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle class="h-3 w-3" />
                    {$errors.apiSecretKey}
                  </p>
                {/if}
                {#if data.integration && isSecretMasked}
                  <p class="text-xs text-muted-foreground">
                    Secret is currently saved. Modify to update.
                  </p>
                {/if}
              </div>
            </div>

            <div class="flex gap-2 justify-end pt-4 border-t">
              <Button
                type="submit"
                formaction="?/testConnection"
                variant="outline"
                disabled={$submitting}
              >
                {#if $delayed && $submitting}
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                {/if}
                Test Connection
              </Button>
              <Button type="submit" disabled={$submitting}>
                {#if $delayed && $submitting}
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                {/if}
                {data.integration ? 'Update' : 'Create'} Configuration
              </Button>
            </div>
          </form>
        </Tabs.Content>

        <Tabs.Content value="mappings" class="w-full h-full overflow-hidden">
          {#if data.integration}
            {#await getMappingData()}
              <div class="flex items-center justify-center h-full">
                <Loader2 class="h-8 w-8 animate-spin" />
              </div>
            {:then mappingData}
              <Mapper
                id="dattormm"
                tenantId={data.user?.tenant_id || ''}
                sites={data.sites}
                tenants={mappingData.tenants}
                links={mappingData.links}
              />
            {:catch error}
              <p class="text-destructive">Failed to load tenants: {error.message}</p>
            {/await}
          {/if}
        </Tabs.Content>
      </div>
    </Tabs.Root>
  </div>
</div>
