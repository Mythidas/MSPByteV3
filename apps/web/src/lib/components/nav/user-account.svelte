<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { Power, Sun, Moon } from 'lucide-svelte';
  import { toggleMode, mode } from 'mode-watcher';

  const initials = $derived(
    authStore.currentUser
      ? authStore.currentUser?.first_name[0] + authStore.currentUser?.last_name[0]
      : 'AA'
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    <div
      class="flex rounded-full bg-primary items-center justify-center w-8 h-8 text-sm hover:cursor-pointer hover:bg-primary/70"
    >
      {initials}
    </div>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content>
    <DropdownMenu.Group>
      <DropdownMenu.Label>
        {authStore.currentUser?.first_name}
        {authStore.currentUser?.last_name}
      </DropdownMenu.Label>
      <DropdownMenu.Item class="flex justify-between" onclick={toggleMode} closeOnSelect={false}>
        <div class="flex items-center gap-2">
          {#if mode.current === 'dark'}
            <Moon class="h-4 w-4" />
            Dark Mode
          {:else}
            <Sun class="h-4 w-4" />
            Light Mode
          {/if}
        </div>
      </DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item class="flex justify-between" onclick={authStore.logout}>
        Logout <Power class="h-5 w-5" />
      </DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Label class="text-muted-foreground">
        {authStore.currentTenant?.name}
      </DropdownMenu.Label>
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>
