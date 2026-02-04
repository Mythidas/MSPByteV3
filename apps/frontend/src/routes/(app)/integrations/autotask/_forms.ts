import { z } from "zod";

export const autoTaskConfigSchema = z.object({
  server: z.url("Please enter a valid server URL"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  trackerId: z.string().min(1, "Tracker ID is required"),
});
export type AutoTaskConfigInput = z.infer<typeof autoTaskConfigSchema>;
