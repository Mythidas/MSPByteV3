<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import Switch from '$lib/components/ui/switch/switch.svelte';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase.js';
  import {
    PERMISSION_CATEGORIES,
    ROLE_LEVELS,
    type Permission,
  } from '$lib/utils/permissions';
  import { cn } from '$lib/utils/index.js';
  import type { Tables } from '@workspace/shared/types/database';

  type Role = Tables<'views', 'd_roles_view'>;

  let {
    open = $bindable(false),
    mode,
    role = null,
    tenantId,
    maxLevel,
    onsuccess,
  }: {
    open: boolean;
    mode: 'create' | 'edit';
    role?: Role | null;
    tenantId: string;
    maxLevel: number | null;
    onsuccess?: () => void;
  } = $props();

  let name = $state('');
  let description = $state('');
  let level = $state('');
  let permissions = $state<Record<string, boolean>>({});
  let loading = $state(false);

  const availableLevels = $derived(
    ROLE_LEVELS.filter((l) => maxLevel == null || l.value < maxLevel)
  );

  const selectedLevelLabel = $derived(
    availableLevels.find((l) => l.value === Number(level))?.label ?? 'Select level...'
  );

  const isGlobalAdmin = $derived(permissions['Global.Admin'] === true);

  $effect(() => {
    if (open) {
      if (mode === 'edit' && role) {
        name = role.name ?? '';
        description = role.description ?? '';
        level = String(role.level ?? '');
        permissions = { ...((role.attributes as Record<string, boolean>) ?? {}) };
      } else {
        name = '';
        description = '';
        level = '';
        permissions = {};
      }
    }
  });

  function getCategoryValue(category: string): 'none' | 'read' | 'write' {
    if (permissions[`${category}.Write`]) return 'write';
    if (permissions[`${category}.Read`]) return 'read';
    return 'none';
  }

  function setCategoryPermission(category: string, value: 'none' | 'read' | 'write') {
    const readPerm = `${category}.Read` as Permission;
    const writePerm = `${category}.Write` as Permission;
    const next = { ...permissions };
    delete next[readPerm];
    delete next[writePerm];
    if (value === 'read') next[readPerm] = true;
    if (value === 'write') next[writePerm] = true;
    permissions = next;
  }

  function setGlobalAdmin(value: boolean) {
    permissions = { ...permissions, 'Global.Admin': value };
  }

  async function handleSubmit() {
    if (!name || !level) {
      toast.error('Name and level are required');
      return;
    }

    loading = true;

    const payload = {
      name,
      description: description || null,
      level: Number(level),
      attributes: permissions,
      tenant_id: tenantId,
    };

    let error: { message: string } | null = null;

    if (mode === 'create') {
      ({ error } = await supabase.from('roles').insert([payload]));
    } else if (mode === 'edit' && role?.id) {
      ({ error } = await supabase.from('roles').update(payload).eq('id', role.id));
    }

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(mode === 'create' ? 'Role created' : 'Role updated');
      open = false;
      onsuccess?.();
    }

    loading = false;
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-md flex flex-col overflow-y-hidden max-h-screen">
    <Sheet.Header>
      <Sheet.Title>{mode === 'create' ? 'Create Role' : 'Edit Role'}</Sheet.Title>
      <Sheet.Description>
        {mode === 'create'
          ? 'Define a new role with permissions.'
          : 'Update role details and permissions.'}
      </Sheet.Description>
    </Sheet.Header>

    <div class="flex flex-col gap-4 px-4 py-4 flex-1 overflow-y-auto">
      <div class="flex flex-col gap-2">
        <Label for="name">Name</Label>
        <Input id="name" bind:value={name} placeholder="Role name" />
      </div>

      <div class="flex flex-col gap-2">
        <Label for="description">Description</Label>
        <Input id="description" bind:value={description} placeholder="Optional description" />
      </div>

      <div class="flex flex-col gap-2">
        <Label>Level</Label>
        <Select.Root type="single" bind:value={level}>
          <Select.Trigger class="w-full">
            {selectedLevelLabel}
          </Select.Trigger>
          <Select.Content>
            {#each availableLevels as lvl}
              <Select.Item value={String(lvl.value)} label={lvl.label} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Global Admin toggle -->
      <div
        class="flex items-center justify-between rounded-lg border bg-primary/5 border-primary/20 p-4"
      >
        <div>
          <p class="font-medium text-sm">Global Admin</p>
          <p class="text-xs text-muted-foreground">Full access to all features</p>
        </div>
        <Switch checked={isGlobalAdmin} onCheckedChange={setGlobalAdmin} />
      </div>

      <!-- Permission categories -->
      {#if !isGlobalAdmin}
        <div class="flex flex-col gap-2">
          {#each PERMISSION_CATEGORIES as category}
            {@const current = getCategoryValue(category.category)}
            <div class="flex items-center justify-between rounded border px-3 py-2">
              <p class="text-sm font-medium">{category.category}</p>
              <div class="flex rounded-md border overflow-hidden text-xs">
                {#each ['none', 'read', 'write'] as opt}
                  <button
                    type="button"
                    class={cn(
                      'px-3 py-1 capitalize transition-colors',
                      current === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground'
                    )}
                    onclick={() => setCategoryPermission(category.category, opt as 'none' | 'read' | 'write')}
                  >{opt}</button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <Sheet.Footer class="px-4 pb-4">
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={handleSubmit} disabled={loading}>
        {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Save'}
      </Button>
    </Sheet.Footer>
  </Sheet.Content>
</Sheet.Root>
