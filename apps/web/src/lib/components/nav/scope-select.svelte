<script lang="ts">
  import SingleSelect from '$lib/components/single-select.svelte';
  import { scopeStore } from '$lib/stores/scope.svelte';
  import { INTEGRATIONS, type IntegrationId } from '@workspace/core/config/integrations';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import FadeIn from '$lib/components/transition/fade-in.svelte';

  const currentScope = $derived(
    scopeStore.currentIntegration
      ? INTEGRATIONS[scopeStore.currentIntegration as IntegrationId].scope
      : null
  );

  let previous = $state<string | null>(null);
  let loading = $state(false);
  let options = $state<{ label: string; value: string }[]>([]);

  $effect(() => {
    const load = async () => {
      if (previous === currentScope && options.length > 0) return;
      previous = currentScope;

      loading = true;

      if (currentScope === 'site') {
        const { data: sites } = await supabase
          .from('sites')
          .select('id,name')
          .eq('tenant_id', authStore.currentTenant?.id ?? '')
          .order('name');

        options = sites?.map((s) => ({ label: s.name, value: s.id })) ?? [];
      } else if (currentScope === 'link') {
        const { data: links } = await supabase
          .from('integration_links')
          .select('id,name,external_id')
          .eq('tenant_id', authStore.currentTenant?.id ?? '')
          .eq('integration_id', scopeStore.currentIntegration as string)
          .eq('status', 'active')
          .is('site_id', null)
          .order('name');

        options = links?.map((l) => ({ label: l.name ?? l.external_id, value: l.id })) ?? [];
      }

      loading = false;
    };

    load();
  });
</script>

{#if !currentScope}
  <FadeIn class="w-44">
    <SingleSelect placeholder="Select Scope..." options={[]} disabled />
  </FadeIn>
{:else if currentScope && currentScope === 'site'}
  <FadeIn class="w-44">
    <SingleSelect
      placeholder="Select Site..."
      searchPlaceholder="Select Site"
      {options}
      bind:selected={scopeStore.currentSite as string | undefined}
      disabled={loading}
    />
  </FadeIn>
{:else if currentScope && currentScope === 'link'}
  <FadeIn class="w-44">
    <SingleSelect
      placeholder="Select Tenant..."
      searchPlaceholder="Select Tenant"
      {options}
      bind:selected={scopeStore.currentLink as string | undefined}
      disabled={loading}
    />
  </FadeIn>
{/if}
