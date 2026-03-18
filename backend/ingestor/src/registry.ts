import type { IntegrationId } from "@workspace/core/types/integrations";
import type { IngestorDefinition } from "./interfaces.js";

class IntegrationRegistry {
  private definitions = new Map<IntegrationId, IngestorDefinition>();

  register(def: IngestorDefinition): void {
    if (this.definitions.has(def.integrationId)) {
      throw new Error(`Integration already registered: ${def.integrationId}`);
    }
    this.definitions.set(def.integrationId, def);
  }

  get(id: IntegrationId): IngestorDefinition {
    const def = this.definitions.get(id);
    if (!def) throw new Error(`No ingestor registered for: ${id}`);
    return def;
  }

  getAll(): IngestorDefinition[] {
    return Array.from(this.definitions.values());
  }

  has(id: IntegrationId): boolean {
    return this.definitions.has(id);
  }
}

export const registry = new IntegrationRegistry();
