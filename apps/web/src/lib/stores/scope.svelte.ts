import { PersistedState } from "runed";
import { type IntegrationId } from "@workspace/shared/config/integrations";

type IntegrationScope = {
  siteId: string | null;
  linkId: string | null;
};

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

export const getCurrentScope = () => {
  return {
    siteId: currentSiteId.current,
    linkId: currentLinkId.current,
  } as IntegrationScope;
};

export const getCurrentIntegration = () => {
  return currentIntegration.current;
};

export const setCurrentSite = (v: string | null) => {
  currentSiteId.current = v;
};

export const setCurrentLink = (v: string | null) => {
  currentLinkId.current = v;
};

export const setCurrentIntegration = (v: IntegrationId | null) => {
  currentIntegration.current = v;
};
