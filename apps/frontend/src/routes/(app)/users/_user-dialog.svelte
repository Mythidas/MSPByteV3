<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { ORM } from '@workspace/shared/lib/utils/orm';
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import { canActOnLevel, ROLE_LEVELS } from '$lib/utils/permissions';

  type User = Tables<'views', 'd_users_view'>;
  type RoleOption = { id: string; name: string; level: number; tenant_id: string | null };

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
    user?: User | null;
    roles: RoleOption[];
    currentUserLevel: number | null;
    onsuccess?: () => void;
  } = $props();

  let firstName = $state('');
  let lastName = $state('');
  let email = $state('');
  let roleId = $state('');
  let isSaving = $state(false);

  let assignableRoles = $derived(
    roles.filter((r) => canActOnLevel(currentUserLevel, r.level))
  );

  function getRoleLevelLabel(level: number): string {
    return ROLE_LEVELS.find((l) => l.value === level)?.label ?? `Level ${level}`;
  }

  $effect(() => {
    if (open) {
      if (mode === 'edit' && user) {
        firstName = user.first_name ?? '';
        lastName = user.last_name ?? '';
        email = user.email ?? '';
        roleId = user.role_id ?? '';
      } else {
        firstName = '';
        lastName = '';
        email = '';
        roleId = '';
      }
    }
  });

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim() || !roleId) return;

    isSaving = true;
    const toastId = toast.loading(mode === 'create' ? 'Creating user...' : 'Updating user...');

    try {
      if (mode === 'create') {
        if (!email.trim()) return;

        const formData = new FormData();
        formData.set('email', email.trim());
        formData.set('first_name', firstName.trim());
        formData.set('last_name', lastName.trim());
        formData.set('role_id', roleId);

        const res = await fetch('?/createUser', {
          method: 'POST',
          body: formData,
        });

        const result = await res.json();
        // SvelteKit action responses are wrapped in an array
        const data = result?.data?.[0] ?? result?.data ?? result;

        if (data?.error) throw new Error(data.error);
        toast.success('User created successfully', { id: toastId });
      } else if (user) {
        const orm = new ORM(supabase);
        const { error } = await orm.update('public', 'users', String(user.id), {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          role_id: roleId,
        });
        if (error) throw new Error(error.message);
        toast.success('User updated successfully', { id: toastId });
      }

      open = false;
      onsuccess?.();
    } catch (err) {
      console.error('Error saving user:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save user.', { id: toastId });
    } finally {
      isSaving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{mode === 'create' ? 'Invite User' : 'Edit User'}</Dialog.Title>
      <Dialog.Description>
        {mode === 'create'
          ? 'Create a new user account. They can sign in via Azure OAuth.'
          : 'Update user details and role assignment.'}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4 py-4">
      <div class="flex flex-col gap-2">
        <Label for="user-email">Email</Label>
        {#if mode === 'create'}
          <Input
            id="user-email"
            type="email"
            bind:value={email}
            placeholder="user@company.com"
          />
        {:else}
          <p class="text-sm text-muted-foreground px-3 py-2 border rounded-md bg-muted/30">
            {email}
          </p>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-2">
          <Label for="user-first-name">First Name</Label>
          <Input
            id="user-first-name"
            bind:value={firstName}
            placeholder="First name"
          />
        </div>
        <div class="flex flex-col gap-2">
          <Label for="user-last-name">Last Name</Label>
          <Input
            id="user-last-name"
            bind:value={lastName}
            placeholder="Last name"
          />
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <Label>Role</Label>
        <Select.Root type="single" bind:value={roleId}>
          <Select.Trigger class="w-full">
            {#snippet children()}
              {#if roleId}
                {@const selected = roles.find((r) => r.id === roleId)}
                {selected?.name ?? 'Select role'}
              {:else}
                Select role
              {/if}
            {/snippet}
          </Select.Trigger>
          <Select.Content>
            {#each assignableRoles as role}
              <Select.Item value={role.id} label={role.name}>
                <span class="flex items-center gap-2">
                  {role.name}
                  <span class="text-xs text-muted-foreground">
                    {getRoleLevelLabel(role.level)}
                  </span>
                </span>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button
        onclick={handleSave}
        disabled={!firstName.trim() || !lastName.trim() || !roleId || (mode === 'create' && !email.trim()) || isSaving}
      >
        {isSaving ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
