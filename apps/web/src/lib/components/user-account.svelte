<script lang="ts">
  import { authStore } from '$lib/stores/auth.svelte';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
  import { Power } from 'lucide-svelte';

  const initials = $derived(
    authStore.currentUser
      ? authStore.currentUser?.first_name[0] + authStore.currentUser?.last_name[0]
      : 'AA'
  );
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    <div
      class="flex rounded-full bg-primary items-center justify-center text-sm w-8 h-8 hover:cursor-pointer hover:bg-primary/70"
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
