<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import * as Select from '$lib/components/ui/select/index.js';
  import SingleSelect from '$lib/components/single-select.svelte';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Label } from '$lib/components/ui/label/index.js';
  import { Textarea } from '$lib/components/ui/textarea/index.js';
  import { toast } from 'svelte-sonner';
  import { supabase } from '$lib/utils/supabase';
  import { Plus, Trash2 } from '@lucide/svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import { authStore } from '$lib/stores/auth.svelte';
  import type { Integration } from '@workspace/core/types/integrations';
  import type { FieldReference } from '@workspace/core/types/contracts/schema-registry';
  import type {
    CheckCondition,
    ConditionLogic,
    ConditionOperator,
    CheckConfig,
  } from '@workspace/core/types/contracts/compliance';
  import {
    getFlatTrackableFields,
    getOperatorsForField,
    opNeedsValue,
    opIsSize,
    type FlatField,
  } from './_schema-helpers';

  type Check = Tables<'public', 'compliance_framework_checks'>;

  const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;

  const CHECK_TYPES = [
    { value: 'policy_exists', label: 'Policy Exists', group: 'policy' },
    { value: 'policy_not_exists', label: 'Policy Not Exists', group: 'policy' },
    { value: 'policy_count_gte', label: 'Policy Count ≥', group: 'policy' },
    { value: 'field_compare', label: 'Field Compare', group: 'field' },
  ] as const;

  type CheckTypeId = (typeof CHECK_TYPES)[number]['value'];

  let {
    open = $bindable(false),
    mode,
    check = null,
    frameworkId,
    integration,
    onsuccess,
  }: {
    open: boolean;
    mode: 'create' | 'edit';
    check?: Check | null;
    frameworkId: string;
    integration: Integration;
    onsuccess?: () => void;
  } = $props();

  // ─── Available sources ────────────────────────────────────────────────────

  type Source = {
    tableKey: string;
    label: string;
    fields: FlatField[];
  };

  const availableSources = $derived(
    integration.supportedTypes
      .filter((t) => {
        if (!t.db) return false;
        return getFlatTrackableFields(t.db.shape).length > 0;
      })
      .map((t) => {
        const raw = String(t.type);
        const parts = raw.split('-');
        const label = parts
          .slice(1)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');
        return {
          tableKey: `${t.db!.schema}.${t.db!.table}`,
          label: label || raw,
          fields: getFlatTrackableFields(t.db!.shape),
        } satisfies Source;
      }),
  );

  // ─── Form state ───────────────────────────────────────────────────────────

  let name = $state('');
  let description = $state('');
  let severity = $state<string>('medium');
  let checkTypeId = $state<CheckTypeId>('policy_exists');
  let sourceKey = $state('');
  let conditions = $state<CheckCondition[]>([]);
  let conditionLogic = $state<ConditionLogic>('AND');
  let threshold = $state('1');
  // field_compare
  let selectedFieldPath = $state('');
  let fieldOp = $state<ConditionOperator>('eq');
  let fieldValue = $state('');
  let loading = $state(false);

  const selectedSource = $derived(availableSources.find((s) => s.tableKey === sourceKey) ?? null);
  const trackableFields = $derived(selectedSource?.fields ?? []);
  const selectedEvalField = $derived(
    trackableFields.find((f) => f.ingestPath === selectedFieldPath) ?? null,
  );

  const showConditions = $derived(checkTypeId !== 'field_compare');
  const showFieldCompare = $derived(checkTypeId === 'field_compare');
  const showThreshold = $derived(
    checkTypeId === 'policy_exists' ||
      checkTypeId === 'policy_count_gte' ||
      checkTypeId === 'policy_not_exists',
  );

  // ─── Reference options ────────────────────────────────────────────────────

  let referenceOptions = $state<Record<string, { value: string; label: string }[]>>({});
  let referenceLoading = $state<Record<string, boolean>>({});
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  $effect(() => {
    if (!selectedSource) {
      referenceOptions = {};
      return;
    }

    // Populate with special values only — DB rows fetched on search
    const initial: Record<string, { value: string; label: string }[]> = {};
    for (const f of trackableFields) {
      if (!f.field.reference) continue;
      initial[f.ingestPath] = [...(f.field.reference.specialValues ?? [])];
    }
    referenceOptions = initial;
  });

  function handleReferenceSearch(fieldPath: string, ref: FieldReference, query: string) {
    clearTimeout(debounceTimers.get(fieldPath));
    const timer = setTimeout(async () => {
      referenceLoading = { ...referenceLoading, [fieldPath]: true };
      const parts = ref.table.includes('.') ? ref.table.split('.') : ['public', ref.table];
      const [schema, tableName] = parts;
      const db = supabase as any;
      const q = schema === 'public' ? db.from(tableName) : db.schema(schema).from(tableName);
      let dbQuery = q
        .select(`${ref.valueColumn},${ref.labelColumn}`)
        .eq('tenant_id', authStore.currentTenant?.id)
        .limit(30);
      if (query.trim()) {
        dbQuery = dbQuery.ilike(ref.labelColumn, `%${query.trim()}%`);
      }
      const { data } = await dbQuery;
      if (data) {
        const loaded = (data as Record<string, unknown>[]).map((row) => ({
          value: String(row[ref.valueColumn] ?? ''),
          label: String(row[ref.labelColumn] ?? row[ref.valueColumn] ?? ''),
        }));
        referenceOptions = {
          ...referenceOptions,
          [fieldPath]: [...(ref.specialValues ?? []), ...loaded],
        };
      }
      referenceLoading = { ...referenceLoading, [fieldPath]: false };
    }, 300);
    debounceTimers.set(fieldPath, timer);
  }

  // ─── Hydration ────────────────────────────────────────────────────────────

  $effect(() => {
    if (open) {
      if (mode === 'edit' && check) {
        name = check.name;
        description = check.description ?? '';
        severity = check.severity;

        const rawType = check.check_type_id as string;
        if (rawType === 'field_equals' || rawType === 'field_not_equals') {
          checkTypeId = 'field_compare';
        } else {
          checkTypeId = (rawType as CheckTypeId) ?? 'policy_exists';
        }

        const cfg = check.check_config as any;
        sourceKey = cfg?.table ?? '';
        threshold = String(cfg?.threshold ?? 1);

        if (cfg?.filter) {
          conditionLogic = cfg.filter.logic ?? 'AND';
          conditions = cfg.filter.conditions ?? [];
        } else if (cfg?.match && typeof cfg.match === 'object') {
          conditionLogic = 'AND';
          conditions = Object.entries(cfg.match as Record<string, unknown>).map(([field, value]) => ({
            field,
            op: 'eq' as ConditionOperator,
            value,
          }));
        } else {
          conditionLogic = 'AND';
          conditions = [];
        }

        selectedFieldPath = cfg?.field ?? '';
        fieldOp = rawType === 'field_not_equals' ? 'neq' : ((cfg?.op as ConditionOperator) ?? 'eq');
        fieldValue = cfg?.value != null ? String(cfg.value) : '';
      } else {
        name = '';
        description = '';
        severity = 'medium';
        checkTypeId = 'policy_exists';
        sourceKey = availableSources[0]?.tableKey ?? '';
        conditions = [];
        conditionLogic = 'AND';
        threshold = '1';
        selectedFieldPath = '';
        fieldOp = 'eq';
        fieldValue = '';
      }
    }
  });

  // ─── Condition helpers ────────────────────────────────────────────────────

  function addCondition() {
    conditions = [...conditions, { field: '', op: 'eq', value: '' }];
  }

  function removeCondition(i: number) {
    conditions = conditions.filter((_, idx) => idx !== i);
  }

  function updateConditionField(i: number, ingestPath: string) {
    const updated = [...conditions];
    const field = trackableFields.find((f) => f.ingestPath === ingestPath);
    const defaultOp = field ? getOperatorsForField(field)[0]?.value ?? 'eq' : 'eq';
    updated[i] = { field: ingestPath, op: defaultOp, value: '' };
    conditions = updated;
  }

  function updateConditionOp(i: number, op: ConditionOperator) {
    const updated = [...conditions];
    updated[i] = { ...updated[i], op, value: opNeedsValue(op) ? updated[i].value : undefined };
    conditions = updated;
  }

  function updateConditionValue(i: number, value: string) {
    const updated = [...conditions];
    updated[i] = { ...updated[i], value };
    conditions = updated;
  }

  // ─── Config builder ───────────────────────────────────────────────────────

  function coerceFieldValue(raw: string, flatField: FlatField | null): unknown {
    if (!flatField) return raw;
    if (flatField.field.type === 'number') return Number(raw);
    if (flatField.field.type === 'boolean') return raw === 'true';
    return raw;
  }

  function buildConfig(): CheckConfig {
    const validConditions = conditions.filter((c) => c.field.trim());
    const filter =
      showConditions && validConditions.length > 0
        ? { logic: conditionLogic, conditions: validConditions }
        : undefined;

    return {
      table: sourceKey,
      ...(filter ? { filter } : {}),
      ...(showThreshold ? { threshold: Number(threshold) || 1 } : {}),
      ...(showFieldCompare
        ? {
            field: selectedFieldPath,
            op: fieldOp,
            value: coerceFieldValue(fieldValue, selectedEvalField),
          }
        : {}),
    };
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!name.trim()) { toast.error('Name is required'); return; }
    if (!sourceKey) { toast.error('Data source is required'); return; }
    if (showFieldCompare && !selectedFieldPath) {
      toast.error('Field is required for Field Compare checks');
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
    <Dialog.Content class="min-w-3/5 flex flex-col gap-0 p-0 max-h-[90vh]">
      <Dialog.Header class="p-4 border-b shrink-0">
        <Dialog.Title>{mode === 'create' ? 'Add Check' : 'Edit Check'}</Dialog.Title>
        <Dialog.Description>Configure the compliance check parameters.</Dialog.Description>
      </Dialog.Header>

      <div class="flex flex-col p-4 gap-4 overflow-y-auto">
        <!-- Name -->
        <div class="flex flex-col gap-1.5">
          <Label>Name</Label>
          <Input bind:value={name} placeholder="e.g. MFA Required for All Users" />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1.5">
          <Label>Description</Label>
          <Textarea bind:value={description} placeholder="Optional description..." rows={2} />
        </div>

        <!-- Severity + Check Type -->
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <Label>Severity</Label>
            <Select.Root type="single" bind:value={severity}>
              <Select.Trigger class="w-full capitalize">{severity}</Select.Trigger>
              <Select.Content>
                {#each SEVERITIES as s}
                  <Select.Item value={s} class="capitalize">{s}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label>Check Type</Label>
            <Select.Root
              type="single"
              bind:value={checkTypeId}
              onValueChange={() => {
                conditions = [];
                selectedFieldPath = '';
                fieldOp = 'eq';
                fieldValue = '';
              }}
            >
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

        <!-- Data Source -->
        <div class="flex flex-col gap-1.5">
          <Label>Data Source</Label>
          <Select.Root
            type="single"
            bind:value={sourceKey}
            onValueChange={() => {
              conditions = [];
              selectedFieldPath = '';
              fieldOp = 'eq';
              fieldValue = '';
            }}
          >
            <Select.Trigger class="w-full">
              {selectedSource?.label ?? 'Select a source...'}
            </Select.Trigger>
            <Select.Content>
              {#each availableSources as src}
                <Select.Item value={src.tableKey}>{src.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <!-- Threshold -->
        {#if showThreshold}
          <div class="flex flex-col gap-1.5">
            <Label>Threshold</Label>
            <Input type="number" bind:value={threshold} min="1" />
          </div>
        {/if}

        <!-- Field Compare -->
        {#if showFieldCompare}
          <div class="flex flex-col gap-1.5">
            <Label>Field Comparison</Label>
            <div class="flex gap-2 items-center flex-wrap">
              <Select.Root
                type="single"
                bind:value={selectedFieldPath}
                onValueChange={() => {
                  const f = trackableFields.find((f) => f.ingestPath === selectedFieldPath);
                  if (f) fieldOp = getOperatorsForField(f)[0]?.value ?? 'eq';
                  fieldValue = '';
                }}
              >
                <Select.Trigger class="flex-1 min-w-32">
                  {selectedEvalField?.label ?? 'Select field...'}
                </Select.Trigger>
                <Select.Content>
                  {#each trackableFields as f}
                    <Select.Item value={f.ingestPath}>{f.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>

              {#if selectedEvalField}
                <Select.Root
                  type="single"
                  bind:value={fieldOp}
                  onValueChange={() => (fieldValue = '')}
                >
                  <Select.Trigger class="w-36 shrink-0">
                    {getOperatorsForField(selectedEvalField).find((o: { value: string; label: string }) => o.value === fieldOp)?.label ?? fieldOp}
                  </Select.Trigger>
                  <Select.Content>
                    {#each getOperatorsForField(selectedEvalField) as opt}
                      <Select.Item value={opt.value}>{opt.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>

                {#if opNeedsValue(fieldOp)}
                  {#if opIsSize(fieldOp)}
                    <Input
                      type="number"
                      bind:value={fieldValue}
                      placeholder="count"
                      min="0"
                      class="w-24 shrink-0"
                    />
                  {:else if selectedEvalField.field.options && (selectedEvalField.field.type === 'enum' || (selectedEvalField.field.modality === 'array' && (fieldOp === 'contains' || fieldOp === 'not_contains')))}
                    <Select.Root type="single" bind:value={fieldValue}>
                      <Select.Trigger class="flex-1 min-w-28">
                        {selectedEvalField.field.options.find((o: { value: string; label: string }) => o.value === fieldValue)?.label ?? (fieldValue || 'Select...')}
                      </Select.Trigger>
                      <Select.Content>
                        {#each selectedEvalField.field.options as opt}
                          <Select.Item value={opt.value}>{opt.label}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  {:else if selectedEvalField.field.type === 'boolean'}
                    <Select.Root type="single" bind:value={fieldValue}>
                      <Select.Trigger class="flex-1 min-w-28">
                        {fieldValue === 'true'
                          ? 'True'
                          : fieldValue === 'false'
                            ? 'False'
                            : 'Select...'}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="true">True</Select.Item>
                        <Select.Item value="false">False</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  {:else if selectedEvalField.field.reference && (fieldOp === 'contains' || fieldOp === 'not_contains')}
                    <SingleSelect
                      options={referenceOptions[selectedEvalField.ingestPath] ?? (selectedEvalField.field.reference.specialValues ?? [])}
                      bind:selected={fieldValue}
                      loading={referenceLoading[selectedEvalField.ingestPath]}
                      onsearch={(q) => handleReferenceSearch(selectedEvalField.ingestPath, selectedEvalField.field.reference!, q)}
                      onchange={(v) => { fieldValue = v; }}
                      placeholder="Select..."
                      class="flex-1 min-w-28"
                    />
                  {:else}
                    <Input
                      bind:value={fieldValue}
                      type={selectedEvalField.field.type === 'number' ? 'number' : 'text'}
                      placeholder="expected value"
                      class="flex-1 min-w-28"
                    />
                  {/if}
                {/if}
              {/if}
            </div>
          </div>
        {/if}

        <!-- Conditions (policy check types only) -->
        {#if showConditions}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Label>Conditions</Label>
                {#if conditions.length > 1}
                  <div class="flex items-center rounded-md border overflow-hidden text-xs">
                    <button
                      class="px-2 py-0.5 transition-colors {conditionLogic === 'AND'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'}"
                      onclick={() => (conditionLogic = 'AND')}
                    >AND</button>
                    <button
                      class="px-2 py-0.5 transition-colors {conditionLogic === 'OR'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'}"
                      onclick={() => (conditionLogic = 'OR')}
                    >OR</button>
                  </div>
                {/if}
              </div>
              <Button variant="ghost" size="sm" onclick={addCondition} class="h-7 px-2 gap-1">
                <Plus class="size-3" /> Add
              </Button>
            </div>

            {#if conditions.length === 0}
              <span class="text-xs text-muted-foreground">No conditions — matches all rows</span>
            {/if}

            {#each conditions as cond, i}
              {@const condField = trackableFields.find((f) => f.ingestPath === cond.field) ?? null}
              {@const condOps = condField ? getOperatorsForField(condField) : []}
              <div class="flex gap-2 items-center">
                <!-- Field -->
                <Select.Root
                  type="single"
                  value={cond.field}
                  onValueChange={(v) => updateConditionField(i, v)}
                >
                  <Select.Trigger class="flex-1 min-w-0 truncate">
                    {condField?.label ?? 'Select field...'}
                  </Select.Trigger>
                  <Select.Content>
                    {#each trackableFields as f}
                      <Select.Item value={f.ingestPath}>{f.label}</Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>

                <!-- Operator -->
                {#if condField}
                  <Select.Root
                    type="single"
                    value={cond.op}
                    onValueChange={(v) => updateConditionOp(i, v as ConditionOperator)}
                  >
                    <Select.Trigger class="w-32 shrink-0">
                      {condOps.find((o: { value: string; label: string }) => o.value === cond.op)?.label ?? cond.op}
                    </Select.Trigger>
                    <Select.Content>
                      {#each condOps as opt}
                        <Select.Item value={opt.value}>{opt.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                {/if}

                <!-- Value -->
                {#if condField && opNeedsValue(cond.op)}
                  {#if opIsSize(cond.op)}
                    <Input
                      type="number"
                      value={String(cond.value ?? '')}
                      oninput={(e) =>
                        updateConditionValue(i, (e.target as HTMLInputElement).value)}
                      placeholder="n"
                      min="0"
                      class="w-20 shrink-0"
                    />
                  {:else if condField.field.options && (condField.field.type === 'enum' || (condField.field.modality === 'array' && (cond.op === 'contains' || cond.op === 'not_contains')))}
                    <Select.Root
                      type="single"
                      value={String(cond.value ?? '')}
                      onValueChange={(v) => updateConditionValue(i, v)}
                    >
                      <Select.Trigger class="flex-1 min-w-0 truncate">
                        {condField.field.options.find((o) => o.value === cond.value)?.label ??
                          String(cond.value || 'Select...')}
                      </Select.Trigger>
                      <Select.Content>
                        {#each condField.field.options as opt}
                          <Select.Item value={opt.value}>{opt.label}</Select.Item>
                        {/each}
                      </Select.Content>
                    </Select.Root>
                  {:else if condField.field.type === 'boolean'}
                    <Select.Root
                      type="single"
                      value={String(cond.value ?? '')}
                      onValueChange={(v) => updateConditionValue(i, v)}
                    >
                      <Select.Trigger class="flex-1 min-w-0">
                        {cond.value === 'true' || cond.value === true
                          ? 'True'
                          : cond.value === 'false' || cond.value === false
                            ? 'False'
                            : 'Select...'}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="true">True</Select.Item>
                        <Select.Item value="false">False</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  {:else if condField.field.reference && (cond.op === 'contains' || cond.op === 'not_contains')}
                    {@const condSelected = String(cond.value ?? '')}
                    <SingleSelect
                      options={referenceOptions[condField.ingestPath] ?? (condField.field.reference.specialValues ?? [])}
                      selected={condSelected}
                      loading={referenceLoading[condField.ingestPath]}
                      onsearch={(q) => handleReferenceSearch(condField.ingestPath, condField.field.reference!, q)}
                      onchange={(v) => updateConditionValue(i, v)}
                      placeholder="Select..."
                      class="flex-1 min-w-0"
                    />
                  {:else}
                    <Input
                      value={String(cond.value ?? '')}
                      oninput={(e) =>
                        updateConditionValue(i, (e.target as HTMLInputElement).value)}
                      type={condField.field.type === 'number' ? 'number' : 'text'}
                      placeholder="value"
                      class="flex-1 min-w-0"
                    />
                  {/if}
                {/if}

                <button
                  class="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  onclick={() => removeCondition(i)}
                >
                  <Trash2 class="size-4" />
                </button>
              </div>
            {/each}
          </div>
        {/if}
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
