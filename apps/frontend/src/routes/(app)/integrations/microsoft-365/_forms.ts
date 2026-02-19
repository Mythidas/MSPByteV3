import { z } from 'zod';

export const microsoft365DirectSchema = z.object({
  mode: z.literal('direct'),
  tenantId: z.string().min(1, 'Tenant ID is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
});

export const microsoft365PartnerSchema = z.object({
  mode: z.literal('partner'),
});

export const microsoft365ConfigSchema = z.discriminatedUnion('mode', [
  microsoft365DirectSchema,
  microsoft365PartnerSchema,
]);

export type Microsoft365DirectInput = z.infer<typeof microsoft365DirectSchema>;
export type Microsoft365PartnerInput = z.infer<typeof microsoft365PartnerSchema>;
export type Microsoft365ConfigInput = z.infer<typeof microsoft365ConfigSchema>;
