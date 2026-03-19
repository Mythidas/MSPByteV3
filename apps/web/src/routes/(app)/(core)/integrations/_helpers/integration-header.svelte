<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
  import FadeIn from '$lib/components/transition/fade-in.svelte';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import { cn } from '$lib/utils';
    import type { Integration } from "@workspace/core/types/integrations";

  const {
    integration,
    active,
    loading,
  }: { integration: Integration; active: boolean; loading: boolean } = $props();
</script>

<div class="flex flex-col w-full h-fit gap-2">
  <Breadcrumb.Root>
    <Breadcrumb.List>
      <Breadcrumb.Item>
        <Breadcrumb.Link href="/integrations">Integrations</Breadcrumb.Link>
      </Breadcrumb.Item>
      <Breadcrumb.Separator />
      <Breadcrumb.Item>
        <Breadcrumb.Page>{integration.name}</Breadcrumb.Page>
      </Breadcrumb.Item>
    </Breadcrumb.List>
  </Breadcrumb.Root>
  <div>
    <h1 class="h-fit text-2xl font-bold">{integration.name}</h1>
    {#if !loading}
      <FadeIn>
        <Badge class={cn(active ? 'bg-primary' : 'bg-muted-foreground/50')}>
          {active ? 'Active' : 'Available'}
        </Badge>
        <Badge variant="outline">
          {integration.category.toUpperCase()}
        </Badge>
      </FadeIn>
    {/if}
  </div>
</div>
