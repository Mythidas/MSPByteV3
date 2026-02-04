<script lang="ts">
  import { Label } from "$lib/components/ui/label";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Select from "$lib/components/ui/select";
  import type { FilterOperator, FilterConfig } from "../types";
  import { getOperatorLabel } from "../utils/filters";

  interface Props {
    config: FilterConfig;
    operator: FilterOperator;
    value: any;
    onoperatorchange: (operator: FilterOperator) => void;
    onvaluechange: (value: any) => void;
  }

  let {
    config,
    operator,
    value,
    onoperatorchange,
    onvaluechange,
  }: Props = $props();

  const isMulti = $derived(operator === "in" || operator === "not.in");
  const selectedValues = $derived<any[]>(
    isMulti ? (Array.isArray(value) ? value : []) : []
  );

  const selectedValueLabel = $derived(
    !isMulti && config.options
      ? config.options.find((opt) => String(opt.value) === String(value))?.label || "Select value..."
      : "Select value..."
  );

  function handleMultiChange(optValue: any, checked: boolean) {
    const current = Array.isArray(value) ? value : [];
    if (checked) {
      onvaluechange([...current, optValue]);
    } else {
      onvaluechange(current.filter((v: any) => v !== optValue));
    }
  }
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <Label>Operator</Label>
    <Select.Root
      type="single"
      value={operator}
      onValueChange={(v) => v && onoperatorchange(v as FilterOperator)}
    >
      <Select.Trigger class="w-full">
        <span data-slot="select-value">
          {getOperatorLabel(operator)}
        </span>
      </Select.Trigger>
      <Select.Content>
        {#each config.operators as op}
          <Select.Item value={op} label={getOperatorLabel(op)}>
            {getOperatorLabel(op)}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="space-y-2">
    <Label>Value</Label>
    {#if isMulti}
      <div class="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
        {#each config.options || [] as option}
          <div class="flex items-center space-x-2">
            <Checkbox
              id="option-{option.value}"
              checked={selectedValues.includes(option.value)}
              onCheckedChange={(checked) =>
                handleMultiChange(option.value, !!checked)
              }
            />
            <label
              for="option-{option.value}"
              class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {option.label}
            </label>
          </div>
        {/each}
      </div>
    {:else}
      <Select.Root
        type="single"
        value={String(value || "")}
        onValueChange={(v) => v && onvaluechange(v)}
      >
        <Select.Trigger class="w-full">
          <span data-slot="select-value">
            {selectedValueLabel}
          </span>
        </Select.Trigger>
        <Select.Content>
          {#each config.options || [] as option}
            <Select.Item value={String(option.value)} label={option.label}>
              {option.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {/if}
  </div>
</div>
