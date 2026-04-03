import z from "zod";

export const MSGraphDomainSchema = z.object({
  id: z.string(),
  isDefault: z.boolean(),
  isVerified: z.boolean(),
  authenticationType: z.string(),
});
export type MSGraphDomain = z.infer<typeof MSGraphDomainSchema>;
