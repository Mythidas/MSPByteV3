import { z } from 'zod/v4';

export const mspagentConfigSchema = z.object({
  siteVariableName: z.string().min(1, 'Variable name is required').default('MSPSiteCode'),
  primaryPSA: z.enum(['autotask', 'halopsa']),
});

export type MSPAgentConfigInput = z.infer<typeof mspagentConfigSchema>;
