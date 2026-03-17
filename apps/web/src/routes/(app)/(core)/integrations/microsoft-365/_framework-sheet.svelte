<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { Tables } from '@workspace/shared/types/database';

  type Framework = Tables<'public', 'compliance_frameworks'>;

  let {
    open = $bindable(false),
    mode,
    framework = null,
    onsuccess,
  }: {
    open: boolean;
    mode: 'create' | 'edit';
    framework?: Framework | null;
    onsuccess?: () => void;
  } = $props();

  let name = $state('');
  let description = $state('');
  let loading = $state(false);

  $effect(() => {
    if (open) {
      if (mode === 'edit' && framework) {
        name = framework.name;
        description = framework.description ?? '';
      } else {
        name = '';
        description = '';
      }
    }
  });

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }

    loading = true;
    try {
      const tenantId = authStore.currentTenant?.id ?? '';

      if (mode === 'create') {
        const { error } = await (supabase as any)
          .from('compliance_frameworks' as any)
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            integration_id: 'microsoft-365',
            tenant_id: tenantId,
          });
        if (error) throw error.message;
        toast.info('Framework created');
      } else {
        const { error } = await (supabase as any)
          .from('compliance_frameworks' as any)
          .update({ name: name.trim(), description: description.trim() || null })
          .eq('id', framework!.id);
        if (error) throw error.message;
        toast.info('Framework updated');
      }

      open = false;
      onsuccess?.();
    } catch (err) {
      toast.error(`Failed to save framework: ${err}`);
    } finally {
      loading = false;
    }
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Portal>
    <Sheet.Overlay />
    <Sheet.Content side="right" class="w-96 flex flex-col gap-0 p-0">
      <Sheet.Header class="p-4 border-b">
        <Sheet.Title>{mode === 'create' ? 'New Framework' : 'Edit Framework'}</Sheet.Title>
        <Sheet.Description>
          {mode === 'create' ? 'Define a new compliance framework.' : 'Update framework details.'}
        </Sheet.Description>
      </Sheet.Header>

      <div class="flex flex-col p-4 gap-4 flex-1 overflow-y-auto">
        <div class="flex flex-col gap-1.5">
          <Label for="fw-name">Name</Label>
          <Input id="fw-name" bind:value={name} placeholder="e.g. CIS M365 Baseline" />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="fw-desc">Description</Label>
          <Textarea
            id="fw-desc"
            bind:value={description}
            placeholder="Optional description..."
            rows={4}
          />
        </div>
      </div>

      <Sheet.Footer class="p-4 border-t">
        <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button onclick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </Sheet.Footer>
    </Sheet.Content>
  </Sheet.Portal>
</Sheet.Root>
