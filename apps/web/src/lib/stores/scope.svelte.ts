import { PersistedState } from "runed";
import { type IntegrationId } from "@workspace/shared/config/integrations";

type IntegrationScope = {
  siteId: string | null;
  linkId: string | null;
};

function createScopeStore() {
  const currentSiteId = new PersistedState<string | null>(
    "current_site_id",
    null,
    { storage: "session", syncTabs: false },
  );
  const currentLinkId = new PersistedState<string | null>(
    "current_link_id",
    null,
    { storage: "session", syncTabs: false },
  );
  const currentIntegration = new PersistedState<IntegrationId | null>(
    "current_integration",
    null,
    { storage: "session", syncTabs: false },
  );

  return {
    get currentScope() {
      return {
        siteId: currentSiteId.current,
        linkId: currentLinkId.current,
      } as IntegrationScope;
    },
    get currentIntegration() {
      return currentIntegration.current;
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
  };
}

export const scopeStore = createScopeStore();
