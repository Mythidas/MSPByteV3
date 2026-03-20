<script lang="ts">
  import * as Sheet from '$lib/components/ui/sheet/index.js';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import type { Tables } from '@workspace/shared/types/database';
  import WorkflowCanvas from './workflow-canvas.svelte';

  type Workflow = Tables<'public', 'workflows'>;

  let {
    open = $bindable(false),
    workflow,
  }: {
    open: boolean;
    workflow: Workflow | null;
  } = $props();
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class="sm:max-w-4xl flex flex-col overflow-hidden">
    {#if workflow}
      <Sheet.Header>
        <div class="flex items-center gap-2 flex-wrap">
          <Sheet.Title>{workflow.name}</Sheet.Title>
          {#if workflow.is_managed}
            <Badge class="bg-primary/15 text-primary border-primary/30 text-xs">Managed</Badge>
          {:else}
            <Badge class="bg-muted text-muted-foreground border-muted-foreground/30 text-xs"
              >Custom</Badge
            >
          {/if}
        </div>
        {#if workflow.description}
          <Sheet.Description>{workflow.description}</Sheet.Description>
        {/if}
        <div class="flex items-center gap-2 flex-wrap pt-1">
          <Badge class="bg-primary/15 text-primary border-primary/30 text-xs">
            {workflow.target_entity_type}
          </Badge>
          <Badge class="bg-muted text-muted-foreground border-muted-foreground/30 text-xs">
            {workflow.target_scope_type}
          </Badge>
          {#each workflow.tags as tag}
            <Badge variant="outline" class="text-xs">{tag}</Badge>
          {/each}
        </div>
      </Sheet.Header>

      <div class="flex-1 overflow-hidden">
        <WorkflowCanvas graph={workflow.graph} />
      </div>
    {:else}
      <Sheet.Header>
        <Sheet.Title>No workflow selected</Sheet.Title>
      </Sheet.Header>
    {/if}
  </Sheet.Content>
</Sheet.Root>
