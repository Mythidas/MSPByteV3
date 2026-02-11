import { z } from 'zod';

export const haloPSAConfigSchema = z.object({
  url: z.url('Please enter a valid server URL'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
});
export type HaloPSAConfigInput = z.infer<typeof haloPSAConfigSchema>;
