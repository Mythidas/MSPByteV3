export type FieldType = "boolean" | "string" | "number" | "enum" | "object";

export type FieldDefinition = {
  type: FieldType;
  label: string;
  modality: "single" | "array";
  description?: string;
  // For enum fields
  options?: { value: string; label: string }[];
  // For object/array fields — nested schema
  fields?: SchemaFields;
  // Dotted path to the value in the Supabase table
  // e.g. 'm365_exchange_config.reject_direct_send'
  ingestPath: string;
  // Whether this field is suitable for compliance tracking
  trackable: boolean;
};

export type SchemaFields = Record<string, FieldDefinition>;

export type SchemaDefinition = {
  integrationId: string;
  label: string;
  groups: Record<
    string,
    {
      label: string;
      fields: SchemaFields;
    }
  >;
};

export class SchemaRegistry {
  private static schemas = new Map<string, SchemaDefinition>();

  static register(schema: SchemaDefinition): void {
    this.schemas.set(schema.integrationId, schema);
  }

  static get(integrationId: string): SchemaDefinition | undefined {
    return this.schemas.get(integrationId);
  }

  static getAll(): SchemaDefinition[] {
    return Array.from(this.schemas.values());
  }

  // Returns all trackable fields across all integrations — used by compliance UI
  static getTrackableFields(): {
    integrationId: string;
    groupKey: string;
    fieldKey: string;
    field: FieldDefinition;
  }[] {
    const results = [];
    for (const schema of this.schemas.values()) {
      for (const [groupKey, group] of Object.entries(schema.groups)) {
        for (const [fieldKey, field] of Object.entries(group.fields)) {
          if (field.trackable) {
            results.push({
              integrationId: schema.integrationId,
              groupKey,
              fieldKey,
              field,
            });
          }
        }
      }
    }
    return results;
  }
}
