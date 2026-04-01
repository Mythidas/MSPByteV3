import { PersistedState } from 'runed';

export type NotificationSeverity = 'info' | 'warning' | 'error';

export type AppNotification = {
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  link?: string;
};

// Re-export so server-side code can import the type from a non-Svelte path
export type { AppNotification as ServerNotification };

function createNotificationStore() {
  const dismissedIds = new PersistedState<string[]>('notification_dismissed', [], {
    storage: 'local',
    syncTabs: true,
  });

  let notifications = $state<AppNotification[]>([]);
  let bannerHiddenIds = $state<Set<string>>(new Set());

  return {
    get all() {
      return notifications;
    },
    get undismissed() {
      return notifications.filter((n) => !dismissedIds.current.includes(n.id));
    },
    get current(): AppNotification | null {
      return (
        this.undismissed.find((n) => !bannerHiddenIds.has(n.id)) ?? null
      );
    },
    get count() {
      return this.undismissed.length;
    },
    set(ns: AppNotification[]) {
      notifications = ns;
    },
    hideBanner(id: string) {
      bannerHiddenIds = new Set([...bannerHiddenIds, id]);
    },
    dismiss(id: string) {
      dismissedIds.current = [...new Set([...dismissedIds.current, id])];
    },
  };
}

export const notificationStore = createNotificationStore();
