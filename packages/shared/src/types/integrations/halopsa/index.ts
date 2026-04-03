import z from "zod";

export const HaloPSAConfigSchema = z.object({
  url: z.string(),
  clientId: z.string(),
  clientSecret: z.string(),
});
export type HaloPSAConfig = z.infer<typeof HaloPSAConfigSchema>;

export type HaloPSAPagination = {
  page_no: number;
  page_size: number;
  record_count: number;
};
