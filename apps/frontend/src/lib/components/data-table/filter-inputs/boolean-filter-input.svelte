<script lang="ts">
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";

  interface Props {
    value: boolean;
    onvaluechange: (value: boolean) => void;
  }

  let { value, onvaluechange }: Props = $props();
</script>

<div class="space-y-2">
  <Label>Value</Label>
  <Select.Root
    type="single"
    value={String(value)}
    onValueChange={(v) => v && onvaluechange(v === "true")}
  >
    <Select.Trigger class="w-full">
      <span data-slot="select-value">
        {value ? "Yes / True" : "No / False"}
      </span>
    </Select.Trigger>
    <Select.Content>
      <Select.Item value="true" label="Yes / True">Yes / True</Select.Item>
      <Select.Item value="false" label="No / False">No / False</Select.Item>
    </Select.Content>
  </Select.Root>
</div>
