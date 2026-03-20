import { PersistedState } from 'runed';
import { type IntegrationId } from '@workspace/core/types/integrations';

function createScopeStore() {
  const currentSiteId = new PersistedState<string | null>('current_site_id', null, {
    storage: 'session',
    syncTabs: false,
  });
  const currentLinkId = new PersistedState<string | null>('current_link_id', null, {
    storage: 'session',
    syncTabs: false,
  });
  const currentIntegration = new PersistedState<IntegrationId | null>('current_integration', null, {
    storage: 'session',
    syncTabs: false,
  });
  const activeIntegrations = new PersistedState<IntegrationId[]>('active_integrations', [], {
    storage: 'session',
    syncTabs: true,
  });

  return {
    get currentLink() {
      return currentLinkId.current;
    },
    get currentSite() {
      return currentSiteId.current;
    },
    get currentIntegration() {
      return currentIntegration.current;
    },
    get activeIntegrations() {
      return activeIntegrations.current;
    },
    set currentSite(v: string | null) {
      currentSiteId.current = v;
    },
    set currentLink(v: string | null) {
      currentLinkId.current = v;
    },
    set currentIntegration(v: IntegrationId | null) {
      currentIntegration.current = v;
    },
    set activeIntegrations(v: IntegrationId[]) {
      activeIntegrations.current = v;
    },
  };
}

export const scopeStore = createScopeStore();
