<script lang="ts">
  import '../layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher } from 'mode-watcher';
  import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { page } from '$app/state';
  import { cn } from '$lib/utils/index';
  import { hasPermission, type Permission } from '$lib/utils/permissions';

  let { children, data } = $props();

  const startsWith = (path: string) => page.url.pathname.startsWith(path);

  const navItems: { href: string; label: string; permission: Permission | null }[] = [
    { href: '/', label: 'Home', permission: null },
    { href: '/sites', label: 'Sites', permission: 'Sites.Read' },
    { href: '/integrations', label: 'Integrations', permission: 'Integrations.Read' },
    { href: '/reports/reconcilliation', label: 'Reports', permission: 'Reports.Read' },
  ];

  let attributes = $derived((data.role?.attributes ?? null) as Record<string, unknown> | null);

  let visibleNavItems = $derived(
    navItems.filter((item) => !item.permission || hasPermission(attributes, item.permission))
  );
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
        {#each visibleNavItems as item}
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
      </NavigationMenu.List>
    </NavigationMenu.Root>
  </div>
  <div class="flex flex-1 min-h-0">
    {@render children()}
  </div>
</div>
