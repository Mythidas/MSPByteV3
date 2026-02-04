<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import type { DataTableColumn, FilterOperator, TableFilter } from "./types";
  import { generateFilterId } from "./utils/filters";
  import { getDefaultOperator } from "./utils/operators";
  import {
    TextFilterInput,
    SelectFilterInput,
    NumberFilterInput,
    BooleanFilterInput,
    DateFilterInput,
  } from "./filter-inputs";

  interface Props {
    columns: DataTableColumn<any>[];
    onaddfilter: (filter: TableFilter) => void;
  }

  let { columns, onaddfilter }: Props = $props();

  let open = $state(false);
  let selectedField = $state<string>("");
  let operator = $state<FilterOperator>("eq");
  let value = $state<any>("");

  const filterableColumns = $derived(columns.filter((col) => col.filter));

  const selectedColumn = $derived(
    filterableColumns.find((col) => col.key === selectedField)
  );
  const filterConfig = $derived(selectedColumn?.filter);

  const selectedFieldLabel = $derived(
    selectedColumn ? selectedColumn.title : "Select a field..."
  );

  function handleAddFilter() {
    if (!selectedField || !filterConfig) return;

    // Validate value
    if (value === "" || value === null || value === undefined) {
      return;
    }

    // For multi-select, ensure array has items
    if (
      (operator === "in" || operator === "not.in") &&
      (!Array.isArray(value) || value.length === 0)
    ) {
      return;
    }

    const filter: TableFilter = {
      id: generateFilterId(),
      field: selectedField,
      operator,
      value,
    };

    onaddfilter(filter);

    // Reset form
    resetForm();
    open = false;
  }

  function resetForm() {
    selectedField = "";
    operator = "eq";
    value = "";
  }

  function handleFieldChange(field: string) {
    selectedField = field;
    const column = filterableColumns.find((col) => col.key === field);
    if (column?.filter) {
      // Set default operator
      operator = column.filter.defaultOperator || getDefaultOperator(column.filter.type);
      // Reset value
      if (column.filter.type === "boolean") {
        value = false;
      } else if (
        column.filter.type === "select" &&
        (operator === "in" || operator === "not.in")
      ) {
        value = [];
      } else {
        value = "";
      }
    }
  }

  function handleOperatorChange(newOperator: FilterOperator) {
    operator = newOperator;
    // Reset value when switching between single/multi select
    if (filterConfig?.type === "select") {
      if (newOperator === "in" || newOperator === "not.in") {
        value = [];
      } else {
        value = "";
      }
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="secondary" size="sm" class="h-8 gap-2">
        <PlusIcon class="h-4 w-4" />
        Add Filter
      </Button>
    {/snippet}
  </Dialog.Trigger>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>Add Filter</Dialog.Title>
      <Dialog.Description>
        Create a new filter to narrow down your results.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-4">
      <!-- Field Selection -->
      <div class="space-y-2">
        <Label for="field">Field</Label>
        <Select.Root
          type="single"
          value={selectedField}
          onValueChange={(v) => v && handleFieldChange(v)}
        >
          <Select.Trigger id="field" class="w-full">
            <span data-slot="select-value">
              {selectedFieldLabel}
            </span>
          </Select.Trigger>
          <Select.Content>
            {#each filterableColumns as column}
              <Select.Item value={column.key} label={column.title}>
                {column.title}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Filter Input based on type -->
      {#if selectedField && filterConfig}
        {#if filterConfig.type === "text"}
          <TextFilterInput
            config={filterConfig}
            {operator}
            {value}
            onoperatorchange={handleOperatorChange}
            onvaluechange={(v) => (value = v)}
          />
        {/if}

        {#if filterConfig.type === "select"}
          <SelectFilterInput
            config={filterConfig}
            {operator}
            {value}
            onoperatorchange={handleOperatorChange}
            onvaluechange={(v) => (value = v)}
          />
        {/if}

        {#if filterConfig.type === "number"}
          <NumberFilterInput
            config={filterConfig}
            {operator}
            {value}
            onoperatorchange={handleOperatorChange}
            onvaluechange={(v) => (value = v)}
          />
        {/if}

        {#if filterConfig.type === "boolean"}
          <BooleanFilterInput {value} onvaluechange={(v) => (value = v)} />
        {/if}

        {#if filterConfig.type === "date"}
          <DateFilterInput
            config={filterConfig}
            {operator}
            {value}
            onoperatorchange={handleOperatorChange}
            onvaluechange={(v) => (value = v)}
          />
        {/if}
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={handleAddFilter} disabled={!selectedField || value === ""}>
        Add Filter
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
