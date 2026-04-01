<script lang="ts">
  import { notificationStore, type NotificationSeverity } from '$lib/stores/notifications.svelte';
  import { X, CircleAlert, TriangleAlert, Info } from '@lucide/svelte';

  function severityClass(s: NotificationSeverity) {
    if (s === 'error') return 'bg-destructive/10 text-destructive border-destructive/20';
    if (s === 'warning') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    return 'bg-primary/10 text-primary border-primary/20';
  }
</script>

{#if notificationStore.current}
  {@const n = notificationStore.current}
  {@const total = notificationStore.count}
  <div class="flex items-center gap-3 px-4 py-2 text-sm border-b {severityClass(n.severity)}">
    {#if n.severity === 'error'}
      <CircleAlert class="w-4 h-4 shrink-0" />
    {:else if n.severity === 'warning'}
      <TriangleAlert class="w-4 h-4 shrink-0" />
    {:else}
      <Info class="w-4 h-4 shrink-0" />
    {/if}
    <span class="font-medium shrink-0">{n.title}</span>
    <span class="opacity-80 truncate">{n.message}</span>
    <div class="flex items-center gap-2 ml-auto shrink-0">
      {#if n.link}
        <a href={n.link} class="text-xs underline hover:no-underline">View</a>
      {/if}
      {#if total > 1}
        <span class="text-xs opacity-60">1 of {total}</span>
      {/if}
      <button
        onclick={() => notificationStore.hideBanner(n.id)}
        class="opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Hide notification"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </div>
{/if}
