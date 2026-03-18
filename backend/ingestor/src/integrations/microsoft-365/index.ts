import { registry } from "../../registry.js";
import { Microsoft365Adapter } from "./Microsoft365Adapter.js";
import { M365IdentityGroupsLinker } from "./M365IdentityGroupsLinker.js";
import { M365IdentityRolesLinker } from "./M365IdentityRolesLinker.js";
import { M365PoliciesLinker } from "./M365PoliciesLinker.js";
import { M365MfaEnforcedEnrichment } from "./M365MfaEnforcedEnrichment.js";

registry.register({
  integrationId: "microsoft-365",
  adapter: new Microsoft365Adapter(),
  linkers: [
    new M365IdentityGroupsLinker(),
    new M365IdentityRolesLinker(),
    new M365PoliciesLinker(),
  ],
  enrichments: [new M365MfaEnforcedEnrichment()],
});
