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
          tenant_id: string
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
          tenant_id: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "agent_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tickets: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          meta: Json | null
          site_id: string
          summary: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          site_id: string
          summary?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          site_id?: string
          summary?: string | null
          tenant_id?: string
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
          {
            foreignKeyName: "agent_tickets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
            foreignKeyName: "agents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_definitions: {
        Row: {
          created_at: string
          description: string
          id: string
          integration_id: string
          message_template: string
          name: string
          severity: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          integration_id: string
          message_template: string
          name: string
          severity?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          integration_id?: string
          message_template?: string
          name?: string
          severity?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          created_at: string | null
          definition_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          last_seen_at: string | null
          link_id: string | null
          message: string
          metadata: Json | null
          resolved_at: string | null
          site_id: string | null
          status: string
          suppressed_at: string | null
          suppressed_by: string | null
          suppressed_until: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          definition_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_seen_at?: string | null
          link_id?: string | null
          message: string
          metadata?: Json | null
          resolved_at?: string | null
          site_id?: string | null
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          suppressed_until?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          definition_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          last_seen_at?: string | null
          link_id?: string | null
          message?: string
          metadata?: Json | null
          resolved_at?: string | null
          site_id?: string | null
          status?: string
          suppressed_at?: string | null
          suppressed_by?: string | null
          suppressed_until?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "alert_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "integration_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor: string
          created_at: string
          id: string
          meta: Json | null
          result: string
          target_id: string
          target_type: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          id?: string
          meta?: Json | null
          result: string
          target_id: string
          target_type: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          id?: string
          meta?: Json | null
          result?: string
          target_id?: string
          target_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostic_logs: {
        Row: {
          context: string
          created_at: string
          id: string
          level: string
          message: string
          meta: Json | null
          module: string
          tenant_id: string
        }
        Insert: {
          context: string
          created_at?: string
          id?: string
          level: string
          message: string
          meta?: Json | null
          module: string
          tenant_id: string
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          meta?: Json | null
          module?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diagnostic_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_jobs: {
        Row: {
          bullmq_job_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          ingest_id: string
          ingest_type: Database["public"]["Enums"]["IngestType"]
          integration_id: string
          link_id: string | null
          metrics: Json | null
          priority: number
          scheduled_for: string | null
          site_id: string | null
          started_at: string | null
          status: string
          tenant_id: string
          trigger: string
          updated_at: string
        }
        Insert: {
          bullmq_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ingest_id?: string
          ingest_type: Database["public"]["Enums"]["IngestType"]
          integration_id: string
          link_id?: string | null
          metrics?: Json | null
          priority?: number
          scheduled_for?: string | null
          site_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id: string
          trigger?: string
          updated_at?: string
        }
        Update: {
          bullmq_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          ingest_id?: string
          ingest_type?: Database["public"]["Enums"]["IngestType"]
          integration_id?: string
          link_id?: string | null
          metrics?: Json | null
          priority?: number
          scheduled_for?: string | null
          site_id?: string | null
          started_at?: string | null
          status?: string
          tenant_id?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_jobs_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "integration_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_sync_states: {
        Row: {
          id: string
          ingest_type: Database["public"]["Enums"]["IngestType"]
          integration_id: string
          last_job_id: string | null
          last_synced_at: string
          link_id: string | null
          metadata: Json
          tenant_id: string
        }
        Insert: {
          id?: string
          ingest_type: Database["public"]["Enums"]["IngestType"]
          integration_id: string
          last_job_id?: string | null
          last_synced_at: string
          link_id?: string | null
          metadata?: Json
          tenant_id: string
        }
        Update: {
          id?: string
          ingest_type?: Database["public"]["Enums"]["IngestType"]
          integration_id?: string
          last_job_id?: string | null
          last_synced_at?: string
          link_id?: string | null
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingest_sync_states_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "ingest_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_sync_states_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "integration_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingest_sync_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_links: {
        Row: {
          created_at: string
          external_id: string
          id: string
          integration_id: string
          meta: Json | null
          name: string | null
          site_id: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          integration_id: string
          meta?: Json | null
          name?: string | null
          site_id?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          integration_id?: string
          meta?: Json | null
          name?: string | null
          site_id?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json
          created_at: string
          deleted_at: string | null
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          deleted_at?: string | null
          id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
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
          level: number
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          description?: string | null
          id?: string
          level?: number
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          description?: string | null
          id?: string
          level?: number
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
      tag_definitions: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          integration_id: string
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          integration_id: string
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          integration_id?: string
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          definition_id: string
          entity_id: string
          entity_type: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          entity_id: string
          entity_type: string
          id?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          entity_id?: string
          entity_type?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "tag_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_run_nodes: {
        Row: {
          affected_entity_cardinality: string | null
          affected_entity_ids: Json
          affected_entity_type: string | null
          category: string
          completed_at: string | null
          duration_ms: number | null
          error: string | null
          id: string
          input: Json
          integration: string | null
          metrics: Json
          node_id: string
          node_label: string
          node_ref: string
          output: Json
          run_id: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          affected_entity_cardinality?: string | null
          affected_entity_ids?: Json
          affected_entity_type?: string | null
          category: string
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json
          integration?: string | null
          metrics?: Json
          node_id: string
          node_label: string
          node_ref: string
          output?: Json
          run_id: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          affected_entity_cardinality?: string | null
          affected_entity_ids?: Json
          affected_entity_type?: string | null
          category?: string
          completed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json
          integration?: string | null
          metrics?: Json
          node_id?: string
          node_label?: string
          node_ref?: string
          output?: Json
          run_id?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_run_nodes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "task_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_run_nodes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          seed: Json
          started_at: string | null
          status: string
          task_id: string | null
          tenant_id: string
          triggered_by: string
          triggered_by_user: string | null
          workflow_id: string
          workflow_snapshot: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          seed?: Json
          started_at?: string | null
          status?: string
          task_id?: string | null
          tenant_id: string
          triggered_by: string
          triggered_by_user?: string | null
          workflow_id: string
          workflow_snapshot: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          seed?: Json
          started_at?: string | null
          status?: string
          task_id?: string | null
          tenant_id?: string
          triggered_by?: string
          triggered_by_user?: string | null
          workflow_id?: string
          workflow_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "task_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_runs_triggered_by_user_fkey"
            columns: ["triggered_by_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          next_run_at: string | null
          param_defaults: Json
          schedule: Json | null
          scope: Json
          tenant_id: string
          trigger_type: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          param_defaults?: Json
          schedule?: Json | null
          scope?: Json
          tenant_id: string
          trigger_type?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          param_defaults?: Json
          schedule?: Json | null
          scope?: Json
          tenant_id?: string
          trigger_type?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          owner: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_owner_fkey"
            columns: ["owner"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
          id?: string
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
      workflows: {
        Row: {
          created_at: string
          description: string | null
          graph: Json
          id: string
          is_managed: boolean
          name: string
          params_schema: Json
          tags: string[]
          target_entity_type: string
          target_scope_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          graph?: Json
          id?: string
          is_managed?: boolean
          name: string
          params_schema?: Json
          tags?: string[]
          target_entity_type: string
          target_scope_type: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          graph?: Json
          id?: string
          is_managed?: boolean
          name?: string
          params_schema?: Json
          tags?: string[]
          target_entity_type?: string
          target_scope_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tenant_id_fkey"
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
      current_tenant_id: { Args: never; Returns: string }
      current_user_has_permission: { Args: { perm: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      IngestType:
        | "sites"
        | "endpoints"
        | "firewalls"
        | "licenses"
        | "identities"
        | "groups"
        | "roles"
        | "policies"
        | "tickets"
        | "exchange-config"
        | "link-identity-groups"
        | "link-identity-roles"
        | "link-policies"
        | "enrich-mfa-enforced"
        | "link-site-endpoints"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  vendors: {
    Tables: {
      cove_endpoints: {
        Row: {
          created_at: string
          data_hash: string
          endpoint_name: string
          errors: number
          external_id: string
          hostname: string
          id: string
          ingest_id: string | null
          last_28_days: string
          last_seen_at: string
          last_success_at: string | null
          link_id: string
          lsv_status: string | null
          profile: string
          retention_policy: string
          selected_size: number
          site_id: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
          used_storage: number
        }
        Insert: {
          created_at?: string
          data_hash: string
          endpoint_name: string
          errors: number
          external_id: string
          hostname: string
          id?: string
          ingest_id?: string | null
          last_28_days: string
          last_seen_at?: string
          last_success_at?: string | null
          link_id: string
          lsv_status?: string | null
          profile: string
          retention_policy: string
          selected_size: number
          site_id?: string | null
          status: string
          tenant_id: string
          type: string
          updated_at?: string
          used_storage: number
        }
        Update: {
          created_at?: string
          data_hash?: string
          endpoint_name?: string
          errors?: number
          external_id?: string
          hostname?: string
          id?: string
          ingest_id?: string | null
          last_28_days?: string
          last_seen_at?: string
          last_success_at?: string | null
          link_id?: string
          lsv_status?: string | null
          profile?: string
          retention_policy?: string
          selected_size?: number
          site_id?: string | null
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
          used_storage?: number
        }
        Relationships: []
      }
      cove_site_endpoints: {
        Row: {
          created_at: string
          endpoint_id: string
          last_seen_at: string
          link_id: string
          site_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          last_seen_at?: string
          link_id: string
          site_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          last_seen_at?: string
          link_id?: string
          site_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cove_site_endpoints_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "cove_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cove_site_endpoints_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "cove_endpoints_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cove_site_endpoints_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "cove_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      cove_sites: {
        Row: {
          created_at: string
          data_hash: string
          external_id: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          name: string
          site_id: string | null
          tenant_id: string
          uid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_hash: string
          external_id: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          name: string
          site_id?: string | null
          tenant_id: string
          uid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_hash?: string
          external_id?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          name?: string
          site_id?: string | null
          tenant_id?: string
          uid?: string
          updated_at?: string
        }
        Relationships: []
      }
      datto_endpoints: {
        Row: {
          category: string
          created_at: string
          data_hash: string
          ext_address: string
          external_id: string
          hostname: string
          id: string
          ingest_id: string | null
          ip_address: string
          last_reboot_at: string
          last_seen_at: string
          link_id: string
          online: boolean
          os: string
          site_id: string | null
          tenant_id: string
          udfs: Json
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          data_hash: string
          ext_address: string
          external_id: string
          hostname: string
          id?: string
          ingest_id?: string | null
          ip_address: string
          last_reboot_at: string
          last_seen_at?: string
          link_id: string
          online: boolean
          os: string
          site_id?: string | null
          tenant_id: string
          udfs: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          data_hash?: string
          ext_address?: string
          external_id?: string
          hostname?: string
          id?: string
          ingest_id?: string | null
          ip_address?: string
          last_reboot_at?: string
          last_seen_at?: string
          link_id?: string
          online?: boolean
          os?: string
          site_id?: string | null
          tenant_id?: string
          udfs?: Json
          updated_at?: string
        }
        Relationships: []
      }
      datto_site_endpoints: {
        Row: {
          created_at: string
          endpoint_id: string
          last_seen_at: string
          link_id: string
          site_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          last_seen_at?: string
          link_id: string
          site_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          last_seen_at?: string
          link_id?: string
          site_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "datto_site_endpoints_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "datto_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datto_site_endpoints_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "datto_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      datto_sites: {
        Row: {
          created_at: string
          data_hash: string
          external_id: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          name: string
          site_id: string | null
          site_variables: Json
          status: string
          tenant_id: string
          uid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_hash: string
          external_id: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          name: string
          site_id?: string | null
          site_variables: Json
          status: string
          tenant_id: string
          uid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_hash?: string
          external_id?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          name?: string
          site_id?: string | null
          site_variables?: Json
          status?: string
          tenant_id?: string
          uid?: string
          updated_at?: string
        }
        Relationships: []
      }
      m365_exchange_configs: {
        Row: {
          created_at: string
          data_hash: string
          external_id: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          reject_direct_send: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_hash: string
          external_id: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          reject_direct_send: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_hash?: string
          external_id?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          reject_direct_send?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      m365_groups: {
        Row: {
          created_at: string
          data_hash: string
          description: string | null
          external_id: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          mail_enabled: boolean
          name: string
          security_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_hash: string
          description?: string | null
          external_id: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          mail_enabled: boolean
          name: string
          security_enabled: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_hash?: string
          description?: string | null
          external_id?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          mail_enabled?: boolean
          name?: string
          security_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      m365_identities: {
        Row: {
          assigned_licenses: string[] | null
          created_at: string
          data_hash: string
          email: string
          enabled: boolean
          external_id: string
          id: string
          ingest_id: string | null
          last_non_interactive_sign_in_at: string | null
          last_seen_at: string
          last_sign_in_at: string | null
          link_id: string
          mfa_enforced: boolean
          name: string
          site_id: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_licenses?: string[] | null
          created_at?: string
          data_hash: string
          email: string
          enabled: boolean
          external_id: string
          id?: string
          ingest_id?: string | null
          last_non_interactive_sign_in_at?: string | null
          last_seen_at?: string
          last_sign_in_at?: string | null
          link_id: string
          mfa_enforced?: boolean
          name: string
          site_id?: string | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          assigned_licenses?: string[] | null
          created_at?: string
          data_hash?: string
          email?: string
          enabled?: boolean
          external_id?: string
          id?: string
          ingest_id?: string | null
          last_non_interactive_sign_in_at?: string | null
          last_seen_at?: string
          last_sign_in_at?: string | null
          link_id?: string
          mfa_enforced?: boolean
          name?: string
          site_id?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      m365_identity_groups: {
        Row: {
          created_at: string
          group_id: string
          identity_id: string
          last_seen_at: string
          link_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          identity_id: string
          last_seen_at?: string
          link_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          identity_id?: string
          last_seen_at?: string
          link_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_identity_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "m365_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_identity_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "m365_groups_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_identity_groups_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "m365_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_identity_groups_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "m365_identities_view"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_identity_roles: {
        Row: {
          created_at: string
          identity_id: string
          last_seen_at: string
          link_id: string
          role_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          identity_id: string
          last_seen_at?: string
          link_id: string
          role_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          identity_id?: string
          last_seen_at?: string
          link_id?: string
          role_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_identity_roles_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "m365_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_identity_roles_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "m365_identities_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_identity_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "m365_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_identity_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "m365_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_licenses: {
        Row: {
          consumed_units: number
          created_at: string
          data_hash: string
          enabled: boolean
          external_id: string
          friendly_name: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          locked_out_units: number
          service_plan_names: string[] | null
          sku_id: string
          sku_part_number: string
          suspended_units: number
          tenant_id: string
          total_units: number
          updated_at: string
          warning_units: number
        }
        Insert: {
          consumed_units: number
          created_at?: string
          data_hash: string
          enabled: boolean
          external_id: string
          friendly_name: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          locked_out_units: number
          service_plan_names?: string[] | null
          sku_id: string
          sku_part_number: string
          suspended_units: number
          tenant_id: string
          total_units: number
          updated_at?: string
          warning_units: number
        }
        Update: {
          consumed_units?: number
          created_at?: string
          data_hash?: string
          enabled?: boolean
          external_id?: string
          friendly_name?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          locked_out_units?: number
          service_plan_names?: string[] | null
          sku_id?: string
          sku_part_number?: string
          suspended_units?: number
          tenant_id?: string
          total_units?: number
          updated_at?: string
          warning_units?: number
        }
        Relationships: []
      }
      m365_policies: {
        Row: {
          conditions: Json | null
          created_at: string
          data_hash: string
          description: string | null
          external_id: string
          grant_controls: Json | null
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          name: string
          policy_state: string
          requires_mfa: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          data_hash: string
          description?: string | null
          external_id: string
          grant_controls?: Json | null
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          name: string
          policy_state: string
          requires_mfa: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          data_hash?: string
          description?: string | null
          external_id?: string
          grant_controls?: Json | null
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          name?: string
          policy_state?: string
          requires_mfa?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      m365_policy_groups: {
        Row: {
          created_at: string
          group_id: string
          included: boolean
          last_seen_at: string
          link_id: string
          policy_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          included: boolean
          last_seen_at?: string
          link_id: string
          policy_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          included?: boolean
          last_seen_at?: string
          link_id?: string
          policy_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_policy_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "m365_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "m365_groups_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_groups_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "m365_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_groups_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "m365_policies_view"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_policy_identities: {
        Row: {
          created_at: string
          identity_id: string
          included: boolean
          last_seen_at: string
          link_id: string
          policy_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          identity_id: string
          included: boolean
          last_seen_at?: string
          link_id: string
          policy_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          identity_id?: string
          included?: boolean
          last_seen_at?: string
          link_id?: string
          policy_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_policy_identities_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "m365_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_identities_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "m365_identities_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_identities_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "m365_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_identities_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "m365_policies_view"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_policy_roles: {
        Row: {
          created_at: string
          included: boolean
          last_seen_at: string
          link_id: string
          policy_id: string
          role_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          included: boolean
          last_seen_at?: string
          link_id: string
          policy_id: string
          role_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          included?: boolean
          last_seen_at?: string
          link_id?: string
          policy_id?: string
          role_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m365_policy_roles_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "m365_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_roles_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "m365_policies_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "m365_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "m365_policy_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "m365_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
      m365_roles: {
        Row: {
          created_at: string
          data_hash: string
          description: string | null
          external_id: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          name: string
          role_template_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_hash: string
          description?: string | null
          external_id: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          name: string
          role_template_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_hash?: string
          description?: string | null
          external_id?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          name?: string
          role_template_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sophos_endpoints: {
        Row: {
          created_at: string
          data_hash: string
          external_id: string
          has_mdr: boolean
          health: string
          hostname: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          lockdown: string
          needs_upgrade: boolean
          online: boolean
          os_name: string
          platform: string
          site_id: string | null
          tamper_protection_enabled: boolean
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_hash: string
          external_id: string
          has_mdr: boolean
          health: string
          hostname: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          lockdown: string
          needs_upgrade: boolean
          online: boolean
          os_name: string
          platform: string
          site_id?: string | null
          tamper_protection_enabled: boolean
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_hash?: string
          external_id?: string
          has_mdr?: boolean
          health?: string
          hostname?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          lockdown?: string
          needs_upgrade?: boolean
          online?: boolean
          os_name?: string
          platform?: string
          site_id?: string | null
          tamper_protection_enabled?: boolean
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      sophos_site_endpoints: {
        Row: {
          created_at: string
          endpoint_id: string
          last_seen_at: string
          link_id: string
          site_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          endpoint_id: string
          last_seen_at?: string
          link_id: string
          site_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          endpoint_id?: string
          last_seen_at?: string
          link_id?: string
          site_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sophos_site_endpoints_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "sophos_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sophos_site_endpoints_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sophos_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sophos_sites: {
        Row: {
          api_host: string
          created_at: string
          data_hash: string
          external_id: string
          id: string
          ingest_id: string | null
          last_seen_at: string
          link_id: string
          name: string
          products: string[]
          show_as_name: string
          site_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_host: string
          created_at?: string
          data_hash: string
          external_id: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id: string
          name: string
          products: string[]
          show_as_name: string
          site_id?: string | null
          status: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_host?: string
          created_at?: string
          data_hash?: string
          external_id?: string
          id?: string
          ingest_id?: string | null
          last_seen_at?: string
          link_id?: string
          name?: string
          products?: string[]
          show_as_name?: string
          site_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      cove_endpoints_view: {
        Row: {
          created_at: string | null
          data_hash: string | null
          endpoint_name: string | null
          errors: number | null
          external_id: string | null
          hostname: string | null
          id: string | null
          ingest_id: string | null
          last_28_days: string | null
          last_seen_at: string | null
          last_success_at: string | null
          link_id: string | null
          link_name: string | null
          lsv_status: string | null
          profile: string | null
          retention_policy: string | null
          selected_size: number | null
          site_id: string | null
          site_name: string | null
          state: string | null
          status: string | null
          tenant_id: string | null
          type: string | null
          updated_at: string | null
          used_storage: number | null
        }
        Relationships: []
      }
      m365_exchange_configs_view: {
        Row: {
          created_at: string | null
          data_hash: string | null
          external_id: string | null
          id: string | null
          ingest_id: string | null
          last_seen_at: string | null
          link_id: string | null
          link_name: string | null
          reject_direct_send: boolean | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      m365_groups_view: {
        Row: {
          created_at: string | null
          data_hash: string | null
          description: string | null
          external_id: string | null
          id: string | null
          ingest_id: string | null
          last_seen_at: string | null
          link_id: string | null
          link_name: string | null
          mail_enabled: boolean | null
          member_count: number | null
          name: string | null
          security_enabled: boolean | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      m365_identities_view: {
        Row: {
          alert_count: number | null
          assigned_licenses: string[] | null
          created_at: string | null
          data_hash: string | null
          email: string | null
          enabled: boolean | null
          external_id: string | null
          group_count: number | null
          id: string | null
          ingest_id: string | null
          last_non_interactive_sign_in_at: string | null
          last_seen_at: string | null
          last_sign_in_at: string | null
          link_id: string | null
          link_name: string | null
          mfa_enforced: boolean | null
          name: string | null
          site_id: string | null
          site_name: string | null
          state: string | null
          tenant_id: string | null
          type: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      m365_licenses_view: {
        Row: {
          available_units: number | null
          consumed_units: number | null
          created_at: string | null
          data_hash: string | null
          enabled: boolean | null
          external_id: string | null
          friendly_name: string | null
          id: string | null
          ingest_id: string | null
          last_seen_at: string | null
          link_id: string | null
          link_name: string | null
          locked_out_units: number | null
          service_plan_names: string[] | null
          sku_id: string | null
          sku_part_number: string | null
          suspended_units: number | null
          tenant_id: string | null
          total_units: number | null
          updated_at: string | null
          warning_units: number | null
        }
        Relationships: []
      }
      m365_policies_view: {
        Row: {
          conditions: Json | null
          created_at: string | null
          data_hash: string | null
          description: string | null
          external_id: string | null
          grant_controls: Json | null
          id: string | null
          ingest_id: string | null
          last_seen_at: string | null
          link_id: string | null
          link_name: string | null
          name: string | null
          policy_state: string | null
          requires_mfa: boolean | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      m365_roles_view: {
        Row: {
          created_at: string | null
          data_hash: string | null
          description: string | null
          external_id: string | null
          id: string | null
          ingest_id: string | null
          last_seen_at: string | null
          link_id: string | null
          link_name: string | null
          member_count: number | null
          name: string | null
          role_template_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
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
  views: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      d_agent_tickets_view: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          created_at: string | null
          id: string | null
          meta: Json | null
          site_id: string | null
          site_name: string | null
          summary: string | null
          tenant_id: string | null
          ticket_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tickets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "d_agents_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_tickets_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "d_sites_view"
            referencedColumns: ["id"]
          },
        ]
      }
      d_agents_view: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          ext_address: string | null
          guid: string | null
          hostname: string | null
          id: string | null
          ip_address: string | null
          mac_address: string | null
          platform: string | null
          registered_at: string | null
          site_id: string | null
          site_name: string | null
          tenant_id: string | null
          updated_at: string | null
          version: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "d_sites_view"
            referencedColumns: ["id"]
          },
        ]
      }
      d_alerts_view: {
        Row: {
          created_at: string | null
          definition_id: string | null
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string | null
          last_seen_at: string | null
          link_id: string | null
          link_name: string | null
          message: string | null
          metadata: Json | null
          name: string | null
          resolved_at: string | null
          severity: string | null
          site_id: string | null
          site_name: string | null
          status: string | null
          suppressed_at: string | null
          suppressed_by: string | null
          suppressed_until: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "d_sites_view"
            referencedColumns: ["id"]
          },
        ]
      }
      d_roles_view: {
        Row: {
          attributes: Json | null
          created_at: string | null
          description: string | null
          id: string | null
          level: number | null
          name: string | null
          tenant_id: string | null
          updated_at: string | null
          user_count: number | null
        }
        Relationships: []
      }
      d_sites_view: {
        Row: {
          created_at: string | null
          id: string | null
          mapped_integrations: string[] | null
          name: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      d_users_view: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string | null
          last_name: string | null
          preferences: Json | null
          role_id: string | null
          role_name: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "d_roles_view"
            referencedColumns: ["id"]
          },
        ]
      }
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
    Enums: {
      IngestType: [
        "sites",
        "endpoints",
        "firewalls",
        "licenses",
        "identities",
        "groups",
        "roles",
        "policies",
        "tickets",
        "exchange-config",
        "link-identity-groups",
        "link-identity-roles",
        "link-policies",
        "enrich-mfa-enforced",
        "link-site-endpoints",
      ],
    },
  },
  vendors: {
    Enums: {},
  },
  views: {
    Enums: {},
  },
} as const
