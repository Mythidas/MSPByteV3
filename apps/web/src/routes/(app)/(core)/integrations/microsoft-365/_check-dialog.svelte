<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase';
  import { Plus, Trash2 } from '@lucide/svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { authStore } from '$lib/stores/auth.svelte';

  type Check = Tables<'public', 'compliance_framework_checks'>;

  const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
  const CHECK_TYPES = [
    { value: 'policy_exists', label: 'Policy Exists' },
    { value: 'policy_count_gte', label: 'Policy Count ≥' },
    { value: 'field_equals', label: 'Field Equals' },
    { value: 'field_not_equals', label: 'Field Not Equals' },
  ] as const;

  type CheckTypeId = (typeof CHECK_TYPES)[number]['value'];

  let {
    open = $bindable(false),
    mode,
    check = null,
    frameworkId,
    onsuccess,
  }: {
    open: boolean;
    mode: 'create' | 'edit';
    check?: Check | null;
    frameworkId: string;
    onsuccess?: () => void;
  } = $props();

  let name = $state('');
  let description = $state('');
  let severity = $state<string>('medium');
  let checkTypeId = $state<CheckTypeId>('policy_exists');
  let table = $state('');
  let matchRows = $state<{ key: string; value: string }[]>([]);
  let threshold = $state('1');
  let field = $state('');
  let fieldValue = $state('');
  let loading = $state(false);

  const showThreshold = $derived(
    checkTypeId === 'policy_exists' || checkTypeId === 'policy_count_gte'
  );
  const showFieldValue = $derived(
    checkTypeId === 'field_equals' || checkTypeId === 'field_not_equals'
  );

  $effect(() => {
    if (open) {
      if (mode === 'edit' && check) {
        name = check.name;
        description = check.description ?? '';
        severity = check.severity;
        checkTypeId = check.check_type_id as CheckTypeId;
        const cfg = check.check_config as any;
        table = cfg?.table ?? '';
        threshold = String(cfg?.threshold ?? 1);
        field = cfg?.field ?? '';
        fieldValue = cfg?.value ?? '';
        matchRows = cfg?.match
          ? Object.entries(cfg.match).map(([k, v]) => ({ key: k, value: String(v) }))
          : [];
      } else {
        name = '';
        description = '';
        severity = 'medium';
        checkTypeId = 'policy_exists';
        table = '';
        matchRows = [];
        threshold = '1';
        field = '';
        fieldValue = '';
      }
    }
  });

  function addMatchRow() {
    matchRows = [...matchRows, { key: '', value: '' }];
  }

  function removeMatchRow(i: number) {
    matchRows = matchRows.filter((_, idx) => idx !== i);
  }

  function buildConfig() {
    const match: Record<string, unknown> = {};
    for (const row of matchRows) {
      if (row.key.trim()) match[row.key.trim()] = row.value;
    }

    const cfg: Record<string, unknown> = { table };
    if (Object.keys(match).length) cfg.match = match;
    if (showThreshold) cfg.threshold = Number(threshold) || 1;
    if (showFieldValue) {
      cfg.field = field;
      cfg.value = fieldValue;
    }
    return cfg;
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!table.trim()) {
      toast.error('Table is required');
      return;
    }

    loading = true;
    try {
      const payload = {
        framework_id: frameworkId,
        name: name.trim(),
        description: description.trim() || null,
        severity,
        check_type_id: checkTypeId,
        check_config: buildConfig(),
        tenant_id: authStore.currentTenant?.id,
      };

      if (mode === 'create') {
        const { error } = await (supabase as any)
          .from('compliance_framework_checks' as any)
          .insert(payload);
        if (error) throw error.message;
        toast.info('Check added');
      } else {
        const { error } = await (supabase as any)
          .from('compliance_framework_checks' as any)
          .update(payload)
          .eq('id', check!.id);
        if (error) throw error.message;
        toast.info('Check updated');
      }

      open = false;
      onsuccess?.();
    } catch (err) {
      toast.error(`Failed to save check: ${err}`);
    } finally {
      loading = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content class="max-w-lg flex flex-col gap-0 p-0 max-h-[90vh]">
      <Dialog.Header class="p-4 border-b shrink-0">
        <Dialog.Title>{mode === 'create' ? 'Add Check' : 'Edit Check'}</Dialog.Title>
        <Dialog.Description>Configure the compliance check parameters.</Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col p-4 gap-4 overflow-y-auto">
        <div class="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input bind:value={name} placeholder="e.g. MFA Enabled for All Users" />
        </div>

        <div class="flex flex-col gap-1.5">
          <Label>Description</Label>
          <Textarea bind:value={description} placeholder="Optional description..." rows={2} />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <Label>Severity</Label>
            <Select.Root type="single" bind:value={severity}>
              <Select.Trigger class="w-full">
                {severity}
              </Select.Trigger>
              <Select.Content>
                {#each SEVERITIES as s}
                  <Select.Item value={s}>{s}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label>Check Type</Label>
            <Select.Root type="single" bind:value={checkTypeId}>
              <Select.Trigger class="w-full">
                {CHECK_TYPES.find((t) => t.value === checkTypeId)?.label ?? checkTypeId}
              </Select.Trigger>
              <Select.Content>
                {#each CHECK_TYPES as t}
                  <Select.Item value={t.value}>{t.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label>Table</Label>
          <Input bind:value={table} placeholder="vendors.m365_policies" />
        </div>

        {#if showThreshold}
          <div class="flex flex-col gap-1.5">
            <Label>Threshold</Label>
            <Input type="number" bind:value={threshold} min="1" />
          </div>
        {/if}

        {#if showFieldValue}
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-1.5">
              <Label>Field</Label>
              <Input bind:value={field} placeholder="status" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Value</Label>
              <Input bind:value={fieldValue} placeholder="enabled" />
            </div>
          </div>
        {/if}

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <Label>Match Conditions</Label>
            <Button variant="ghost" size="sm" onclick={addMatchRow} class="h-7 px-2 gap-1">
              <Plus class="size-3" /> Add Row
            </Button>
          </div>
          {#if matchRows.length === 0}
            <span class="text-xs text-muted-foreground">No match conditions (matches all rows)</span
            >
          {/if}
          {#each matchRows as row, i}
            <div class="flex gap-2 items-center">
              <Input bind:value={row.key} placeholder="key" class="flex-1" />
              <Input bind:value={row.value} placeholder="value" class="flex-1" />
              <button
                class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                onclick={() => removeMatchRow(i)}
              >
                <Trash2 class="size-4" />
              </button>
            </div>
          {/each}
        </div>
      </div>

      <Dialog.Footer class="p-4 border-t shrink-0">
        <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
        <Button onclick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
