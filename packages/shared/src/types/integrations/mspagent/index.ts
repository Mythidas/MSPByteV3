import z from "zod";

export const MSPAgentConfigSchema = z.object({
  primaryPsa: z.string(),
  siteVariableName: z.string().default("MSPSiteCode").optional(),
});
export type MSPAgentConfig = z.infer<typeof MSPAgentConfigSchema>;
