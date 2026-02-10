<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import { Switch } from '$lib/components/ui/switch/index.js';
  import type { Tables } from '@workspace/shared/types/database';
  import { ORM } from '@workspace/shared/lib/utils/orm';
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import { PERMISSION_CATEGORIES, type Permission } from '$lib/utils/permissions';

  type Role = Tables<'public', 'roles'>;

  let {
    open = $bindable(false),
    mode,
    role = null,
    tenantId,
    onsuccess,
  }: {
    open: boolean;
    mode: 'create' | 'edit';
    role?: Role | null;
    tenantId: string;
    onsuccess?: () => void;
  } = $props();

  let name = $state('');
  let description = $state('');
  let permissions = $state<Record<string, boolean>>({});
  let isSaving = $state(false);

  let isGlobalAdmin = $derived(permissions['Global.Admin'] === true);

  $effect(() => {
    if (open) {
      if (mode === 'edit' && role) {
        name = role.name;
        description = role.description ?? '';
        const attrs = (role.attributes ?? {}) as Record<string, boolean>;
        permissions = { ...attrs };
      } else {
        name = '';
        description = '';
        permissions = {};
      }
    }
  });

  function togglePermission(perm: Permission, checked: boolean) {
    permissions = { ...permissions, [perm]: checked };
  }

  function permissionCount(): number {
    return Object.values(permissions).filter(Boolean).length;
  }

  async function handleSave() {
    if (!name.trim()) return;

    isSaving = true;
    const toastId = toast.loading(mode === 'create' ? 'Creating role...' : 'Updating role...');

    try {
      const orm = new ORM(supabase);
      const attributes = { ...permissions };

      if (mode === 'create') {
        const { error } = await orm.insert('public', 'roles', [
          {
            name: name.trim(),
            description: description.trim() || null,
            attributes,
            tenant_id: tenantId,
          },
        ]);
        if (error) throw new Error(error.message);
        toast.success('Role created successfully', { id: toastId });
      } else if (role) {
        const { error } = await orm.update('public', 'roles', String(role.id), {
          name: name.trim(),
          description: description.trim() || null,
          attributes,
        });
        if (error) throw new Error(error.message);
        toast.success('Role updated successfully', { id: toastId });
      }

      open = false;
      onsuccess?.();
    } catch (err) {
      console.error('Error saving role:', err);
      toast.error('Failed to save role. Please try again.', { id: toastId });
    } finally {
      isSaving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>{mode === 'create' ? 'Create Role' : 'Edit Role'}</Dialog.Title>
      <Dialog.Description>
        {mode === 'create'
          ? 'Create a new role with specific permissions.'
          : 'Update the role name, description, and permissions.'}
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
      <div class="flex flex-col gap-2">
        <Label for="role-name">Name</Label>
        <Input
          id="role-name"
          bind:value={name}
          placeholder="Enter role name"
          onkeydown={(e) => {
            if (e.key === 'Enter' && name.trim()) handleSave();
          }}
        />
      </div>

      <div class="flex flex-col gap-2">
        <Label for="role-description">Description</Label>
        <Input
          id="role-description"
          bind:value={description}
          placeholder="Enter role description (optional)"
        />
      </div>

      <div class="flex flex-col gap-3">
        <Label>Permissions</Label>

        <div
          class="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3"
        >
          <div class="flex flex-col gap-0.5">
            <span class="text-sm font-medium">Global Admin</span>
            <span class="text-xs text-muted-foreground">Full access to all features</span>
          </div>
          <Switch
            checked={isGlobalAdmin}
            onCheckedChange={(checked) => togglePermission('Global.Admin', checked)}
          />
        </div>

        {#each PERMISSION_CATEGORIES as { category, permissions: perms }}
          <div class="flex flex-col gap-2 rounded-lg border p-3">
            <span class="text-sm font-medium">{category}</span>
            <div class="flex flex-col gap-2">
              {#each perms as perm}
                {@const label = perm.split('.')[1]}
                <div class="flex items-center justify-between pl-2">
                  <span class="text-sm text-muted-foreground">{label}</span>
                  <Switch
                    checked={isGlobalAdmin || permissions[perm] === true}
                    disabled={isGlobalAdmin}
                    onCheckedChange={(checked) => togglePermission(perm, checked)}
                  />
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={handleSave} disabled={!name.trim() || isSaving}>
        {isSaving ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
