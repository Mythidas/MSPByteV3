<script lang="ts">
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import * as Select from "$lib/components/ui/select";
  import type { FilterOperator, FilterConfig } from "../types";
  import { getOperatorLabel } from "../utils/filters";

  interface Props {
    config: FilterConfig;
    operator: FilterOperator;
    value: string;
    onoperatorchange: (operator: FilterOperator) => void;
    onvaluechange: (value: string) => void;
  }

  let {
    config,
    operator,
    value,
    onoperatorchange,
    onvaluechange,
  }: Props = $props();
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
    <Input
      type="date"
      {value}
      oninput={(e) => onvaluechange(e.currentTarget.value)}
    />
  </div>
</div>
