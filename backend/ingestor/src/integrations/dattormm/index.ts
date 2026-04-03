import { registry } from "../../registry.js";
import { DattoRMMAdapter } from "./DattoRMMAdapter.js";

registry.register({
  integrationId: "dattormm",
  adapter: new DattoRMMAdapter(),
  linkers: [],
  enrichments: [],
});
