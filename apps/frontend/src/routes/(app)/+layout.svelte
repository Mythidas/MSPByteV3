<script lang="ts">
  import '../layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner/index.js';
  import { page } from '$app/state';
  import { hasPermission } from '$lib/utils/permissions';
  import { MODULES, GLOBAL_NAV_ITEMS, type GlobalNavItem } from '$lib/config/modules';
  import SitePicker from '$lib/components/site-picker.svelte';
  import SideNav from '$lib/components/side-nav.svelte';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';

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

  let activePage = $derived(
    activeSubNav.find((link) => page.url.pathname.startsWith(link.href)) ?? null
  );

  let showScopePicker = $derived(
    activeModule !== null &&
      (() => {
        const pickerTypes = activeModule!.pickerTypes ?? ['site', 'group', 'parent'];
        return pickerTypes.includes('connection')
          ? data.connections.length > 0
          : data.sites.length > 0;
      })()
  );
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher defaultMode="system" />
<Toaster />

<Sidebar.Provider style="--sidebar-width: 13rem;">
  <div class="relative flex w-screen h-screen overflow-clip">
    <!-- Dot-grid background -->
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

    <!-- Side nav -->
    <SideNav {visibleModules} {activeModule} {activeSubNav} {visibleGlobalItems} {scopeQuery} />

    <!-- Main content -->
    <Sidebar.Inset class="flex flex-col min-h-0 overflow-hidden bg-background/0!">
      <!-- Header bar: breadcrumb + scope picker -->
      <header
        class="flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background/80 backdrop-blur-sm px-4"
      >
        <Breadcrumb.Root>
          <Breadcrumb.List>
            {#if activeModule}
              <Breadcrumb.Item>
                <Breadcrumb.Link href={activeModule.navLinks[0].href + scopeQuery}>
                  {activeModule.label}
                </Breadcrumb.Link>
              </Breadcrumb.Item>
              {#if activePage}
                <Breadcrumb.Separator />
                <Breadcrumb.Item>
                  <Breadcrumb.Page>{activePage.label}</Breadcrumb.Page>
                </Breadcrumb.Item>
              {/if}
            {:else}
              <Breadcrumb.Item><Breadcrumb.Page>MSPByte</Breadcrumb.Page></Breadcrumb.Item>
            {/if}
          </Breadcrumb.List>
        </Breadcrumb.Root>

        <div class="flex items-center gap-2">
          {#if showScopePicker}
            {@const pickerTypes = activeModule!.pickerTypes ?? ['site', 'group', 'parent']}
            <SitePicker
              sites={data.sites}
              groups={data.groups}
              connections={data.connections}
              {pickerTypes}
            />
          {/if}
        </div>
      </header>

      <!-- Scrollable content -->
      <div class="flex flex-1 min-h-0 overflow-auto">
        {@render children()}
      </div>
    </Sidebar.Inset>
  </div>
</Sidebar.Provider>
