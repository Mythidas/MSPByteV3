<script lang="ts">
  import { supabase } from '$lib/supabase';
  import { toast } from 'svelte-sonner';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { createRunWorkflow } from '$lib/hooks/useRunWorkflow.svelte';
  import type { WorkflowStageNode } from '$lib/hooks/useRunWorkflow.svelte';

  interface Workflow {
    id: string;
    name: string;
    description: string | null;
    stages: WorkflowStageNode[];
  }

  interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    entityType: string;
    integration: string;
    selectedEntityIds: string[];
    selectedDisplayNames: string[];
    tenantId: string;
  }

  let { open, onOpenChange, entityType, integration, selectedEntityIds, selectedDisplayNames, tenantId }: Props = $props();

  let workflows = $state<Workflow[]>([]);
  let selectedWorkflowId = $state<string | null>(null);
  let isLoadingWorkflows = $state(false);
  let extraParams = $state<Record<string, string>>({});

  const runner = createRunWorkflow();

  let selectedWorkflow = $derived(workflows.find((w) => w.id === selectedWorkflowId) ?? null);

  let seedParamKeys = $derived.by(() => {
    if (!selectedWorkflow) return [];
    const keys = new Set<string>();
    for (const stage of selectedWorkflow.stages) {
      for (const { from: dotPath } of Object.values(stage.input_map)) {
        if (dotPath.startsWith('seed.params.')) {
          keys.add(dotPath.slice('seed.params.'.length));
        }
      }
    }
    return Array.from(keys);
  });

  let confirmationLine = $derived.by(() => {
    if (!selectedWorkflow) return '';
    const truncated = selectedDisplayNames.slice(0, 3);
    const remainder = selectedDisplayNames.length - 3;
    const names = remainder > 0 ? `${truncated.join(', ')} +${remainder} more` : truncated.join(', ');
    return `Running "${selectedWorkflow.name}" against ${selectedDisplayNames.length} entities: ${names}`;
  });

  async function loadWorkflows() {
    isLoadingWorkflows = true;
    try {
      const { data } = await (supabase.from('workflows' as any) as any)
        .select('id, name, description, stages')
        .eq('integration_id', integration)
        .or('is_built_in.eq.true');

      workflows = (data ?? []) as Workflow[];
      selectedWorkflowId = workflows[0]?.id ?? null;
    } finally {
      isLoadingWorkflows = false;
    }
  }

  function resetState() {
    workflows = [];
    selectedWorkflowId = null;
    extraParams = {};
  }

  $effect(() => {
    if (open) {
      loadWorkflows();
    } else {
      resetState();
    }
  });

  async function handleRun() {
    if (!selectedWorkflow) return;

    const seedParams: Record<string, unknown> = {};
    for (const key of seedParamKeys) {
      seedParams[key] = extraParams[key] ?? '';
    }

    const result = await runner.execute({
      tenantId,
      workflowId: selectedWorkflow.id,
      workflowSnapshot: selectedWorkflow.stages,
      entityType,
      entityIds: selectedEntityIds,
      seedParams,
    });

    if (result) {
      toast.success('Workflow started');
      onOpenChange(false);
    } else if (runner.error) {
      toast.error(runner.error);
    }
  }
</script>

<Dialog.Root {open} onOpenChange={onOpenChange}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Run Workflow</Dialog.Title>
      <Dialog.Description>
        Select a workflow to run against the selected entities.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4 py-2">
      {#if isLoadingWorkflows}
        <p class="text-sm text-muted-foreground">Loading workflows...</p>
      {:else if workflows.length === 0}
        <p class="text-sm text-muted-foreground">No workflows available for this integration.</p>
      {:else}
        <!-- Workflow list (radio-style) -->
        <div class="flex flex-col gap-2">
          {#each workflows as workflow (workflow.id)}
            <button
              class="flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent {selectedWorkflowId === workflow.id ? 'border-primary bg-primary/5' : 'border-border'}"
              onclick={() => (selectedWorkflowId = workflow.id)}
            >
              <span class="text-sm font-medium">{workflow.name}</span>
              {#if workflow.description}
                <span class="text-xs text-muted-foreground">{workflow.description}</span>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Seed params form (auto-generated) -->
        {#if seedParamKeys.length > 0}
          <div class="flex flex-col gap-2 border-t pt-3">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parameters</p>
            {#each seedParamKeys as key (key)}
              <div class="flex flex-col gap-1">
                <label class="text-sm font-medium" for="param-{key}">{key}</label>
                <input
                  id="param-{key}"
                  class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  type="text"
                  value={extraParams[key] ?? ''}
                  oninput={(e) => { extraParams[key] = (e.target as HTMLInputElement).value; }}
                />
              </div>
            {/each}
          </div>
        {/if}

        <!-- Confirmation summary -->
        {#if confirmationLine}
          <p class="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {confirmationLine}
          </p>
        {/if}
      {/if}
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={() => onOpenChange(false)}>Cancel</Button>
      <Button
        disabled={!selectedWorkflow || runner.isLoading}
        onclick={handleRun}
      >
        {runner.isLoading ? 'Starting...' : 'Run Workflow'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
