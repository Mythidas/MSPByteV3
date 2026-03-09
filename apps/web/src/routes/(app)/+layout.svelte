<script>
  import * as NavigationMenu from "$lib/components/ui/navigation-menu/index.js";
  import { navigationMenuTriggerStyle } from "$lib/components/ui/navigation-menu/navigation-menu-trigger.svelte";
  import Separator from "$lib/components/ui/separator/separator.svelte";
    import UserAccount from "$lib/components/user-account.svelte";

  const { children } = $props();
</script>

<div class="flex flex-col size-full">
  <div class="flex h-14 w-full px-2 items-center justify-between shadow border-b bg-background">
    <div class="flex w-fit h-full gap-2 items-center">
      <span class="text-lg px-2">MSPByte</span>
      <Separator orientation="vertical" />
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Link>
              {#snippet child()}
                <a href="/sites" class={navigationMenuTriggerStyle()}>Sites</a>
              {/snippet}
            </NavigationMenu.Link>
          </NavigationMenu.Item>
          <NavigationMenu.Item>
            <NavigationMenu.Link>
              {#snippet child()}
                <a href="/users" class={navigationMenuTriggerStyle()}>Users</a>
              {/snippet}
            </NavigationMenu.Link>
          </NavigationMenu.Item>
          <NavigationMenu.Item>
            <NavigationMenu.Link>
              {#snippet child()}
                <a href="/roles" class={navigationMenuTriggerStyle()}>Roles</a>
              {/snippet}
            </NavigationMenu.Link>
          </NavigationMenu.Item>
          <NavigationMenu.Item>
            <NavigationMenu.Link>
              {#snippet child()}
                <a href="/integrations" class={navigationMenuTriggerStyle()}>Integrations</a>
              {/snippet}
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    </div>
    <div class="flex px-2">
      <UserAccount />
    </div>
  </div>
  <div class="flex flex-col size-full">
    {@render children()}
  </div>
</div>