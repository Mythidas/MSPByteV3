<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button/index.js';
  import Separator from '$lib/components/ui/separator/separator.svelte';
  import { cn } from '$lib/utils';

  const { children } = $props();

  const tabs = [
    { href: '/automation/workflows', label: 'Workflows' },
    { href: '/automation/tasks', label: 'Tasks' },
  ];
</script>

<div class="flex flex-col size-full overflow-hidden">
  <div class="flex flex-col gap-0 px-4 pt-4">
    <h1 class="text-2xl font-bold mb-3">Automation</h1>
    <div class="flex gap-1">
      {#each tabs as tab}
        {@const active = page.url.pathname.startsWith(tab.href)}
        <Button
          variant="ghost"
          href={tab.href}
          class={cn('rounded-b-none', active && 'bg-primary/15 text-primary')}
        >
          {tab.label}
        </Button>
      {/each}
    </div>
  </div>
  <Separator />
  <div class="flex-1 overflow-hidden">
    {@render children()}
  </div>
</div>
