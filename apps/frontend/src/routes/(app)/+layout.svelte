<script lang="ts">
  import '../layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher } from 'mode-watcher';
  import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { page } from '$app/state';
  import { cn } from '$lib/utils/index';
  import { hasPermission, hasAnyPermission, type Permission } from '$lib/utils/permissions';

  let { children, data } = $props();

  const startsWith = (path: string) => page.url.pathname.startsWith(path);

  const mainNavItems: { href: string; label: string; permission: Permission | null }[] = [
    { href: '/', label: 'Home', permission: null },
    { href: '/sites', label: 'Sites', permission: 'Sites.Read' },
    { href: '/integrations', label: 'Integrations', permission: 'Integrations.Read' },
    { href: '/reports/reconcilliation', label: 'Reports', permission: 'Reports.Read' },
  ];

  const adminNavItems: { href: string; label: string; permission: Permission }[] = [
    { href: '/users', label: 'Users', permission: 'Users.Read' },
    { href: '/roles', label: 'Roles', permission: 'Roles.Read' },
  ];

  let attributes = $derived((data.role?.attributes ?? null) as Record<string, unknown> | null);

  let visibleMainItems = $derived(
    mainNavItems.filter((item) => !item.permission || hasPermission(attributes, item.permission))
  );

  let showAdminDropdown = $derived(
    hasAnyPermission(attributes, ['Users.Read', 'Roles.Read'])
  );

  let visibleAdminItems = $derived(
    adminNavItems.filter((item) => hasPermission(attributes, item.permission))
  );

  let isAdminActive = $derived(startsWith('/users') || startsWith('/roles'));
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher defaultMode="system" />
<Toaster />
<div class="flex flex-col relative w-screen h-screen overflow-clip">
  <div class="absolute inset-0 -z-10">
    <svg class="size-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" class="fill-foreground/12"></circle>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid)"></rect>
    </svg>
  </div>
  <div class="flex w-full h-fit p-2 bg-background shadow">
    <NavigationMenu.Root>
      <NavigationMenu.List>
        {#each visibleMainItems as item}
          <NavigationMenu.Item>
            <NavigationMenu.Link
              href={item.href}
              class={cn(
                item.href === '/'
                  ? page.url.pathname === '/' && 'bg-accent/50'
                  : startsWith(item.href) && 'bg-accent/50'
              )}
            >
              {item.label}
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        {/each}
        {#if showAdminDropdown}
          <NavigationMenu.Item>
            <NavigationMenu.Trigger class={cn(isAdminActive && 'bg-accent/50')}>
              Admin
            </NavigationMenu.Trigger>
            <NavigationMenu.Content>
              <ul class="flex flex-col gap-1 p-1 w-48">
                {#each visibleAdminItems as item}
                  <li>
                    <NavigationMenu.Link
                      href={item.href}
                      class={cn(
                        'w-full justify-start',
                        startsWith(item.href) && 'bg-accent/50'
                      )}
                    >
                      {item.label}
                    </NavigationMenu.Link>
                  </li>
                {/each}
              </ul>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        {/if}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  </div>
  <div class="flex flex-1 min-h-0">
    {@render children()}
  </div>
</div>
