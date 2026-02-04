import { z } from "zod";

export const dattoConfigSchema = z.object({
  url: z.url("Please enter a valid server URL"),
  apiKey: z.string().min(1, "API Key is required"),
  apiSecretKey: z.string().min(1, "API Secret Key is required"),
});
export type DattoRMMConfigInput = z.infer<typeof dattoConfigSchema>;
