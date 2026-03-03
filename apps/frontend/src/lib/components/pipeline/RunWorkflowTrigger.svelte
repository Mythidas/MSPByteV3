<script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { Play } from '@lucide/svelte';
  import RunWorkflowModal from './RunWorkflowModal.svelte';

  interface SelectedRow {
    id: string;
    displayName: string;
  }

  interface Props {
    selectedRows: SelectedRow[];
    entityType: string;
    integration: string;
    tenantId: string;
  }

  let { selectedRows, entityType, integration, tenantId }: Props = $props();

  let modalOpen = $state(false);

  let selectedEntityIds = $derived(selectedRows.map((r) => r.id));
  let selectedDisplayNames = $derived(selectedRows.map((r) => r.displayName));
</script>

<div class="relative inline-flex">
  <Button
    variant="outline"
    size="sm"
    disabled={selectedRows.length === 0}
    onclick={() => (modalOpen = true)}
    class="gap-1.5"
  >
    <Play class="size-3.5" />
    Run Workflow
  </Button>

  {#if selectedRows.length > 0}
    <Badge
      class="absolute -top-2 -right-2 flex size-5 items-center justify-center p-0 text-[10px] bg-primary/15 text-primary border-primary/30"
    >
      {selectedRows.length}
    </Badge>
  {/if}
</div>

<RunWorkflowModal
  open={modalOpen}
  onOpenChange={(v) => (modalOpen = v)}
  {entityType}
  {integration}
  {selectedEntityIds}
  {selectedDisplayNames}
  {tenantId}
/>
