<script lang="ts">
  import '../layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher } from 'mode-watcher';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { ChevronDown } from '@lucide/svelte';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { page } from '$app/state';
  import { cn } from '$lib/utils/index';
  import { hasPermission, type Permission } from '$lib/utils/permissions';

  let { children, data } = $props();

  const startsWith = (path: string) => page.url.pathname.startsWith(path);

  type NavLink = { kind: 'link'; href: string; label: string; permission: Permission | null };
  type NavGroup = {
    kind: 'group';
    label: string;
    children: { href: string; label: string; permission: Permission }[];
  };
  type NavItem = NavLink | NavGroup;

  const navItems: NavItem[] = [
    { kind: 'link', href: '/', label: 'Home', permission: null },
    { kind: 'link', href: '/sites', label: 'Sites', permission: 'Sites.Read' },
    { kind: 'link', href: '/integrations', label: 'Integrations', permission: 'Integrations.Read' },
    { kind: 'link', href: '/reports/reconcilliation', label: 'Reports', permission: 'Reports.Read' },
    {
      kind: 'group',
      label: 'Admin',
      children: [
        { href: '/users', label: 'Users', permission: 'Users.Read' },
        { href: '/roles', label: 'Roles', permission: 'Roles.Read' },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === '/' ? page.url.pathname === '/' : startsWith(href);

  const isGroupActive = (group: NavGroup) =>
    group.children.some((child) => startsWith(child.href));

  let attributes = $derived((data.role?.attributes ?? null) as Record<string, unknown> | null);

  let visibleNavItems = $derived.by(() => {
    const result: NavItem[] = [];
    for (const item of navItems) {
      if (item.kind === 'link') {
        if (!item.permission || hasPermission(attributes, item.permission)) {
          result.push(item);
        }
      } else {
        const visibleChildren = item.children.filter((child) =>
          hasPermission(attributes, child.permission)
        );
        if (visibleChildren.length > 0) {
          result.push({ ...item, children: visibleChildren });
        }
      }
    }
    return result;
  });
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
    <nav class="flex items-center gap-1">
      {#each visibleNavItems as item}
        {#if item.kind === 'link'}
          <a
            href={item.href}
            class={cn(
              'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isActive(item.href) && 'bg-accent/50'
            )}
          >
            {item.label}
          </a>
        {:else}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class={cn(
                'inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                isGroupActive(item) && 'bg-accent/50'
              )}
            >
              {item.label}
              <ChevronDown class="size-3" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start">
              {#each item.children as child}
                <a href={child.href}>
                  <DropdownMenu.Item class={cn(startsWith(child.href) && 'bg-accent/50')}>
                    {child.label}
                  </DropdownMenu.Item>
                </a>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      {/each}
    </nav>
  </div>
  <div class="flex flex-1 min-h-0">
    {@render children()}
  </div>
</div>
