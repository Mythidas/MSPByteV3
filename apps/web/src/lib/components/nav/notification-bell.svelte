<script lang="ts">
  import { notificationStore, type NotificationSeverity } from '$lib/stores/notifications.svelte';
  import { Bell, X, CircleAlert, TriangleAlert, Info } from '@lucide/svelte';

  let open = $state(false);

  function severityIcon(s: NotificationSeverity) {
    return s === 'error' ? CircleAlert : s === 'warning' ? TriangleAlert : Info;
  }

  function severityIconClass(s: NotificationSeverity) {
    if (s === 'error') return 'text-destructive';
    if (s === 'warning') return 'text-amber-500';
    return 'text-primary';
  }
</script>

{#if open}
  <div class="fixed inset-0 z-40" onclick={() => (open = false)} aria-hidden="true"></div>
{/if}

<div class="relative">
  <button
    onclick={() => (open = !open)}
    class="relative flex items-center justify-center w-9 h-9 rounded hover:bg-accent transition-colors"
    aria-label="Notifications"
  >
    <Bell class="w-5 h-5" />
    {#if notificationStore.count > 0}
      <span
        class="absolute top-1 right-1 min-w-4 h-4 text-[10px] font-bold rounded-full
               bg-destructive text-destructive-foreground flex items-center justify-center px-1 leading-none"
      >
        {notificationStore.count > 99 ? '99+' : notificationStore.count}
      </span>
    {/if}
  </button>

  {#if open}
    <div
      class="absolute top-full right-0 mt-2 w-80 bg-background border rounded-lg shadow-lg z-50 overflow-hidden"
    >
      <div class="px-3 py-2.5 border-b text-sm font-medium">Notifications</div>
      {#if notificationStore.undismissed.length === 0}
        <div class="px-4 py-6 text-sm text-muted-foreground text-center">
          No active notifications
        </div>
      {:else}
        <div class="max-h-96 overflow-y-auto">
          {#each notificationStore.undismissed as n (n.id)}
            {@const Icon = severityIcon(n.severity)}
            <div
              class="flex items-start gap-2.5 px-3 py-2.5 border-b last:border-0 hover:bg-muted/40"
            >
              <Icon class="w-4 h-4 mt-0.5 shrink-0 {severityIconClass(n.severity)}" />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium leading-snug">{n.title}</div>
                <div class="text-xs text-muted-foreground mt-0.5 leading-snug">{n.message}</div>
                {#if n.link}
                  <a
                    href={n.link}
                    class="text-xs underline mt-1 inline-block text-foreground/70 hover:text-foreground"
                    onclick={() => (open = false)}
                  >
                    View
                  </a>
                {/if}
              </div>
              <button
                onclick={() => notificationStore.dismiss(n.id)}
                class="shrink-0 mt-0.5 opacity-40 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
