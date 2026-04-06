<script lang="ts">
  import SingleSelect from '$lib/components/single-select.svelte';
  import { scopeStore } from '$lib/stores/scope.svelte';
  import { INTEGRATIONS } from '@workspace/shared/config/integrations/integrations';
  import type { IntegrationId } from '@workspace/shared/types/integrations';
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

      const { data: links } = await supabase
        .from('integration_links')
        .select('id,name,external_id,site_id')
        .eq('tenant_id', authStore.currentTenant?.id ?? '')
        .eq('integration_id', scopeStore.currentIntegration as string)
        .eq('status', 'active')
        .order('name');

      options =
        links?.map((l) => ({
          label: l.name ?? l.external_id ?? 'unknown',
          value: currentScope === 'link' ? l.id : (l.site_id ?? ''),
        })) ?? [];

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
