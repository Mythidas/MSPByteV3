import { z } from "zod";

export const sophosConfigSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
});
export type SophosConfigInput = z.infer<typeof sophosConfigSchema>;
