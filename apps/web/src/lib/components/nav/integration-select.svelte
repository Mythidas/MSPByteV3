<script lang="ts">
  import SingleSelect from '$lib/components/single-select.svelte';
  import { scopeStore } from '$lib/stores/scope.svelte';
  import { INTEGRATIONS, type IntegrationId } from '@workspace/shared/config/integrations';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  const options = $derived(
    scopeStore.activeIntegrations.map((i) => {
      const integration = INTEGRATIONS[i];
      return { label: integration.name, value: i };
    })
  );

  $effect(() => {
    const urlPart = page.url.pathname.split('/')[1];

    if (!Object.keys(INTEGRATIONS).includes(urlPart)) {
      scopeStore.currentIntegration = null;
    } else {
      scopeStore.currentIntegration = urlPart as IntegrationId;
    }
  });
</script>

<div class="w-44">
  <SingleSelect
    placeholder="Select Integration"
    searchPlaceholder="Search Integrations"
    options={[
      { label: 'Microsoft 365', value: 'microsoft-365' },
      { label: 'MSPAgent', value: 'mspagent' },
    ]}
    bind:selected={scopeStore.currentIntegration as string | undefined}
    onchange={(v) => (v ? goto(`/${v}`) : goto('/home'))}
  />
</div>
