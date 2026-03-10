<script lang="ts">
  import { page } from '$app/state';
  import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
  import { navigationMenuTriggerStyle } from '$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte';
  import Separator from '$lib/components/ui/separator/separator.svelte';
  import UserAccount from '$lib/components/nav/user-account.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { cn } from '$lib/utils';
  import { type LayoutProps } from './$types';
  import { scopeStore } from '$lib/stores/scope.svelte';
  import IntegrationSelect from '$lib/components/nav/integration-select.svelte';
  import ScopeSelect from '$lib/components/nav/scope-select.svelte';

  const { data, children }: LayoutProps = $props();

  $effect(() => {
    authStore.currentUser = data.user;
    authStore.currentRole = data.role;
    authStore.currentTenant = data.tenant;
    scopeStore.activeIntegrations = data.activeIntegrations;
  });
</script>

{#snippet navLink({ href, label }: { href: string; label: string })}
  {@const active = page.url.pathname.startsWith(href)}
  <NavigationMenu.Item>
    <NavigationMenu.Link>
      {#snippet child()}
        <a {href} class={cn(navigationMenuTriggerStyle(), active && 'bg-primary/50')}>{label}</a>
      {/snippet}
    </NavigationMenu.Link>
  </NavigationMenu.Item>
{/snippet}

<div class="flex flex-col size-full">
  <div
    class="flex h-14 min-h-14 w-full px-2 items-center justify-between shadow border-b bg-background"
  >
    <div class="flex w-fit h-full gap-2 items-center">
      <span class="text-lg px-2">MSPByte</span>
      <Separator orientation="vertical" />
      <IntegrationSelect />
      <ScopeSelect />
      <Separator orientation="vertical" />
      <NavigationMenu.Root>
        <NavigationMenu.List>
          {@render navLink({ href: '/home', label: 'Home' })}
          {@render navLink({ href: '/sites', label: 'Sites' })}
          {@render navLink({ href: '/users', label: 'Users' })}
          {@render navLink({ href: '/roles', label: 'Roles' })}
          {@render navLink({ href: '/integrations', label: 'Integrations' })}
        </NavigationMenu.List>
      </NavigationMenu.Root>
    </div>
    <div class="flex px-2">
      <UserAccount />
    </div>
  </div>
  <div class="flex flex-col size-full overflow-hidden">
    {@render children()}
  </div>
</div>
