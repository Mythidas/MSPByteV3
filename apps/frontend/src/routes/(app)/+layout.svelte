<script lang="ts">
  import '../layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher } from 'mode-watcher';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { ChevronDown } from '@lucide/svelte';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { page } from '$app/state';
  import { cn } from '$lib/utils/index';
  import { hasPermission } from '$lib/utils/permissions';
  import {
    MODULES,
    GLOBAL_NAV_ITEMS,
    type GlobalNavGroup,
    type GlobalNavItem,
  } from '$lib/config/modules';
  import SitePicker from '$lib/components/site-picker.svelte';

  let { children, data } = $props();

  let attributes = $derived((data.role?.attributes ?? null) as Record<string, unknown> | null);

  let visibleModules = $derived(
    MODULES.filter((m) => !m.permission || hasPermission(attributes, m.permission))
  );

  let activeModule = $derived(
    visibleModules.find((m) => page.url.pathname.startsWith(m.basePath)) ?? null
  );

  let activeSubNav = $derived(
    activeModule?.navLinks.filter(
      (link) => !link.permission || hasPermission(attributes, link.permission)
    ) ?? []
  );

  let visibleGlobalItems = $derived.by(() => {
    const result: GlobalNavItem[] = [];
    for (const item of GLOBAL_NAV_ITEMS) {
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

  let scope = $derived(page.url.searchParams.get('scope'));
  let scopeId = $derived(page.url.searchParams.get('scopeId'));
  let scopeQuery = $derived(scope && scopeId ? `?scope=${scope}&scopeId=${scopeId}` : '');

  const startsWith = (path: string) => page.url.pathname.startsWith(path);

  const isGlobalActive = (href: string) => startsWith(href);

  const isGroupActive = (group: GlobalNavGroup) =>
    group.children.some((child) => startsWith(child.href));
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
    <nav class="flex items-center gap-1 w-full">
      <!-- Module pills -->
      {#each visibleModules as mod}
        <a
          href={mod.navLinks[0].href + scopeQuery}
          class={cn(
            'inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors',
            activeModule?.id === mod.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          {mod.label}
        </a>
      {/each}

      <!-- Separator between pills and sub-nav -->
      {#if visibleModules.length > 0 && activeSubNav.length > 0}
        <div class="mx-1 h-5 w-px bg-border"></div>
      {/if}

      <!-- Active module sub-nav -->
      {#each activeSubNav as link}
        <a
          href={link.href + scopeQuery}
          class={cn(
            'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            page.url.pathname.startsWith(link.href) && 'bg-accent/50'
          )}
        >
          {link.label}
        </a>
      {/each}

      <!-- Site picker -->
      {#if activeModule && data.sites.length > 0}
        <div class="mx-1 h-5 w-px bg-border"></div>
        <SitePicker sites={data.sites} groups={data.groups} />
      {/if}

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Global nav items (right side) -->
      {#each visibleGlobalItems as item}
        {#if item.kind === 'link'}
          <a
            href={item.href}
            class={cn(
              'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              isGlobalActive(item.href) && 'bg-accent/50'
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
            <DropdownMenu.Content align="end">
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
