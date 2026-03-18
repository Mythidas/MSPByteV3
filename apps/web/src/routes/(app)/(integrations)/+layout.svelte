<script lang="ts">
  import Button from '$lib/components/ui/button/button.svelte';
  import { scopeStore } from '$lib/stores/scope.svelte';
  import { cn } from '$lib/utils';
  import { INTEGRATIONS } from '@workspace/core/config/integrations';
  import { page } from '$app/state';
  import Separator from '$lib/components/ui/separator/separator.svelte';
  import Loader from '$lib/components/transition/loader.svelte';
  import FadeIn from '$lib/components/transition/fade-in.svelte';

  const { children } = $props();
  const integration = $derived(INTEGRATIONS[scopeStore.currentIntegration!]);
  const globalLinks = $derived(integration.navigation.filter((n) => n.isNullable));
  const scopedLinks = $derived(integration.navigation.filter((n) => !n.isNullable));
  const currentScope = $derived(
    integration?.scope === 'link' ? scopeStore.currentLink : scopeStore.currentSite
  );
</script>

{#if !integration}
  <Loader />
{:else}
  <FadeIn class="flex size-full overflow-hidden">
    <div class="flex h-full min-w-48 justify-center py-4 pl-4">
      <div class="flex flex-col gap-1 bg-card/80 rounded shadow w-full p-2">
        <Button
          class={cn('justify-start', page.url.pathname === `/${integration.id}` && 'bg-primary/50')}
          variant="ghost"
          href={`/${integration.id}`}>Overview</Button
        >
        <Button
          class={cn('justify-start', page.url.pathname.includes('/alerts') && 'bg-primary/50')}
          variant="ghost"
          href={`/${integration.id}/alerts`}>Alerts</Button
        >
        {#each globalLinks as navigation}
          {@const active = page.url.pathname.includes(navigation.route)}
          <Button
            class={cn('justify-start', active && 'bg-primary/50')}
            variant="ghost"
            href={`/${integration.id}${navigation.route}`}
          >
            {navigation.label}
          </Button>
        {/each}
        {#if scopedLinks.length}
          <Separator />
          {#each scopedLinks as navigation}
            {@const active = page.url.pathname.includes(navigation.route)}
            <Button
              class={cn('justify-start', active && 'bg-primary/50')}
              variant="ghost"
              href={`/${integration.id}${navigation.route}`}
              disabled={!currentScope}
            >
              {navigation.label}
            </Button>
          {/each}
        {/if}
      </div>
    </div>
    <div class="flex flex-col size-full p-4 overflow-hidden">
      {@render children()}
    </div>
  </FadeIn>
{/if}
