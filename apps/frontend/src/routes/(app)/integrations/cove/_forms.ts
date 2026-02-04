import { z } from "zod";

export const coveConfigSchema = z.object({
  server: z.url("Please enter a valid server URL"),
  partnerId: z.number().min(0, "Partner ID is required"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
});
export type CoveConfigInput = z.infer<typeof coveConfigSchema>;
