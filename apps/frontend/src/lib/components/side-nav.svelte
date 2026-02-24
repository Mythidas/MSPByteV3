<script lang="ts">
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import * as HoverCard from '$lib/components/ui/hover-card/index.js';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import favicon from '$lib/assets/favicon.svg';
  import type { ModuleConfig, GlobalNavItem, GlobalNavGroup } from '$lib/config/modules';
  import { ChevronRight } from '@lucide/svelte';
  import { cn } from '$lib/utils/index';

  let {
    visibleModules,
    activeModule,
    activeSubNav,
    visibleGlobalItems,
    scopeQuery,
  }: {
    visibleModules: ModuleConfig[];
    activeModule: ModuleConfig | null;
    activeSubNav: ModuleConfig['navLinks'];
    visibleGlobalItems: GlobalNavItem[];
    scopeQuery: string;
  } = $props();

  const startsWith = (path: string) => page.url.pathname.startsWith(path);
</script>

<Sidebar.Root collapsible="none" class="border-r">
  <Sidebar.Header class="flex flex-row items-center gap-2 px-3 py-3">
    <img src={favicon} alt="MSPByte logo" class="size-6 shrink-0" />
    <span class="text-sm font-semibold tracking-tight">MSPByte</span>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Integrations</Sidebar.GroupLabel>
      <Sidebar.Menu>
        {#each visibleModules as mod}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              isActive={startsWith(mod.basePath)}
              onclick={() => goto(mod.navLinks[0].href + scopeQuery)}
              class="hover:cursor-pointer"
            >
              <mod.icon />
              {mod.label}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu>
    </Sidebar.Group>

    {#if activeSubNav.length > 0}
      <Sidebar.Separator />
      <Sidebar.Group>
        <Sidebar.GroupLabel>{activeModule?.label}</Sidebar.GroupLabel>
        <Sidebar.Menu>
          {#each activeSubNav as link}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton isActive={startsWith(link.href)}>
                {#snippet child({ props })}
                  <a href={link.href + scopeQuery} {...props}>{link.label}</a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.Group>
    {/if}
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Menu>
      {#each visibleGlobalItems as item}
        {#if item.kind === 'link'}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton isActive={startsWith(item.href)}>
              {#snippet child({ props })}
                <a href={item.href} {...props}>{item.label}</a>
              {/snippet}
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        {:else}
          {@const group = item as GlobalNavGroup}
          <HoverCard.Root openDelay={100} closeDelay={200}>
            <Sidebar.MenuItem>
              <HoverCard.Trigger>
                {#snippet child({ props })}
                  <Sidebar.MenuButton
                    isActive={group.children.some((c) => startsWith(c.href))}
                    {...props}
                    class="hover:cursor-pointer"
                  >
                    {group.label}
                    <ChevronRight class="ml-auto size-3 opacity-50" />
                  </Sidebar.MenuButton>
                {/snippet}
              </HoverCard.Trigger>
            </Sidebar.MenuItem>
            <HoverCard.Content side="right" align="end" class="w-44 p-1">
              {#each group.children as groupChild}
                <a
                  href={groupChild.href}
                  class={cn(
                    'flex rounded-md px-2 py-1.5 text-sm transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    startsWith(groupChild.href) && 'bg-accent/50 font-medium'
                  )}
                >
                  {groupChild.label}
                </a>
              {/each}
            </HoverCard.Content>
          </HoverCard.Root>
        {/if}
      {/each}
    </Sidebar.Menu>
  </Sidebar.Footer>
</Sidebar.Root>
