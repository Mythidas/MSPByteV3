import z from "zod";

export const MSGraphDelegatedRelationshipSchema = z.object({
  "@odata.type": z.literal("#microsoft.graph.delegatedAdminRelationship"),

  id: z.string(),
  status: z.string(),
  accessDetails: z.object({}),
  activatedDateTime: z.string().optional(),
  autoExtendDuration: z.string().optional(),
  createdDateTime: z.string(),
  customer: z.object({
    tenantId: z.string(),
    displayName: z.string(),
  }),
  displayName: z.string(),
  duration: z.string(),
  endDateTime: z.string().optional(),
  lastModifiedDateTime: z.string(),
});
export type MSGraphDelegatedRelationship = z.infer<
  typeof MSGraphDelegatedRelationshipSchema
>;
