export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_logs: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          method: string
          site_id: string | null
          status: number
          time_elapsed_ms: number
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          method: string
          site_id?: string | null
          status: number
          time_elapsed_ms: number
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          method?: string
          site_id?: string | null
          status?: number
          time_elapsed_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tickets: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          site_id: string
          ticket_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          site_id: string
          ticket_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          site_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tickets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          deleted_at: string
          ext_address: string | null
          guid: string
          hostname: string
          id: string
          ip_address: string | null
          mac_address: string | null
          platform: string
          registered_at: string
          site_id: string
          tenant_id: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          ext_address?: string | null
          guid: string
          hostname: string
          id?: string
          ip_address?: string | null
          mac_address?: string | null
          platform: string
          registered_at?: string
          site_id: string
          tenant_id: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          deleted_at?: string
          ext_address?: string | null
          guid?: string
          hostname?: string
          id?: string
          ip_address?: string | null
          mac_address?: string | null
          platform?: string
          registered_at?: string
          site_id?: string
          tenant_id?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          created_at: string
          data_hash: string
          display_name: string | null
          entity_type: string
          external_id: string
          id: string
          integration_id: string
          last_seen_at: string
          raw_data: Json
          site_id: string | null
          state: string
          sync_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_hash: string
          display_name?: string | null
          entity_type: string
          external_id: string
          id?: string
          integration_id: string
          last_seen_at?: string
          raw_data: Json
          site_id?: string | null
          state?: string
          sync_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_hash?: string
          display_name?: string | null
          entity_type?: string
          external_id?: string
          id?: string
          integration_id?: string
          last_seen_at?: string
          raw_data?: Json
          site_id?: string | null
          state?: string
          sync_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_alerts: {
        Row: {
          alert_type: string
          created_at: string
          entity_id: string
          fingerprint: string
          id: string
          integration_id: string
          last_seen_at: string
          message: string
          metadata: Json | null
          resolved_at: string | null
          severity: string
          site_id: string | null
          status: string
          suppressed_at: string | null
          suppressed_by: string | null
          sync_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          entity_id: string
          fingerprint: string
          id?: string
          integration_id: string
          last_seen_at?: string
          message: string
          metadata?: Json | null
          resolved_at?: string | null
          severity: string
          site_id?: string | null
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          sync_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          entity_id?: string
          fingerprint?: string
          id?: string
          integration_id?: string
          last_seen_at?: string
          message?: string
          metadata?: Json | null
          resolved_at?: string | null
          severity?: string
          site_id?: string | null
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          sync_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_alerts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_alerts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_alerts_suppressed_by_fkey"
            columns: ["suppressed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relationships: {
        Row: {
          child_entity_id: string
          created_at: string
          id: string
          integration_id: string
          last_seen_at: string
          metadata: Json | null
          parent_entity_id: string
          relationship_type: string
          sync_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          child_entity_id: string
          created_at?: string
          id?: string
          integration_id: string
          last_seen_at?: string
          metadata?: Json | null
          parent_entity_id: string
          relationship_type: string
          sync_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          child_entity_id?: string
          created_at?: string
          id?: string
          integration_id?: string
          last_seen_at?: string
          metadata?: Json | null
          parent_entity_id?: string
          relationship_type?: string
          sync_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_child_entity_id_fkey"
            columns: ["child_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_tags: {
        Row: {
          category: string | null
          created_at: string
          entity_id: number
          id: number
          source: string | null
          tag: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          entity_id: number
          id?: never
          source?: string | null
          tag: string
        }
        Update: {
          category?: string | null
          created_at?: string
          entity_id?: number
          id?: never
          source?: string | null
          tag?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          attributes: Json
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      site_to_integration: {
        Row: {
          created_at: string
          external_id: string
          id: string
          integration_id: string
          site_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          integration_id: string
          site_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          integration_id?: string
          site_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_to_integration_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_to_integration_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_to_integration_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          created_at: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          bullmq_job_id: string | null
          completed_at: string | null
          created_at: string
          entity_type: string | null
          error: string | null
          id: string
          integration_id: string
          metrics: Json | null
          priority: number
          scheduled_for: string | null
          site_id: string | null
          started_at: string | null
          status: string
          sync_id: string
          tenant_id: string
          trigger: string
          updated_at: string
        }
        Insert: {
          bullmq_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          entity_type?: string | null
          error?: string | null
          id?: string
          integration_id: string
          metrics?: Json | null
          priority?: number
          scheduled_for?: string | null
          site_id?: string | null
          started_at?: string | null
          status?: string
          sync_id?: string
          tenant_id: string
          trigger?: string
          updated_at?: string
        }
        Update: {
          bullmq_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          entity_type?: string | null
          error?: string | null
          id?: string
          integration_id?: string
          metrics?: Json | null
          priority?: number
          scheduled_for?: string | null
          site_id?: string | null
          started_at?: string | null
          status?: string
          sync_id?: string
          tenant_id?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          preferences: Json
          role_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          id: string
          last_name: string
          preferences?: Json
          role_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          preferences?: Json
          role_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: number }
      current_user_has_permission: { Args: { perm: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  views: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
  views: {
    Enums: {},
  },
} as const
