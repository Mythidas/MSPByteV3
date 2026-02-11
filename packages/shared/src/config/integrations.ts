export type Integration = {
  name: string;
  type: "psa" | "rmm" | "recovery" | "security" | "identity" | "other";
};

export const INTEGRATIONS: Record<string, Integration> = {
  autotask: {
    name: "AutoTask",
    type: "psa",
  },
  "sophos-partner": {
    name: "Sophos Partner",
    type: "security",
  },
  dattormm: {
    name: "DattoRMM",
    type: "rmm",
  },
  cove: {
    name: "Cove Backups",
    type: "recovery",
  },
  "microsoft-365": {
    name: "Microsoft 365",
    type: "identity",
  },
  halopsa: {
    name: "HaloPSA",
    type: "psa",
  },
  mspagent: {
    name: "MSPAgent",
    type: "other",
  },
};
