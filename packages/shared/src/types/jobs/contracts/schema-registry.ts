export type FieldType = "boolean" | "string" | "number" | "enum" | "object";

export type FieldReference = {
  // Fully-qualified table: "vendors.m365_identities"
  table: string;
  // Column holding the stored value (e.g. the UUID in the JSONB array)
  valueColumn: string;
  // Column to display as human label in the UI
  labelColumn: string;
  // Hard-coded special tokens that are valid alongside real rows (e.g. "All")
  specialValues?: { value: string; label: string }[];
};

export type FieldDefinition = {
  type: FieldType;
  label: string;
  modality: "single" | "array";
  description?: string;
  // For enum fields
  options?: { value: string; label: string }[];
  // For object/array fields — nested schema
  required?: boolean;
  fields?: SchemaFields;
  // Dotted path to the value in the Supabase table
  // e.g. 'm365_exchange_config.reject_direct_send'
  ingestPath: string;
  // Whether this field is suitable for compliance tracking
  trackable: boolean;
  // Optional: cross-table reference for array-of-ID fields (UI hint only)
  reference?: FieldReference;
};

export type SchemaFields = Record<string, FieldDefinition>;

export type SchemaDefinition = {
  label: string;
  fields: SchemaFields;
};

// export class SchemaRegistry {
//   private static schemas = new Map<string, SchemaDefinition>();

//   static register(schema: SchemaDefinition): void {
//     this.schemas.set(schema.integrationId, schema);
//   }

//   static get(integrationId: string): SchemaDefinition | undefined {
//     return this.schemas.get(integrationId);
//   }

//   static getAll(): SchemaDefinition[] {
//     return Array.from(this.schemas.values());
//   }

//   // Returns all trackable fields across all integrations — used by compliance UI
//   static getTrackableFields(): {
//     integrationId: string;
//     fieldKey: string;
//     field: FieldDefinition;
//   }[] {
//     const results = [];
//     for (const schema of this.schemas.values()) {
//       for (const [fieldKey, field] of Object.entries(schema.fields)) {
//         if (field.trackable) {
//           results.push({
//             integrationId: schema.integrationId,
//             fieldKey,
//             field,
//           });
//         }
//       }
//     }
//     return results;
//   }
// }
