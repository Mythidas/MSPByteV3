<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase.js';
  import { canActOnLevel } from '$lib/utils/permissions';

  type RoleOption = { id: string; name: string; level: number | null; tenant_id: string | null };
  type UserRow = {
    id: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    role_id: string | null;
  };

  let {
    open = $bindable(false),
    mode,
    user = null,
    roles,
    currentUserLevel,
    onsuccess,
  }: {
    open: boolean;
    mode: 'create' | 'edit';
    user?: UserRow | null;
    roles: RoleOption[];
    currentUserLevel: number | null;
    onsuccess?: () => void;
  } = $props();

  let email = $state('');
  let first_name = $state('');
  let last_name = $state('');
  let role_id = $state('');
  let loading = $state(false);

  const availableRoles = $derived(roles.filter((r) => canActOnLevel(currentUserLevel, r.level)));

  const selectedRoleLabel = $derived(
    availableRoles.find((r) => r.id === role_id)?.name ?? 'Select role...'
  );

  $effect(() => {
    if (open) {
      if (mode === 'edit' && user) {
        email = user.email ?? '';
        first_name = user.first_name ?? '';
        last_name = user.last_name ?? '';
        role_id = user.role_id ?? '';
      } else {
        email = '';
        first_name = '';
        last_name = '';
        role_id = '';
      }
    }
  });

  async function handleSubmit() {
    if (!first_name || !last_name || !role_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (mode === 'create' && !email) {
      toast.error('Email is required');
      return;
    }

    loading = true;

    if (mode === 'create') {
      const formData = new FormData();
      formData.set('email', email);
      formData.set('first_name', first_name);
      formData.set('last_name', last_name);
      formData.set('role_id', role_id);

      const res = await fetch('?/createUser', { method: 'POST', body: formData });

      if (res.ok) {
        toast.success('User created');
        open = false;
        onsuccess?.();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.data?.message ?? 'Failed to create user');
      }
    } else if (mode === 'edit' && user?.id) {
      const { error } = await supabase
        .from('users')
        .update({ first_name, last_name, role_id })
        .eq('id', user.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('User updated');
        open = false;
        onsuccess?.();
      }
    }

    loading = false;
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-md flex flex-col overflow-y-hidden max-h-screen">
    <Sheet.Header>
      <Sheet.Title>{mode === 'create' ? 'Create User' : 'Edit User'}</Sheet.Title>
      <Sheet.Description>
        {mode === 'create' ? 'Add a new user to your organization.' : 'Update user details.'}
      </Sheet.Description>
    </Sheet.Header>

    <div class="flex flex-col gap-4 px-4 py-4 flex-1 overflow-y-auto">
      {#if mode === 'create'}
        <div class="flex flex-col gap-2">
          <Label for="email">Email</Label>
          <Input id="email" type="email" bind:value={email} placeholder="user@example.com" />
        </div>
      {/if}

      <div class="flex flex-col gap-2">
        <Label for="first_name">First Name</Label>
        <Input id="first_name" bind:value={first_name} placeholder="First name" />
      </div>

      <div class="flex flex-col gap-2">
        <Label for="last_name">Last Name</Label>
        <Input id="last_name" bind:value={last_name} placeholder="Last name" />
      </div>

      <div class="flex flex-col gap-2">
        <Label>Role</Label>
        <Select.Root type="single" bind:value={role_id}>
          <Select.Trigger class="w-full">
            {selectedRoleLabel}
          </Select.Trigger>
          <Select.Content>
            {#each availableRoles as role}
              <Select.Item value={role.id} label={role.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <Sheet.Footer class="px-4 pb-4">
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={handleSubmit} disabled={loading}>
        {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
