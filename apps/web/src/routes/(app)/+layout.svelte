<script lang="ts">
  import { page } from '$app/state';
  import Separator from '$lib/components/ui/separator/separator.svelte';
  import UserAccount from '$lib/components/nav/user-account.svelte';
  import { authStore } from '$lib/stores/auth.svelte';
  import { cn } from '$lib/utils';
  import { type LayoutProps } from './$types';
  import { scopeStore } from '$lib/stores/scope.svelte';
  import IntegrationSelect from '$lib/components/nav/integration-select.svelte';
  import ScopeSelect from '$lib/components/nav/scope-select.svelte';
  import { buildRouteMap } from '$lib/config/routes';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { Aperture } from '@lucide/svelte';

  const { data, children }: LayoutProps = $props();
  const routeMap = buildRouteMap();
  const linkClass =
    'inline-flex items-center h-9 px-4 py-2 rounded-full text-sm font-medium transition-colors hover:cursor-pointer hover:bg-accent hover:text-accent-foreground';

  let openGroup = $state<string | null>(null);

  $effect(() => {
    authStore.currentUser = data.user;
    authStore.currentRole = data.role;
    authStore.currentTenant = data.tenant;
    scopeStore.activeIntegrations = data.activeIntegrations;
  });
</script>

{#snippet navLink({ href, label }: { href: string; label: string })}
  {@const active = page.url.pathname.startsWith(href)}
  <a {href} class={cn(linkClass, active && 'bg-primary/50')}>{label}</a>
{/snippet}

{#if openGroup !== null}
  <div class="fixed inset-0 z-10" onclick={() => (openGroup = null)} aria-hidden="true"></div>
{/if}

<div class="flex flex-col size-full">
  <div class="flex h-fit min-h-14 w-full items-center justify-between border-b">
    <div class="flex w-fit h-full gap-2 items-center p-2">
      <a href="/home"><Aperture class="w-8 h-8" /></a>
      <Separator orientation="vertical" />
      <IntegrationSelect />
      <ScopeSelect />
      <Separator orientation="vertical" />
      <div class="flex rounded-full p-1 bg-background/320 border gap-1">
        {@render navLink({ href: '/home', label: 'Home' })}
        {#each routeMap.entries() as [group, routes]}
          {#if group === 'top'}
            {#each routes as route}
              {@render navLink({ href: route.href, label: route.label })}
            {/each}
          {:else}
            {@const groupActive = routes.some((route) => page.url.pathname.startsWith(route.href))}
            <div class="relative z-20">
              <button
                class={cn(linkClass, 'gap-1', groupActive && 'bg-primary/50')}
                onclick={() => (openGroup = openGroup === group ? null : group)}
              >
                {group}
                <ChevronDown
                  class={cn('size-4 transition-transform', openGroup === group && 'rotate-180')}
                />
              </button>
              {#if openGroup === group}
                <div
                  class="absolute top-full left-0 mt-1 min-w-36 rounded-2xl border bg-background shadow-md flex flex-col p-1"
                >
                  {#each routes as route}
                    {@const active = page.url.pathname.startsWith(route.href)}
                    <a
                      href={route.href}
                      class={cn(linkClass, 'w-full', active && 'bg-primary/50')}
                      onclick={() => (openGroup = null)}
                    >
                      {route.label}
                    </a>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <div class="flex h-full px-2">
      <UserAccount />
    </div>
  </div>
  <div class="flex flex-col relative size-full overflow-hidden">
    {@render children()}
  </div>
</div>
