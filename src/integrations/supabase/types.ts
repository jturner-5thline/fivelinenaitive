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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          activity_type: string
          created_at: string
          deal_id: string
          description: string
          id: string
          metadata: Json | null
          user_display_name: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          deal_id: string
          description: string
          id?: string
          metadata?: Json | null
          user_display_name?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          deal_id?: string
          description?: string
          id?: string
          metadata?: Json | null
          user_display_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_name: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_name?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string
        }
        Relationships: []
      }
      agent_conversations: {
        Row: {
          agent_id: string
          context_deal_id: string | null
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          context_deal_id?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          context_deal_id?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_conversations_context_deal_id_fkey"
            columns: ["context_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_memory: {
        Row: {
          agent_id: string
          created_at: string
          expires_at: string | null
          id: string
          importance: number | null
          key: string
          memory_type: string
          metadata: Json | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          importance?: number | null
          key: string
          memory_type?: string
          metadata?: Json | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          importance?: number | null
          key?: string
          memory_type?: string
          metadata?: Json | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          action_result: Json | null
          agent_id: string
          completed_at: string | null
          created_at: string
          deal_id: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          input_context: Json | null
          lender_id: string | null
          output_content: string | null
          started_at: string | null
          status: string
          trigger_event: string | null
          trigger_id: string | null
          user_id: string
        }
        Insert: {
          action_result?: Json | null
          agent_id: string
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_context?: Json | null
          lender_id?: string | null
          output_content?: string | null
          started_at?: string | null
          status?: string
          trigger_event?: string | null
          trigger_id?: string | null
          user_id: string
        }
        Update: {
          action_result?: Json | null
          agent_id?: string
          completed_at?: string | null
          created_at?: string
          deal_id?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          input_context?: Json | null
          lender_id?: string | null
          output_content?: string | null
          started_at?: string | null
          status?: string
          trigger_event?: string | null
          trigger_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "deal_lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_trigger_id_fkey"
            columns: ["trigger_id"]
            isOneToOne: false
            referencedRelation: "agent_triggers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_suggestion_analytics: {
        Row: {
          action_type: string
          company_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          reasoning_length: number | null
          suggestion_category: string | null
          suggestion_id: string | null
          suggestion_name: string
          suggestion_priority: string | null
          time_to_action_seconds: number | null
          user_id: string
        }
        Insert: {
          action_type: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reasoning_length?: number | null
          suggestion_category?: string | null
          suggestion_id?: string | null
          suggestion_name: string
          suggestion_priority?: string | null
          time_to_action_seconds?: number | null
          user_id: string
        }
        Update: {
          action_type?: string
          company_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          reasoning_length?: number | null
          suggestion_category?: string | null
          suggestion_id?: string | null
          suggestion_name?: string
          suggestion_priority?: string | null
          time_to_action_seconds?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_suggestion_analytics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestion_analytics_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "agent_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_suggestions: {
        Row: {
          applied_at: string | null
          category: string | null
          company_id: string | null
          created_at: string
          description: string
          dismissed_at: string | null
          id: string
          insight_id: string | null
          is_applied: boolean
          is_dismissed: boolean
          name: string
          priority: string
          reasoning: string
          suggested_prompt: string | null
          suggested_triggers: Json | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description: string
          dismissed_at?: string | null
          id?: string
          insight_id?: string | null
          is_applied?: boolean
          is_dismissed?: boolean
          name: string
          priority?: string
          reasoning: string
          suggested_prompt?: string | null
          suggested_triggers?: Json | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string
          dismissed_at?: string | null
          id?: string
          insight_id?: string | null
          is_applied?: boolean
          is_dismissed?: boolean
          name?: string
          priority?: string
          reasoning?: string
          suggested_prompt?: string | null
          suggested_triggers?: Json | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestions_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "user_behavior_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_suggestions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "agent_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_templates: {
        Row: {
          avatar_emoji: string | null
          can_access_activities: boolean | null
          can_access_deals: boolean | null
          can_access_lenders: boolean | null
          can_access_milestones: boolean | null
          can_search_web: boolean | null
          category: string
          created_at: string
          description: string | null
          id: string
          is_featured: boolean | null
          name: string
          personality: string | null
          suggested_triggers: Json | null
          system_prompt: string
          temperature: number | null
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          avatar_emoji?: string | null
          can_access_activities?: boolean | null
          can_access_deals?: boolean | null
          can_access_lenders?: boolean | null
          can_access_milestones?: boolean | null
          can_search_web?: boolean | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean | null
          name: string
          personality?: string | null
          suggested_triggers?: Json | null
          system_prompt: string
          temperature?: number | null
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          avatar_emoji?: string | null
          can_access_activities?: boolean | null
          can_access_deals?: boolean | null
          can_access_lenders?: boolean | null
          can_access_milestones?: boolean | null
          can_search_web?: boolean | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_featured?: boolean | null
          name?: string
          personality?: string | null
          suggested_triggers?: Json | null
          system_prompt?: string
          temperature?: number | null
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      agent_triggers: {
        Row: {
          action_config: Json | null
          action_type: string
          agent_id: string
          conditions: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          next_scheduled_at: string | null
          schedule_cron: string | null
          schedule_timezone: string | null
          trigger_config: Json | null
          trigger_count: number | null
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_config?: Json | null
          action_type?: string
          agent_id: string
          conditions?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          next_scheduled_at?: string | null
          schedule_cron?: string | null
          schedule_timezone?: string | null
          trigger_config?: Json | null
          trigger_count?: number | null
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          agent_id?: string
          conditions?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          next_scheduled_at?: string | null
          schedule_cron?: string | null
          schedule_timezone?: string | null
          trigger_config?: Json | null
          trigger_count?: number | null
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_triggers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          avatar_emoji: string | null
          can_access_activities: boolean | null
          can_access_deals: boolean | null
          can_access_lenders: boolean | null
          can_access_milestones: boolean | null
          can_search_web: boolean | null
          company_id: string | null
          created_at: string
          description: string | null
          graph_config: Json | null
          id: string
          is_public: boolean | null
          is_shared: boolean | null
          last_used_at: string | null
          name: string
          personality: string | null
          system_prompt: string
          temperature: number | null
          updated_at: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          avatar_emoji?: string | null
          can_access_activities?: boolean | null
          can_access_deals?: boolean | null
          can_access_lenders?: boolean | null
          can_access_milestones?: boolean | null
          can_search_web?: boolean | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          graph_config?: Json | null
          id?: string
          is_public?: boolean | null
          is_shared?: boolean | null
          last_used_at?: string | null
          name: string
          personality?: string | null
          system_prompt: string
          temperature?: number | null
          updated_at?: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          avatar_emoji?: string | null
          can_access_activities?: boolean | null
          can_access_deals?: boolean | null
          can_access_lenders?: boolean | null
          can_access_milestones?: boolean | null
          can_search_web?: boolean | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          graph_config?: Json | null
          id?: string
          is_public?: boolean | null
          is_shared?: boolean | null
          last_used_at?: string | null
          name?: string
          personality?: string | null
          system_prompt?: string
          temperature?: number | null
          updated_at?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_sections: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          enabled: boolean | null
          fields: Json | null
          id: string
          qualifiers: Json | null
          section_id: string
          sort_order: number
          subsections: Json | null
          template_id: string
          template_text: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          fields?: Json | null
          id?: string
          qualifiers?: Json | null
          section_id: string
          sort_order: number
          subsections?: Json | null
          template_id: string
          template_text?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          enabled?: boolean | null
          fields?: Json | null
          id?: string
          qualifiers?: Json | null
          section_id?: string
          sort_order?: number
          subsections?: Json | null
          template_id?: string
          template_text?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "agreement_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_templates: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreement_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_field_mappings: {
        Row: {
          asana_field: string
          created_at: string
          id: string
          is_enabled: boolean
          platform_entity: string
          platform_field: string
          sync_config_id: string
          transform_config: Json | null
          transform_type: string | null
        }
        Insert: {
          asana_field: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          platform_entity?: string
          platform_field: string
          sync_config_id: string
          transform_config?: Json | null
          transform_type?: string | null
        }
        Update: {
          asana_field?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          platform_entity?: string
          platform_field?: string
          sync_config_id?: string
          transform_config?: Json | null
          transform_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asana_field_mappings_sync_config_id_fkey"
            columns: ["sync_config_id"]
            isOneToOne: false
            referencedRelation: "asana_sync_config"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_project_filters: {
        Row: {
          asana_project_gid: string
          asana_project_name: string
          created_at: string
          id: string
          is_enabled: boolean
          map_to: string
          pipeline_id: string | null
          sync_config_id: string
        }
        Insert: {
          asana_project_gid: string
          asana_project_name: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          map_to?: string
          pipeline_id?: string | null
          sync_config_id: string
        }
        Update: {
          asana_project_gid?: string
          asana_project_name?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          map_to?: string
          pipeline_id?: string | null
          sync_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_project_filters_sync_config_id_fkey"
            columns: ["sync_config_id"]
            isOneToOne: false
            referencedRelation: "asana_sync_config"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_status_mappings: {
        Row: {
          asana_project_gid: string | null
          asana_section_name: string
          created_at: string
          id: string
          platform_entity: string
          platform_stage_id: string | null
          platform_status: string
          sync_config_id: string
        }
        Insert: {
          asana_project_gid?: string | null
          asana_section_name: string
          created_at?: string
          id?: string
          platform_entity?: string
          platform_stage_id?: string | null
          platform_status: string
          sync_config_id: string
        }
        Update: {
          asana_project_gid?: string | null
          asana_section_name?: string
          created_at?: string
          id?: string
          platform_entity?: string
          platform_stage_id?: string | null
          platform_status?: string
          sync_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_status_mappings_sync_config_id_fkey"
            columns: ["sync_config_id"]
            isOneToOne: false
            referencedRelation: "asana_sync_config"
            referencedColumns: ["id"]
          },
        ]
      }
      asana_sync_config: {
        Row: {
          auto_sync_enabled: boolean
          auto_sync_interval_minutes: number
          company_id: string | null
          created_at: string
          id: string
          integration_id: string
          sync_direction: string
          sync_on_task_complete: boolean
          sync_on_task_create: boolean
          sync_on_task_update: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_sync_enabled?: boolean
          auto_sync_interval_minutes?: number
          company_id?: string | null
          created_at?: string
          id?: string
          integration_id: string
          sync_direction?: string
          sync_on_task_complete?: boolean
          sync_on_task_create?: boolean
          sync_on_task_update?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_sync_enabled?: boolean
          auto_sync_interval_minutes?: number
          company_id?: string | null
          created_at?: string
          id?: string
          integration_id?: string
          sync_direction?: string
          sync_on_task_complete?: boolean
          sync_on_task_create?: boolean
          sync_on_task_update?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asana_sync_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asana_sync_config_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: true
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_integration_config: {
        Row: {
          company_id: string
          created_at: string
          excluded_title_patterns: string[]
          fallback_admin_user_id: string | null
          id: string
          internal_domains: string[]
          is_active: boolean
          min_duration_seconds: number
          task_expiry_days: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          excluded_title_patterns?: string[]
          fallback_admin_user_id?: string | null
          id?: string
          internal_domains?: string[]
          is_active?: boolean
          min_duration_seconds?: number
          task_expiry_days?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          excluded_title_patterns?: string[]
          fallback_admin_user_id?: string | null
          id?: string
          internal_domains?: string[]
          is_active?: boolean
          min_duration_seconds?: number
          task_expiry_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claap_integration_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_meeting_participants: {
        Row: {
          contact_id: string | null
          created_at: string
          domain: string | null
          email: string | null
          id: string
          is_internal: boolean | null
          meeting_id: string
          name: string | null
          resolved: boolean | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          is_internal?: boolean | null
          meeting_id: string
          name?: string | null
          resolved?: boolean | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          domain?: string | null
          email?: string | null
          id?: string
          is_internal?: boolean | null
          meeting_id?: string
          name?: string | null
          resolved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_meeting_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_meeting_participants_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "claap_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_meetings: {
        Row: {
          ai_summary: string | null
          claap_id: string
          company_id: string | null
          created_at: string
          deal_id: string | null
          duration_seconds: number | null
          exclusion_reason: string | null
          id: string
          key_decisions: string[] | null
          next_steps: string[] | null
          no_internal_participant: boolean | null
          organizer_email: string | null
          raw_payload: Json | null
          recording_url: string | null
          sentiment: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["claap_meeting_status"]
          title: string | null
          topics: string[] | null
          transcript: string | null
          transcript_missing: boolean | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          claap_id: string
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          exclusion_reason?: string | null
          id?: string
          key_decisions?: string[] | null
          next_steps?: string[] | null
          no_internal_participant?: boolean | null
          organizer_email?: string | null
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["claap_meeting_status"]
          title?: string | null
          topics?: string[] | null
          transcript?: string | null
          transcript_missing?: boolean | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          claap_id?: string
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          exclusion_reason?: string | null
          id?: string
          key_decisions?: string[] | null
          next_steps?: string[] | null
          no_internal_participant?: boolean | null
          organizer_email?: string | null
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["claap_meeting_status"]
          title?: string | null
          topics?: string[] | null
          transcript?: string | null
          transcript_missing?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claap_meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_routing_rules: {
        Row: {
          actions: Json
          company_id: string
          condition_logic: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          actions?: Json
          company_id: string
          condition_logic?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          actions?: Json
          company_id?: string
          condition_logic?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claap_routing_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_routing_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          meeting_id: string
          prefilled_data: Json | null
          resolved_data: Json | null
          status: Database["public"]["Enums"]["claap_task_status"]
          task_type: Database["public"]["Enums"]["claap_task_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          meeting_id: string
          prefilled_data?: Json | null
          resolved_data?: Json | null
          status?: Database["public"]["Enums"]["claap_task_status"]
          task_type: Database["public"]["Enums"]["claap_task_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          meeting_id?: string
          prefilled_data?: Json | null
          resolved_data?: Json | null
          status?: Database["public"]["Enums"]["claap_task_status"]
          task_type?: Database["public"]["Enums"]["claap_task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claap_routing_tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "claap_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_webhook_errors: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          id: string
          payload: Json | null
          resolved: boolean | null
          retry_count: number | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          resolved?: boolean | null
          retry_count?: number | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          resolved?: boolean | null
          retry_count?: number | null
        }
        Relationships: []
      }
      client_request_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          draft_id: string | null
          id: string
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          draft_id?: string | null
          id?: string
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          draft_id?: string | null
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_request_audit_log_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "client_request_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_request_drafts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_html: string
          body_text: string | null
          client_email: string | null
          client_name: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          id: string
          new_requests_pending: boolean
          rejected_at: string | null
          rejected_by: string | null
          rejection_notes: string | null
          request_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["client_draft_status"]
          subject: string | null
          thread_id: string | null
          trigger_reason: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_html: string
          body_text?: string | null
          client_email?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          id?: string
          new_requests_pending?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_notes?: string | null
          request_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["client_draft_status"]
          subject?: string | null
          thread_id?: string | null
          trigger_reason?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_html?: string
          body_text?: string | null
          client_email?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          id?: string
          new_requests_pending?: boolean
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_notes?: string | null
          request_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["client_draft_status"]
          subject?: string | null
          thread_id?: string | null
          trigger_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_request_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_request_drafts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          client_email: string | null
          client_name: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          draft_id: string | null
          id: string
          status: Database["public"]["Enums"]["client_request_status"]
          thread_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_email?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          draft_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["client_request_status"]
          thread_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          client_email?: string | null
          client_name?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          draft_id?: string | null
          id?: string
          status?: Database["public"]["Enums"]["client_request_status"]
          thread_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "client_request_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_reason: string | null
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          domains: string[] | null
          employee_size: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          primary_domain: string | null
          state: string | null
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domains?: string[] | null
          employee_size?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          primary_domain?: string | null
          state?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domains?: string[] | null
          employee_size?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          primary_domain?: string | null
          state?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      company_feature_overrides: {
        Row: {
          company_id: string
          created_at: string
          feature_key: string
          id: string
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          feature_key: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          feature_key?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_feature_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_features: {
        Row: {
          agreement_icon_visible: boolean
          company_id: string
          created_at: string
          deal_memo_enabled: boolean
          id: string
          sample_deal_on_signup: boolean
          timeline_view_enabled: boolean
          updated_at: string
          workflows_enabled: boolean
        }
        Insert: {
          agreement_icon_visible?: boolean
          company_id: string
          created_at?: string
          deal_memo_enabled?: boolean
          id?: string
          sample_deal_on_signup?: boolean
          timeline_view_enabled?: boolean
          updated_at?: string
          workflows_enabled?: boolean
        }
        Update: {
          agreement_icon_visible?: boolean
          company_id?: string
          created_at?: string
          deal_memo_enabled?: boolean
          id?: string
          sample_deal_on_signup?: boolean
          timeline_view_enabled?: boolean
          updated_at?: string
          workflows_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_invitations: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          email: string
          email_error: string | null
          email_sent_at: string | null
          email_status: string | null
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["company_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          email: string
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["company_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          email?: string
          email_error?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["company_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_join_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_by_user_id: string | null
          decision_at: string | null
          id: string
          note: string | null
          rejection_note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_by_user_id?: string | null
          decision_at?: string | null
          id?: string
          note?: string | null
          rejection_note?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_by_user_id?: string | null
          decision_at?: string | null
          id?: string
          note?: string | null
          rejection_note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_join_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          company_id: string
          created_at: string
          data_room_default_checklists: Json | null
          deal_info_layout: Json | null
          deal_panel_layout: Json | null
          deal_stages: Json | null
          deal_types: Json | null
          deals_special_widgets: Json | null
          deals_widgets_config: Json | null
          default_deal_stage_id: string | null
          disclaimer: string | null
          fpa_dashboard_config: Json | null
          id: string
          lender_matching_config: Json | null
          permission_settings: Json | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          data_room_default_checklists?: Json | null
          deal_info_layout?: Json | null
          deal_panel_layout?: Json | null
          deal_stages?: Json | null
          deal_types?: Json | null
          deals_special_widgets?: Json | null
          deals_widgets_config?: Json | null
          default_deal_stage_id?: string | null
          disclaimer?: string | null
          fpa_dashboard_config?: Json | null
          id?: string
          lender_matching_config?: Json | null
          permission_settings?: Json | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          data_room_default_checklists?: Json | null
          deal_info_layout?: Json | null
          deal_panel_layout?: Json | null
          deal_stages?: Json | null
          deal_types?: Json | null
          deals_special_widgets?: Json | null
          deals_widgets_config?: Json | null
          default_deal_stage_id?: string | null
          disclaimer?: string | null
          fpa_dashboard_config?: Json | null
          id?: string
          lender_matching_config?: Json | null
          permission_settings?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_write_up_fields: {
        Row: {
          company_id: string
          created_at: string
          field_key: string
          field_type: string
          id: string
          is_required: boolean
          is_visible: boolean
          label: string
          position: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_key: string
          field_type?: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          label: string
          position?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          label?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_write_up_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_activities: {
        Row: {
          activity_type: string
          body: string | null
          contact_id: string
          created_at: string
          deal_id: string | null
          id: string
          logged_by: string | null
          metadata: Json | null
          occurred_at: string
          source: string | null
          subject: string | null
        }
        Insert: {
          activity_type: string
          body?: string | null
          contact_id: string
          created_at?: string
          deal_id?: string | null
          id?: string
          logged_by?: string | null
          metadata?: Json | null
          occurred_at?: string
          source?: string | null
          subject?: string | null
        }
        Update: {
          activity_type?: string
          body?: string | null
          contact_id?: string
          created_at?: string
          deal_id?: string | null
          id?: string
          logged_by?: string | null
          metadata?: Json | null
          occurred_at?: string
          source?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_company_associations: {
        Row: {
          association_type: string | null
          company_id: string
          contact_id: string
          created_at: string
          id: string
          is_primary: boolean | null
        }
        Insert: {
          association_type?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
        }
        Update: {
          association_type?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_company_associations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_company_associations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_deals: {
        Row: {
          contact_id: string
          created_at: string
          deal_id: string
          id: string
          role: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          deal_id: string
          id?: string
          role?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          deal_id?: string
          id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_field_suggestion_audit: {
        Row: {
          action: string
          actor_user_id: string
          contact_id: string
          created_at: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          suggestion_id: string
        }
        Insert: {
          action: string
          actor_user_id: string
          contact_id: string
          created_at?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          suggestion_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          contact_id?: string
          created_at?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          suggestion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_field_suggestion_audit_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_field_suggestion_audit_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "contact_field_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_field_suggestions: {
        Row: {
          acted_at: string | null
          acted_by_user_id: string | null
          company_id: string
          confidence: number
          contact_id: string
          created_at: string | null
          current_value: string | null
          dedupe_key: string
          field_name: string
          id: string
          snoozed_until: string | null
          source_id: string | null
          source_snippet: string | null
          source_type: string
          status: string
          suggested_value: string
          updated_at: string | null
        }
        Insert: {
          acted_at?: string | null
          acted_by_user_id?: string | null
          company_id: string
          confidence: number
          contact_id: string
          created_at?: string | null
          current_value?: string | null
          dedupe_key: string
          field_name: string
          id?: string
          snoozed_until?: string | null
          source_id?: string | null
          source_snippet?: string | null
          source_type: string
          status?: string
          suggested_value: string
          updated_at?: string | null
        }
        Update: {
          acted_at?: string | null
          acted_by_user_id?: string | null
          company_id?: string
          confidence?: number
          contact_id?: string
          created_at?: string | null
          current_value?: string | null
          dedupe_key?: string
          field_name?: string
          id?: string
          snoozed_until?: string | null
          source_id?: string | null
          source_snippet?: string | null
          source_type?: string
          status?: string
          suggested_value?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_field_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_field_suggestions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          additional_emails: string[] | null
          ae_owner_id: string | null
          behavioral_score: number | null
          buying_role: Database["public"]["Enums"]["contact_buying_role"] | null
          campaign: string | null
          company_id: string | null
          contact_score: number | null
          created_at: string
          created_by: string | null
          crm_company_id: string | null
          custom_fields: Json | null
          department: string | null
          description: string | null
          email: string | null
          email_opt_in: boolean | null
          external_ids: Json | null
          first_name: string | null
          fit_score: number | null
          full_name: string | null
          hubspot_contact_id: string | null
          id: string
          job_title: string | null
          last_activity_date: string | null
          last_inbound_activity_date: string | null
          last_modified_by: string | null
          last_name: string | null
          last_outbound_touch_date: string | null
          lead_source: string | null
          lead_source_latest: string | null
          lead_source_original: string | null
          lifecycle_stage:
            | Database["public"]["Enums"]["contact_lifecycle_stage"]
            | null
          linkedin_url: string | null
          locale: string | null
          migrated_from_hubspot: boolean | null
          next_activity_date: string | null
          org_company_id: string | null
          owner_user_id: string | null
          phone_mobile: string | null
          phone_opt_in: boolean | null
          phone_other: string | null
          phone_work: string | null
          preferred_channel: string | null
          primary_company_id: string | null
          sdr_owner_id: string | null
          seniority: string | null
          sms_opt_in: boolean | null
          source_system: string | null
          status: Database["public"]["Enums"]["contact_status"] | null
          synced_with_hubspot: boolean | null
          tags: string[] | null
          timezone: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          website_url: string | null
        }
        Insert: {
          additional_emails?: string[] | null
          ae_owner_id?: string | null
          behavioral_score?: number | null
          buying_role?:
            | Database["public"]["Enums"]["contact_buying_role"]
            | null
          campaign?: string | null
          company_id?: string | null
          contact_score?: number | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          custom_fields?: Json | null
          department?: string | null
          description?: string | null
          email?: string | null
          email_opt_in?: boolean | null
          external_ids?: Json | null
          first_name?: string | null
          fit_score?: number | null
          full_name?: string | null
          hubspot_contact_id?: string | null
          id?: string
          job_title?: string | null
          last_activity_date?: string | null
          last_inbound_activity_date?: string | null
          last_modified_by?: string | null
          last_name?: string | null
          last_outbound_touch_date?: string | null
          lead_source?: string | null
          lead_source_latest?: string | null
          lead_source_original?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["contact_lifecycle_stage"]
            | null
          linkedin_url?: string | null
          locale?: string | null
          migrated_from_hubspot?: boolean | null
          next_activity_date?: string | null
          org_company_id?: string | null
          owner_user_id?: string | null
          phone_mobile?: string | null
          phone_opt_in?: boolean | null
          phone_other?: string | null
          phone_work?: string | null
          preferred_channel?: string | null
          primary_company_id?: string | null
          sdr_owner_id?: string | null
          seniority?: string | null
          sms_opt_in?: boolean | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website_url?: string | null
        }
        Update: {
          additional_emails?: string[] | null
          ae_owner_id?: string | null
          behavioral_score?: number | null
          buying_role?:
            | Database["public"]["Enums"]["contact_buying_role"]
            | null
          campaign?: string | null
          company_id?: string | null
          contact_score?: number | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          custom_fields?: Json | null
          department?: string | null
          description?: string | null
          email?: string | null
          email_opt_in?: boolean | null
          external_ids?: Json | null
          first_name?: string | null
          fit_score?: number | null
          full_name?: string | null
          hubspot_contact_id?: string | null
          id?: string
          job_title?: string | null
          last_activity_date?: string | null
          last_inbound_activity_date?: string | null
          last_modified_by?: string | null
          last_name?: string | null
          last_outbound_touch_date?: string | null
          lead_source?: string | null
          lead_source_latest?: string | null
          lead_source_original?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["contact_lifecycle_stage"]
            | null
          linkedin_url?: string | null
          locale?: string | null
          migrated_from_hubspot?: boolean | null
          next_activity_date?: string | null
          org_company_id?: string | null
          owner_user_id?: string | null
          phone_mobile?: string | null
          phone_opt_in?: boolean | null
          phone_other?: string | null
          phone_work?: string | null
          preferred_channel?: string | null
          primary_company_id?: string | null
          sdr_owner_id?: string | null
          seniority?: string | null
          sms_opt_in?: boolean | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["contact_status"] | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_primary_company_id_fkey"
            columns: ["primary_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_conversations: {
        Row: {
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          messages: Json
          page_context: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          messages?: Json
          page_context?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          messages?: Json
          page_context?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_user_preferences: {
        Row: {
          category: Database["public"]["Enums"]["copilot_preference_category"]
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          organization_id: string
          original_ai_response: string | null
          rule_text: string
          source: Database["public"]["Enums"]["copilot_preference_source"]
          updated_at: string
          user_correction: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["copilot_preference_category"]
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          organization_id: string
          original_ai_response?: string | null
          rule_text: string
          source?: Database["public"]["Enums"]["copilot_preference_source"]
          updated_at?: string
          user_correction?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["copilot_preference_category"]
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          original_ai_response?: string | null
          rule_text?: string
          source?: Database["public"]["Enums"]["copilot_preference_source"]
          updated_at?: string
          user_correction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copilot_user_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_companies: {
        Row: {
          additional_domains: string[] | null
          annual_revenue: number | null
          arr: number | null
          company_type: Database["public"]["Enums"]["crm_company_type"] | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json | null
          customer_tier: string | null
          description: string | null
          domain: string | null
          employee_count: number | null
          employee_range: string | null
          external_ids: Json | null
          hq_city: string | null
          hq_country: string | null
          hq_postal_code: string | null
          hq_state: string | null
          hubspot_company_id: string | null
          id: string
          industry: string | null
          key_products: string[] | null
          last_activity_date: string | null
          last_modified_by: string | null
          lifecycle_stage:
            | Database["public"]["Enums"]["crm_company_lifecycle"]
            | null
          linkedin_url: string | null
          logo_url: string | null
          main_contact_email: string | null
          migrated_from_hubspot: boolean | null
          mrr: number | null
          name: string
          next_activity_date: string | null
          org_company_id: string | null
          owner_user_id: string | null
          parent_company_id: string | null
          phone: string | null
          recent_deal_amount: number | null
          recent_deal_close_date: string | null
          regions_served: string[] | null
          renewal_date: string | null
          revenue_band: string | null
          segment: string | null
          source_system: string | null
          status: Database["public"]["Enums"]["crm_company_status"] | null
          sub_industry: string | null
          synced_with_hubspot: boolean | null
          tags: string[] | null
          total_contract_value: number | null
          twitter_url: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          additional_domains?: string[] | null
          annual_revenue?: number | null
          arr?: number | null
          company_type?: Database["public"]["Enums"]["crm_company_type"] | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          customer_tier?: string | null
          description?: string | null
          domain?: string | null
          employee_count?: number | null
          employee_range?: string | null
          external_ids?: Json | null
          hq_city?: string | null
          hq_country?: string | null
          hq_postal_code?: string | null
          hq_state?: string | null
          hubspot_company_id?: string | null
          id?: string
          industry?: string | null
          key_products?: string[] | null
          last_activity_date?: string | null
          last_modified_by?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["crm_company_lifecycle"]
            | null
          linkedin_url?: string | null
          logo_url?: string | null
          main_contact_email?: string | null
          migrated_from_hubspot?: boolean | null
          mrr?: number | null
          name: string
          next_activity_date?: string | null
          org_company_id?: string | null
          owner_user_id?: string | null
          parent_company_id?: string | null
          phone?: string | null
          recent_deal_amount?: number | null
          recent_deal_close_date?: string | null
          regions_served?: string[] | null
          renewal_date?: string | null
          revenue_band?: string | null
          segment?: string | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["crm_company_status"] | null
          sub_industry?: string | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          total_contract_value?: number | null
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          additional_domains?: string[] | null
          annual_revenue?: number | null
          arr?: number | null
          company_type?: Database["public"]["Enums"]["crm_company_type"] | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          customer_tier?: string | null
          description?: string | null
          domain?: string | null
          employee_count?: number | null
          employee_range?: string | null
          external_ids?: Json | null
          hq_city?: string | null
          hq_country?: string | null
          hq_postal_code?: string | null
          hq_state?: string | null
          hubspot_company_id?: string | null
          id?: string
          industry?: string | null
          key_products?: string[] | null
          last_activity_date?: string | null
          last_modified_by?: string | null
          lifecycle_stage?:
            | Database["public"]["Enums"]["crm_company_lifecycle"]
            | null
          linkedin_url?: string | null
          logo_url?: string | null
          main_contact_email?: string | null
          migrated_from_hubspot?: boolean | null
          mrr?: number | null
          name?: string
          next_activity_date?: string | null
          org_company_id?: string | null
          owner_user_id?: string | null
          parent_company_id?: string | null
          phone?: string | null
          recent_deal_amount?: number | null
          recent_deal_close_date?: string | null
          regions_served?: string[] | null
          renewal_date?: string | null
          revenue_band?: string | null
          segment?: string | null
          source_system?: string | null
          status?: Database["public"]["Enums"]["crm_company_status"] | null
          sub_industry?: string | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          total_contract_value?: number | null
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_companies_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_company_activities: {
        Row: {
          activity_type: string
          body: string | null
          contact_id: string | null
          created_at: string
          crm_company_id: string
          deal_id: string | null
          id: string
          logged_by: string | null
          metadata: Json | null
          occurred_at: string
          source: string | null
          subject: string | null
        }
        Insert: {
          activity_type: string
          body?: string | null
          contact_id?: string | null
          created_at?: string
          crm_company_id: string
          deal_id?: string | null
          id?: string
          logged_by?: string | null
          metadata?: Json | null
          occurred_at?: string
          source?: string | null
          subject?: string | null
        }
        Update: {
          activity_type?: string
          body?: string | null
          contact_id?: string | null
          created_at?: string
          crm_company_id?: string
          deal_id?: string | null
          id?: string
          logged_by?: string | null
          metadata?: Json | null
          occurred_at?: string
          source?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_company_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_company_activities_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_company_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_company_team: {
        Row: {
          created_at: string
          crm_company_id: string
          id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          crm_company_id: string
          id?: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          crm_company_id?: string
          id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_company_team_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_metrics: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          format_options: Json | null
          formula: Json
          id: string
          name: string
          result_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          format_options?: Json | null
          formula?: Json
          id?: string
          name: string
          result_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          format_options?: Json | null
          formula?: Json
          id?: string
          name?: string
          result_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dashboard_grid_layouts: {
        Row: {
          company_id: string | null
          created_at: string
          dashboard_id: string
          id: string
          layout: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          dashboard_id: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          dashboard_id?: string
          id?: string
          layout?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_grid_layouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_layouts: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          grid_config: Json
          id: string
          is_active: boolean
          name: string
          position: number
          settings: Json
          updated_at: string
          user_id: string
          widgets_config: Json
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          grid_config?: Json
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          settings?: Json
          updated_at?: string
          user_id: string
          widgets_config?: Json
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          grid_config?: Json
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          settings?: Json
          updated_at?: string
          user_id?: string
          widgets_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_audit_log: {
        Row: {
          action: string
          created_at: string
          deal_id: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_name: string | null
          target_type: string
          user_display_name: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          deal_id: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_name?: string | null
          target_type: string
          user_display_name?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          deal_id?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_name?: string | null
          target_type?: string
          user_display_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_room_audit_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_checklist_categories: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_room_checklist_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_checklist_items: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_required: boolean
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_room_checklist_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_comments: {
        Row: {
          checklist_item_id: string
          content: string
          created_at: string
          deal_id: string
          id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checklist_item_id: string
          content: string
          created_at?: string
          deal_id: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checklist_item_id?: string
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_room_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "data_room_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_file_permissions: {
        Row: {
          can_delete: boolean
          can_download: boolean
          can_view: boolean
          created_at: string
          deal_id: string
          file_id: string
          granted_by: string
          id: string
          user_id: string
        }
        Insert: {
          can_delete?: boolean
          can_download?: boolean
          can_view?: boolean
          created_at?: string
          deal_id: string
          file_id: string
          granted_by: string
          id?: string
          user_id: string
        }
        Update: {
          can_delete?: boolean
          can_download?: boolean
          can_view?: boolean
          created_at?: string
          deal_id?: string
          file_id?: string
          granted_by?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_room_file_permissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_file_permissions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "deal_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      data_room_share_links: {
        Row: {
          created_at: string
          created_by: string
          deal_id: string
          expires_at: string | null
          id: string
          is_active: boolean
          label: string
          max_uploads: number | null
          password_hash: string | null
          permissions: string
          target_checklist_items: string[] | null
          token: string
          updated_at: string
          uploads_used: number
        }
        Insert: {
          created_at?: string
          created_by: string
          deal_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          max_uploads?: number | null
          password_hash?: string | null
          permissions?: string
          target_checklist_items?: string[] | null
          token?: string
          updated_at?: string
          uploads_used?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deal_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          max_uploads?: number | null
          password_hash?: string | null
          permissions?: string
          target_checklist_items?: string[] | null
          token?: string
          updated_at?: string
          uploads_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "data_room_share_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_attachments: {
        Row: {
          category: string
          content_type: string | null
          created_at: string
          deal_id: string
          file_path: string
          id: string
          name: string
          position: number
          size_bytes: number
          source: string
          upload_job_id: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          content_type?: string | null
          created_at?: string
          deal_id: string
          file_path: string
          id?: string
          name: string
          position?: number
          size_bytes?: number
          source?: string
          upload_job_id?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          content_type?: string | null
          created_at?: string
          deal_id?: string
          file_path?: string
          id?: string
          name?: string
          position?: number
          size_bytes?: number
          source?: string
          upload_job_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_attachments_upload_job_id_fkey"
            columns: ["upload_job_id"]
            isOneToOne: false
            referencedRelation: "upload_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_call_transcripts: {
        Row: {
          call_date: string | null
          content_type: string | null
          created_at: string
          deal_id: string
          file_path: string
          id: string
          name: string
          notes: string | null
          participants: string | null
          size_bytes: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          call_date?: string | null
          content_type?: string | null
          created_at?: string
          deal_id: string
          file_path: string
          id?: string
          name: string
          notes?: string | null
          participants?: string | null
          size_bytes?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          call_date?: string | null
          content_type?: string | null
          created_at?: string
          deal_id?: string
          file_path?: string
          id?: string
          name?: string
          notes?: string | null
          participants?: string | null
          size_bytes?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_call_transcripts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_checklist_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          due_date: string | null
          id: string
          is_required: boolean
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_checklist_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_checklist_status: {
        Row: {
          attachment_id: string | null
          checklist_item_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deal_checklist_item_id: string | null
          deal_id: string
          id: string
          is_complete: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          attachment_id?: string | null
          checklist_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deal_checklist_item_id?: string | null
          deal_id: string
          id?: string
          is_complete?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          attachment_id?: string | null
          checklist_item_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deal_checklist_item_id?: string | null
          deal_id?: string
          id?: string
          is_complete?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_checklist_status_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "deal_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_checklist_status_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "data_room_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_checklist_status_deal_checklist_item_id_fkey"
            columns: ["deal_checklist_item_id"]
            isOneToOne: false
            referencedRelation: "deal_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_checklist_status_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_claap_recordings: {
        Row: {
          created_at: string
          deal_id: string
          duration_seconds: number | null
          id: string
          linked_at: string
          linked_by: string | null
          notes: string | null
          recorder_email: string | null
          recorder_name: string | null
          recording_id: string
          recording_title: string | null
          recording_url: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          duration_seconds?: number | null
          id?: string
          linked_at?: string
          linked_by?: string | null
          notes?: string | null
          recorder_email?: string | null
          recorder_name?: string | null
          recording_id: string
          recording_title?: string | null
          recording_url?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          duration_seconds?: number | null
          id?: string
          linked_at?: string
          linked_by?: string | null
          notes?: string | null
          recorder_email?: string | null
          recorder_name?: string | null
          recording_id?: string
          recording_title?: string | null
          recording_url?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_claap_recordings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_emails: {
        Row: {
          deal_id: string
          gmail_message_id: string
          id: string
          linked_at: string
          notes: string | null
          user_id: string
        }
        Insert: {
          deal_id: string
          gmail_message_id: string
          id?: string
          linked_at?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          deal_id?: string
          gmail_message_id?: string
          id?: string
          linked_at?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_emails_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_financial_data: {
        Row: {
          account_key: string
          account_label: string
          company_id: string | null
          deal_id: string
          id: string
          pushed_at: string
          source_file_id: string
          value: number
          year_month: string
        }
        Insert: {
          account_key: string
          account_label: string
          company_id?: string | null
          deal_id: string
          id?: string
          pushed_at?: string
          source_file_id: string
          value?: number
          year_month: string
        }
        Update: {
          account_key?: string
          account_label?: string
          company_id?: string | null
          deal_id?: string
          id?: string
          pushed_at?: string
          source_file_id?: string
          value?: number
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_financial_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financial_data_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financial_data_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "deal_financial_files"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_financial_files: {
        Row: {
          analysis_result: Json | null
          company_id: string | null
          created_at: string
          deal_id: string
          excluded_columns: Json | null
          field_mappings: Json | null
          file_name: string
          file_size: number | null
          flipped_columns: Json | null
          flipped_rows: Json | null
          id: string
          month_count: number
          pushed_at: string | null
          start_month: number
          start_year: number
          statement_type: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          analysis_result?: Json | null
          company_id?: string | null
          created_at?: string
          deal_id: string
          excluded_columns?: Json | null
          field_mappings?: Json | null
          file_name: string
          file_size?: number | null
          flipped_columns?: Json | null
          flipped_rows?: Json | null
          id?: string
          month_count?: number
          pushed_at?: string | null
          start_month?: number
          start_year?: number
          statement_type?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          analysis_result?: Json | null
          company_id?: string | null
          created_at?: string
          deal_id?: string
          excluded_columns?: Json | null
          field_mappings?: Json | null
          file_name?: string
          file_size?: number | null
          flipped_columns?: Json | null
          flipped_rows?: Json | null
          id?: string
          month_count?: number
          pushed_at?: string | null
          start_month?: number
          start_year?: number
          statement_type?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_financial_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financial_files_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_flag_notes: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          note: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          note: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          note?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_flag_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_info_requests: {
        Row: {
          capital_ask: string | null
          company_name: string | null
          created_at: string
          external_deal_id: string
          id: string
          industry: string | null
          requested_at: string | null
          requester_email: string | null
          requester_name: string | null
          requester_user_id: string | null
          responded_at: string | null
          source: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          capital_ask?: string | null
          company_name?: string | null
          created_at?: string
          external_deal_id: string
          id?: string
          industry?: string | null
          requested_at?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_user_id?: string | null
          responded_at?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          capital_ask?: string | null
          company_name?: string | null
          created_at?: string
          external_deal_id?: string
          id?: string
          industry?: string | null
          requested_at?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_user_id?: string | null
          responded_at?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      deal_lenders: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          name: string
          notes: string | null
          pass_reason: string | null
          quote_amount: number | null
          quote_rate: number | null
          quote_term: string | null
          score: number | null
          stage: string
          substage: string | null
          tracking_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          name: string
          notes?: string | null
          pass_reason?: string | null
          quote_amount?: number | null
          quote_rate?: number | null
          quote_term?: string | null
          score?: number | null
          stage?: string
          substage?: string | null
          tracking_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          name?: string
          notes?: string | null
          pass_reason?: string | null
          quote_amount?: number | null
          quote_rate?: number | null
          quote_term?: string | null
          score?: number | null
          stage?: string
          substage?: string | null
          tracking_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_lenders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_memo_approvals: {
        Row: {
          approver_role: string
          approver_user_id: string
          created_at: string
          deal_id: string
          deal_memo_id: string
          id: string
          rejection_reason: string | null
          resolved_at: string | null
          status: string
          submitted_by: string
          task_id: string | null
        }
        Insert: {
          approver_role: string
          approver_user_id: string
          created_at?: string
          deal_id: string
          deal_memo_id: string
          id?: string
          rejection_reason?: string | null
          resolved_at?: string | null
          status?: string
          submitted_by: string
          task_id?: string | null
        }
        Update: {
          approver_role?: string
          approver_user_id?: string
          created_at?: string
          deal_id?: string
          deal_memo_id?: string
          id?: string
          rejection_reason?: string | null
          resolved_at?: string | null
          status?: string
          submitted_by?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_memo_approvals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_memo_approvals_deal_memo_id_fkey"
            columns: ["deal_memo_id"]
            isOneToOne: false
            referencedRelation: "deal_memos"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_memo_audit_logs: {
        Row: {
          created_at: string
          deal_id: string
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
          user_display_name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_display_name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          user_display_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_memo_audit_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_memo_comments: {
        Row: {
          content: string
          created_at: string
          deal_id: string
          id: string
          item_index: number | null
          memo_id: string | null
          mentioned_user_ids: string[] | null
          parent_comment_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          section: string
          updated_at: string
          user_display_name: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deal_id: string
          id?: string
          item_index?: number | null
          memo_id?: string | null
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          section: string
          updated_at?: string
          user_display_name?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          item_index?: number | null
          memo_id?: string | null
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          section?: string
          updated_at?: string
          user_display_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_memo_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_memo_comments_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "deal_memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_memo_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "deal_memo_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_memo_views: {
        Row: {
          deal_id: string
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          deal_id: string
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          deal_id?: string
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_memo_views_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_memos: {
        Row: {
          analyst_notes: string | null
          approval_state: string
          approved_at: string | null
          created_at: string
          created_by: string | null
          current_approval_level: string | null
          current_approver_user_id: string | null
          deal_id: string
          highlights: string | null
          hurdles: string | null
          id: string
          last_submitted_by_user_id: string | null
          lender_notes: string | null
          narrative: string | null
          other_notes: string | null
          rejected_at: string | null
          rejection_reason: string | null
          submitted_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          analyst_notes?: string | null
          approval_state?: string
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          current_approval_level?: string | null
          current_approver_user_id?: string | null
          deal_id: string
          highlights?: string | null
          hurdles?: string | null
          id?: string
          last_submitted_by_user_id?: string | null
          lender_notes?: string | null
          narrative?: string | null
          other_notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          analyst_notes?: string | null
          approval_state?: string
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          current_approval_level?: string | null
          current_approver_user_id?: string | null
          deal_id?: string
          highlights?: string | null
          hurdles?: string | null
          id?: string
          last_submitted_by_user_id?: string | null
          lender_notes?: string | null
          narrative?: string | null
          other_notes?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_memos_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_milestones: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          deal_id: string
          due_date: string | null
          id: string
          position: number
          status: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deal_id: string
          due_date?: string | null
          id?: string
          position?: number
          status?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deal_id?: string
          due_date?: string | null
          id?: string
          position?: number
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_ownership: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          owner_name: string
          owner_url: string | null
          ownership_percentage: number
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          owner_name: string
          owner_url?: string | null
          ownership_percentage: number
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          owner_name?: string
          owner_url?: string | null
          ownership_percentage?: number
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_ownership_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_pipeline_configs: {
        Row: {
          company_id: string | null
          created_at: string
          deal_id: string
          id: string
          stages: Json
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deal_id: string
          id?: string
          stages?: Json
          start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          stages?: Json
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_pipeline_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_pipeline_configs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_pipelines: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          position: number
          stages: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          stages?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          stages?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_pipelines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_research_cache: {
        Row: {
          citations: Json | null
          content: string
          created_at: string
          deal_id: string
          expires_at: string
          generated_by: string | null
          id: string
          metadata: Json | null
          research_type: string
          updated_at: string
        }
        Insert: {
          citations?: Json | null
          content: string
          created_at?: string
          deal_id: string
          expires_at?: string
          generated_by?: string | null
          id?: string
          metadata?: Json | null
          research_type: string
          updated_at?: string
        }
        Update: {
          citations?: Json | null
          content?: string
          created_at?: string
          deal_id?: string
          expires_at?: string
          generated_by?: string | null
          id?: string
          metadata?: Json | null
          research_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_research_cache_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_saas_lenders: {
        Row: {
          config: Json
          deal_id: string
          id: string
          lender_index: number
          updated_at: string | null
        }
        Insert: {
          config?: Json
          deal_id: string
          id?: string
          lender_index?: number
          updated_at?: string | null
        }
        Update: {
          config?: Json
          deal_id?: string
          id?: string
          lender_index?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_saas_lenders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_saas_mappings: {
        Row: {
          analysis_result: Json | null
          deal_id: string
          detected_date_cols: number[] | null
          excluded_columns: Json | null
          field_mappings: Json | null
          file_name: string
          file_size: number | null
          file_storage_path: string | null
          flipped_columns: Json | null
          flipped_rows: Json | null
          id: string
          mapped_at: string | null
        }
        Insert: {
          analysis_result?: Json | null
          deal_id: string
          detected_date_cols?: number[] | null
          excluded_columns?: Json | null
          field_mappings?: Json | null
          file_name: string
          file_size?: number | null
          file_storage_path?: string | null
          flipped_columns?: Json | null
          flipped_rows?: Json | null
          id?: string
          mapped_at?: string | null
        }
        Update: {
          analysis_result?: Json | null
          deal_id?: string
          detected_date_cols?: number[] | null
          excluded_columns?: Json | null
          field_mappings?: Json | null
          file_name?: string
          file_size?: number | null
          file_storage_path?: string | null
          flipped_columns?: Json | null
          flipped_rows?: Json | null
          id?: string
          mapped_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_saas_mappings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_saas_model: {
        Row: {
          deal_id: string
          id: string
          model_data: Json
          settings: Json
          updated_at: string | null
        }
        Insert: {
          deal_id: string
          id?: string
          model_data?: Json
          settings?: Json
          updated_at?: string | null
        }
        Update: {
          deal_id?: string
          id?: string
          model_data?: Json
          settings?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_saas_model_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_saas_sensitivity: {
        Row: {
          deal_id: string
          id: string
          scenarios: Json
          updated_at: string | null
        }
        Insert: {
          deal_id: string
          id?: string
          scenarios?: Json
          updated_at?: string | null
        }
        Update: {
          deal_id?: string
          id?: string
          scenarios?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_saas_sensitivity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_sla_rules: {
        Row: {
          action_config: Json
          action_type: string
          agent_id: string | null
          check_interval_hours: number | null
          company_id: string | null
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          last_checked_at: string | null
          name: string
          rule_type: string
          slack_channel_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_config?: Json
          action_type?: string
          agent_id?: string | null
          check_interval_hours?: number | null
          company_id?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          name: string
          rule_type?: string
          slack_channel_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          agent_id?: string | null
          check_interval_hours?: number | null
          company_id?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_checked_at?: string | null
          name?: string
          rule_type?: string
          slack_channel_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_sla_rules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_sla_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_conversations: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_conversations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_document_summaries: {
        Row: {
          created_at: string
          document_id: string
          id: string
          key_points: Json | null
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          key_points?: Json | null
          summary: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          key_points?: Json | null
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_document_summaries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "deal_space_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_documents: {
        Row: {
          content_type: string | null
          created_at: string
          deal_id: string
          file_path: string
          id: string
          name: string
          size_bytes: number
          user_id: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          deal_id: string
          file_path: string
          id?: string
          name: string
          size_bytes?: number
          user_id?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          deal_id?: string
          file_path?: string
          id?: string
          name?: string
          size_bytes?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_financials: {
        Row: {
          content_type: string | null
          created_at: string
          deal_id: string
          file_path: string
          fiscal_period: string | null
          fiscal_year: number | null
          id: string
          name: string
          notes: string | null
          size_bytes: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          deal_id: string
          file_path: string
          fiscal_period?: string | null
          fiscal_year?: number | null
          id?: string
          name: string
          notes?: string | null
          size_bytes?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          deal_id?: string
          file_path?: string
          fiscal_period?: string | null
          fiscal_year?: number | null
          id?: string
          name?: string
          notes?: string | null
          size_bytes?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_financials_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          sources: Json | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          sources?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "deal_space_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_note_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          note_id: string
          quote_text: string | null
          resolved: boolean
          resolved_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          note_id: string
          quote_text?: string | null
          resolved?: boolean
          resolved_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          note_id?: string
          quote_text?: string | null
          resolved?: boolean
          resolved_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_note_comments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "deal_space_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_note_versions: {
        Row: {
          content: string
          created_at: string
          id: string
          note_id: string
          title: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          note_id: string
          title?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          note_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_note_versions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "deal_space_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_notes: {
        Row: {
          content: string
          created_at: string
          deal_id: string
          folder: string | null
          id: string
          is_pinned: boolean
          is_shared: boolean
          linked_lender_id: string | null
          position: number
          tags: string[] | null
          template_name: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          deal_id: string
          folder?: string | null
          id?: string
          is_pinned?: boolean
          is_shared?: boolean
          linked_lender_id?: string | null
          position?: number
          tags?: string[] | null
          template_name?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deal_id?: string
          folder?: string | null
          id?: string
          is_pinned?: boolean
          is_shared?: boolean
          linked_lender_id?: string | null
          position?: number
          tags?: string[] | null
          template_name?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_space_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_space_notes_linked_lender_id_fkey"
            columns: ["linked_lender_id"]
            isOneToOne: false
            referencedRelation: "deal_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_status_notes: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          note: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          note: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_status_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_writeups: {
        Row: {
          accounting_system: string | null
          b2b_b2c: string | null
          billing_model: string | null
          capital_ask: string | null
          cash_burn_ok: boolean | null
          collateral_available: string | null
          company_highlights: Json | null
          company_name: string
          company_url: string | null
          created_at: string
          customer_base: string | null
          data_room_url: string | null
          deal_id: string
          deal_type: string | null
          description: string | null
          disclaimer: string | null
          existing_debt_details: string | null
          financial_column_visibility: Json | null
          financial_comments: Json | null
          financial_data_as_of: string | null
          financial_years: Json | null
          gross_margins: string | null
          headcount: string | null
          id: string
          industry: string | null
          key_items: Json | null
          last_year_revenue: string | null
          linkedin_url: string | null
          location: string | null
          profitability: string | null
          publish_as_anonymous: boolean | null
          revenue_type: string | null
          sponsorship: string | null
          status: string | null
          team: Json | null
          this_year_revenue: string | null
          total_equity_raised: string | null
          updated_at: string
          use_of_funds: string | null
          user_edited_fields: Json | null
          user_id: string
          visible_metrics: Json | null
          year_founded: string | null
        }
        Insert: {
          accounting_system?: string | null
          b2b_b2c?: string | null
          billing_model?: string | null
          capital_ask?: string | null
          cash_burn_ok?: boolean | null
          collateral_available?: string | null
          company_highlights?: Json | null
          company_name?: string
          company_url?: string | null
          created_at?: string
          customer_base?: string | null
          data_room_url?: string | null
          deal_id: string
          deal_type?: string | null
          description?: string | null
          disclaimer?: string | null
          existing_debt_details?: string | null
          financial_column_visibility?: Json | null
          financial_comments?: Json | null
          financial_data_as_of?: string | null
          financial_years?: Json | null
          gross_margins?: string | null
          headcount?: string | null
          id?: string
          industry?: string | null
          key_items?: Json | null
          last_year_revenue?: string | null
          linkedin_url?: string | null
          location?: string | null
          profitability?: string | null
          publish_as_anonymous?: boolean | null
          revenue_type?: string | null
          sponsorship?: string | null
          status?: string | null
          team?: Json | null
          this_year_revenue?: string | null
          total_equity_raised?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_edited_fields?: Json | null
          user_id: string
          visible_metrics?: Json | null
          year_founded?: string | null
        }
        Update: {
          accounting_system?: string | null
          b2b_b2c?: string | null
          billing_model?: string | null
          capital_ask?: string | null
          cash_burn_ok?: boolean | null
          collateral_available?: string | null
          company_highlights?: Json | null
          company_name?: string
          company_url?: string | null
          created_at?: string
          customer_base?: string | null
          data_room_url?: string | null
          deal_id?: string
          deal_type?: string | null
          description?: string | null
          disclaimer?: string | null
          existing_debt_details?: string | null
          financial_column_visibility?: Json | null
          financial_comments?: Json | null
          financial_data_as_of?: string | null
          financial_years?: Json | null
          gross_margins?: string | null
          headcount?: string | null
          id?: string
          industry?: string | null
          key_items?: Json | null
          last_year_revenue?: string | null
          linkedin_url?: string | null
          location?: string | null
          profitability?: string | null
          publish_as_anonymous?: boolean | null
          revenue_type?: string | null
          sponsorship?: string | null
          status?: string | null
          team?: Json | null
          this_year_revenue?: string | null
          total_equity_raised?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_edited_fields?: Json | null
          user_id?: string
          visible_metrics?: Json | null
          year_founded?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_writeups_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          analyst: string | null
          business_model: string | null
          closing_date: string | null
          company: string
          company_id: string | null
          company_url: string | null
          contact: string | null
          contact_info: string | null
          created_at: string
          crm_company_id: string | null
          deal_owner: string | null
          deal_type: string | null
          engagement_type: string | null
          exclusivity: string | null
          flag_notes: string | null
          hubspot_deal_id: string | null
          id: string
          is_flagged: boolean
          manager: string | null
          merged_hubspot_ids: string[] | null
          merged_into: string | null
          migrated_from_personal: boolean
          milestone_fee: number | null
          narrative: string | null
          notes: string | null
          notes_updated_at: string | null
          pipeline_id: string | null
          post_signing_hours: number | null
          pre_signing_hours: number | null
          referred_by: string | null
          retainer_fee: number | null
          sourced_via: string | null
          stage: string
          status: string
          success_fee_percent: number | null
          total_fee: number | null
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          analyst?: string | null
          business_model?: string | null
          closing_date?: string | null
          company: string
          company_id?: string | null
          company_url?: string | null
          contact?: string | null
          contact_info?: string | null
          created_at?: string
          crm_company_id?: string | null
          deal_owner?: string | null
          deal_type?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          flag_notes?: string | null
          hubspot_deal_id?: string | null
          id?: string
          is_flagged?: boolean
          manager?: string | null
          merged_hubspot_ids?: string[] | null
          merged_into?: string | null
          migrated_from_personal?: boolean
          milestone_fee?: number | null
          narrative?: string | null
          notes?: string | null
          notes_updated_at?: string | null
          pipeline_id?: string | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          referred_by?: string | null
          retainer_fee?: number | null
          sourced_via?: string | null
          stage?: string
          status?: string
          success_fee_percent?: number | null
          total_fee?: number | null
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          analyst?: string | null
          business_model?: string | null
          closing_date?: string | null
          company?: string
          company_id?: string | null
          company_url?: string | null
          contact?: string | null
          contact_info?: string | null
          created_at?: string
          crm_company_id?: string | null
          deal_owner?: string | null
          deal_type?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          flag_notes?: string | null
          hubspot_deal_id?: string | null
          id?: string
          is_flagged?: boolean
          manager?: string | null
          merged_hubspot_ids?: string[] | null
          merged_into?: string | null
          migrated_from_personal?: boolean
          milestone_fee?: number | null
          narrative?: string | null
          notes?: string | null
          notes_updated_at?: string | null
          pipeline_id?: string | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          referred_by?: string | null
          retainer_fee?: number | null
          sourced_via?: string | null
          stage?: string
          status?: string
          success_fee_percent?: number | null
          total_fee?: number | null
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "deal_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      default_milestones: {
        Row: {
          company_id: string
          created_at: string
          days_from_creation: number | null
          id: string
          position: number
          timing_type: string
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          days_from_creation?: number | null
          id?: string
          position?: number
          timing_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          days_from_creation?: number | null
          id?: string
          position?: number
          timing_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "default_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      diligence_report_comments: {
        Row: {
          content: string
          created_at: string
          deal_id: string
          id: string
          mentioned_user_ids: string[] | null
          parent_comment_id: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          section_id: string
          updated_at: string
          user_display_name: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deal_id: string
          id?: string
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          section_id: string
          updated_at?: string
          user_display_name?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          section_id?: string
          updated_at?: string
          user_display_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "diligence_report_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diligence_report_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "diligence_report_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      docusign_tokens: {
        Row: {
          access_token: string
          account_id: string | null
          account_name: string | null
          base_uri: string | null
          company_id: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_id?: string | null
          account_name?: string | null
          base_uri?: string | null
          company_id: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_id?: string | null
          account_name?: string | null
          base_uri?: string | null
          company_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "docusign_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      drafted_agreements: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string
          deal_id: string
          field_values: Json | null
          id: string
          section_overrides: Json | null
          status: string | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by: string
          deal_id: string
          field_values?: Json | null
          id?: string
          section_overrides?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string
          deal_id?: string
          field_values?: Json | null
          id?: string
          section_overrides?: Json | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafted_agreements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafted_agreements_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "agreement_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_block_library: {
        Row: {
          block_json: Json
          category: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          block_json: Json
          category?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          block_json?: Json
          category?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_block_library_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_distribution_stats: {
        Row: {
          clean_bounces: number | null
          clean_click_rate: number | null
          clean_clicks: number | null
          clean_open_rate: number | null
          clean_opens: number | null
          clean_sends: number | null
          clean_unique_opens: number | null
          company_id: string
          computed_at: string | null
          distribution_id: string
          id: string
          raw_bounces: number | null
          raw_clicks: number | null
          raw_opens: number | null
          raw_sends: number | null
          raw_unique_opens: number | null
        }
        Insert: {
          clean_bounces?: number | null
          clean_click_rate?: number | null
          clean_clicks?: number | null
          clean_open_rate?: number | null
          clean_opens?: number | null
          clean_sends?: number | null
          clean_unique_opens?: number | null
          company_id: string
          computed_at?: string | null
          distribution_id: string
          id?: string
          raw_bounces?: number | null
          raw_clicks?: number | null
          raw_opens?: number | null
          raw_sends?: number | null
          raw_unique_opens?: number | null
        }
        Update: {
          clean_bounces?: number | null
          clean_click_rate?: number | null
          clean_clicks?: number | null
          clean_open_rate?: number | null
          clean_opens?: number | null
          clean_sends?: number | null
          clean_unique_opens?: number | null
          company_id?: string
          computed_at?: string | null
          distribution_id?: string
          id?: string
          raw_bounces?: number | null
          raw_clicks?: number | null
          raw_opens?: number | null
          raw_sends?: number | null
          raw_unique_opens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_distribution_stats_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_label_rules: {
        Row: {
          created_at: string
          field: string
          id: string
          is_active: boolean | null
          label_id: string
          operator: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          is_active?: boolean | null
          label_id: string
          operator: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          is_active?: boolean | null
          label_id?: string
          operator?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_label_rules_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "email_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      email_labels: {
        Row: {
          color: string
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          position: number | null
          scope: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          position?: number | null
          scope?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          position?: number | null
          scope?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_labels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_snippets: {
        Row: {
          body: string
          category: string | null
          created_at: string
          id: string
          is_shared: boolean | null
          name: string
          updated_at: string
          usage_count: number | null
          user_id: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          id?: string
          is_shared?: boolean | null
          name: string
          updated_at?: string
          usage_count?: number | null
          user_id: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          id?: string
          is_shared?: boolean | null
          name?: string
          updated_at?: string
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          subject: string
          updated_at: string
          variables: string[] | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          subject: string
          updated_at?: string
          variables?: string[] | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          updated_at?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      email_templates_v2: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_locked: boolean | null
          name: string
          preview_text_template: string | null
          scope: string
          subject_template: string | null
          template_json: Json
          type: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_locked?: boolean | null
          name: string
          preview_text_template?: string | null
          scope?: string
          subject_template?: string | null
          template_json?: Json
          type?: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_locked?: boolean | null
          name?: string
          preview_text_template?: string | null
          scope?: string
          subject_template?: string | null
          template_json?: Json
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_v2_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_labels: {
        Row: {
          applied_by: string | null
          applied_via: string
          created_at: string
          id: string
          is_removed: boolean | null
          label_id: string
          rule_id: string | null
          thread_id: string
        }
        Insert: {
          applied_by?: string | null
          applied_via?: string
          created_at?: string
          id?: string
          is_removed?: boolean | null
          label_id: string
          rule_id?: string | null
          thread_id: string
        }
        Update: {
          applied_by?: string | null
          applied_via?: string
          created_at?: string
          id?: string
          is_removed?: boolean | null
          label_id?: string
          rule_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "email_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_thread_labels_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "email_label_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          error_message: string
          error_type: string
          id: string
          metadata: Json | null
          page_url: string | null
          stack_trace: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          error_type: string
          id?: string
          metadata?: Json | null
          page_url?: string | null
          stack_trace?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          metadata?: Json | null
          page_url?: string | null
          stack_trace?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      external_activity_logs: {
        Row: {
          activity_type: string | null
          deal_id: string | null
          description: string | null
          external_created_at: string | null
          external_deal_id: string | null
          external_id: string
          id: string
          metadata: Json | null
          source_project_id: string
          synced_at: string
          user_id: string | null
        }
        Insert: {
          activity_type?: string | null
          deal_id?: string | null
          description?: string | null
          external_created_at?: string | null
          external_deal_id?: string | null
          external_id: string
          id?: string
          metadata?: Json | null
          source_project_id: string
          synced_at?: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string | null
          deal_id?: string | null
          description?: string | null
          external_created_at?: string | null
          external_deal_id?: string | null
          external_id?: string
          id?: string
          metadata?: Json | null
          source_project_id?: string
          synced_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      external_deal_lenders: {
        Row: {
          deal_id: string | null
          external_created_at: string | null
          external_deal_id: string | null
          external_id: string
          external_updated_at: string | null
          id: string
          name: string | null
          notes: string | null
          source_project_id: string
          stage: string | null
          status: string | null
          substage: string | null
          synced_at: string
        }
        Insert: {
          deal_id?: string | null
          external_created_at?: string | null
          external_deal_id?: string | null
          external_id: string
          external_updated_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          source_project_id: string
          stage?: string | null
          status?: string | null
          substage?: string | null
          synced_at?: string
        }
        Update: {
          deal_id?: string | null
          external_created_at?: string | null
          external_deal_id?: string | null
          external_id?: string
          external_updated_at?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          source_project_id?: string
          stage?: string | null
          status?: string | null
          substage?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      external_deals: {
        Row: {
          borrower_name: string | null
          company: string | null
          company_id: string | null
          deal_type: string | null
          external_created_at: string | null
          external_id: string
          external_updated_at: string | null
          id: string
          notes: string | null
          property_address: string | null
          source_project_id: string
          stage: string | null
          status: string | null
          synced_at: string
          user_id: string | null
          value: number | null
        }
        Insert: {
          borrower_name?: string | null
          company?: string | null
          company_id?: string | null
          deal_type?: string | null
          external_created_at?: string | null
          external_id: string
          external_updated_at?: string | null
          id?: string
          notes?: string | null
          property_address?: string | null
          source_project_id: string
          stage?: string | null
          status?: string | null
          synced_at?: string
          user_id?: string | null
          value?: number | null
        }
        Update: {
          borrower_name?: string | null
          company?: string | null
          company_id?: string | null
          deal_type?: string | null
          external_created_at?: string | null
          external_id?: string
          external_updated_at?: string | null
          id?: string
          notes?: string | null
          property_address?: string | null
          source_project_id?: string
          stage?: string | null
          status?: string | null
          synced_at?: string
          user_id?: string | null
          value?: number | null
        }
        Relationships: []
      }
      external_profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          email: string | null
          external_created_at: string | null
          external_id: string
          first_name: string | null
          id: string
          last_name: string | null
          onboarding_completed: boolean | null
          source_project_id: string
          synced_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          email?: string | null
          external_created_at?: string | null
          external_id: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          source_project_id: string
          synced_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          email?: string | null
          external_created_at?: string | null
          external_id?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean | null
          source_project_id?: string
          synced_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_beta: boolean
          name: string
          status: Database["public"]["Enums"]["feature_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_beta?: boolean
          name: string
          status?: Database["public"]["Enums"]["feature_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_beta?: boolean
          name?: string
          status?: Database["public"]["Enums"]["feature_status"]
          updated_at?: string
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          page_url: string | null
          screenshot_url: string | null
          title: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          screenshot_url?: string | null
          title?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          screenshot_url?: string | null
          title?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      field_suggestion_thresholds: {
        Row: {
          company_id: string
          field_name: string
          id: string
          is_enabled: boolean
          min_confidence: number
          updated_at: string | null
        }
        Insert: {
          company_id: string
          field_name: string
          id?: string
          is_enabled?: boolean
          min_confidence?: number
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          field_name?: string
          id?: string
          is_enabled?: boolean
          min_confidence?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "field_suggestion_thresholds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      file_checklist_map: {
        Row: {
          checklist_item_id: string
          deal_id: string
          file_id: string
          id: string
          mapped_at: string
          mapped_by: string
          mapping_source: string
        }
        Insert: {
          checklist_item_id: string
          deal_id: string
          file_id: string
          id?: string
          mapped_at?: string
          mapped_by: string
          mapping_source?: string
        }
        Update: {
          checklist_item_id?: string
          deal_id?: string
          file_id?: string
          id?: string
          mapped_at?: string
          mapped_by?: string
          mapping_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_checklist_map_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_checklist_map_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "deal_attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_change_logs: {
        Row: {
          change_reason: string | null
          changed_at: string | null
          changed_by: string | null
          company_id: string
          financial_data_id: string
          id: string
          line_item_id: string
          new_amount: number
          period_id: string
          previous_amount: number | null
        }
        Insert: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          company_id: string
          financial_data_id: string
          id?: string
          line_item_id: string
          new_amount: number
          period_id: string
          previous_amount?: number | null
        }
        Update: {
          change_reason?: string | null
          changed_at?: string | null
          changed_by?: string | null
          company_id?: string
          financial_data_id?: string
          id?: string
          line_item_id?: string
          new_amount?: number
          period_id?: string
          previous_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_change_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_change_logs_financial_data_id_fkey"
            columns: ["financial_data_id"]
            isOneToOne: false
            referencedRelation: "financial_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_change_logs_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "financial_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_change_logs_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_data: {
        Row: {
          amount: number
          company_id: string
          created_at: string | null
          id: string
          line_item_id: string
          notes: string | null
          period_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string | null
          id?: string
          line_item_id: string
          notes?: string | null
          period_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string | null
          id?: string
          line_item_id?: string
          notes?: string | null
          period_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_data_line_item_id_fkey"
            columns: ["line_item_id"]
            isOneToOne: false
            referencedRelation: "financial_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_data_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_line_item_categories: {
        Row: {
          company_id: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_system: boolean | null
          name: string
          parent_category_id: string | null
          statement_type: Database["public"]["Enums"]["financial_statement_type"]
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_system?: boolean | null
          name: string
          parent_category_id?: string | null
          statement_type: Database["public"]["Enums"]["financial_statement_type"]
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_system?: boolean | null
          name?: string
          parent_category_id?: string | null
          statement_type?: Database["public"]["Enums"]["financial_statement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "financial_line_item_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_line_item_categories_parent_category_id_fkey"
            columns: ["parent_category_id"]
            isOneToOne: false
            referencedRelation: "financial_line_item_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_line_items: {
        Row: {
          calculation_formula: string | null
          category_id: string | null
          company_id: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_calculated: boolean | null
          is_system: boolean | null
          name: string
          statement_type: Database["public"]["Enums"]["financial_statement_type"]
        }
        Insert: {
          calculation_formula?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_calculated?: boolean | null
          is_system?: boolean | null
          name: string
          statement_type: Database["public"]["Enums"]["financial_statement_type"]
        }
        Update: {
          calculation_formula?: string | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_calculated?: boolean | null
          is_system?: boolean | null
          name?: string
          statement_type?: Database["public"]["Enums"]["financial_statement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "financial_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_line_item_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_line_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          company_id: string
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          is_locked: boolean | null
          month: number | null
          period_type: Database["public"]["Enums"]["financial_period_type"]
          quarter: number | null
          start_date: string
          updated_at: string | null
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          is_locked?: boolean | null
          month?: number | null
          period_type: Database["public"]["Enums"]["financial_period_type"]
          quarter?: number | null
          start_date: string
          updated_at?: string | null
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          is_locked?: boolean | null
          month?: number | null
          period_type?: Database["public"]["Enums"]["financial_period_type"]
          quarter?: number | null
          start_date?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      flex_info_notifications: {
        Row: {
          company_name: string | null
          created_at: string
          deal_id: string
          id: string
          lender_name: string | null
          message: string
          status: string
          type: string
          user_email: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          deal_id: string
          id?: string
          lender_name?: string | null
          message: string
          status?: string
          type?: string
          user_email?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          lender_name?: string | null
          message?: string
          status?: string
          type?: string
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flex_info_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      flex_notifications: {
        Row: {
          alert_type: string
          created_at: string
          deal_id: string
          engagement_score: number | null
          id: string
          lender_email: string | null
          lender_name: string | null
          message: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          deal_id: string
          engagement_score?: number | null
          id?: string
          lender_email?: string | null
          lender_name?: string | null
          message: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          deal_id?: string
          engagement_score?: number | null
          id?: string
          lender_email?: string | null
          lender_name?: string | null
          message?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flex_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      flex_sync_history: {
        Row: {
          created_at: string
          deal_id: string
          error_message: string | null
          flex_deal_id: string | null
          id: string
          payload: Json | null
          response: Json | null
          status: string
          synced_by: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          error_message?: string | null
          flex_deal_id?: string | null
          id?: string
          payload?: Json | null
          response?: Json | null
          status?: string
          synced_by: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          error_message?: string | null
          flex_deal_id?: string | null
          id?: string
          payload?: Json | null
          response?: Json | null
          status?: string
          synced_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "flex_sync_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      fpa_annotations: {
        Row: {
          color: string | null
          company_id: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean | null
          target_key: string
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          company_id: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          target_key: string
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          target_key?: string
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpa_annotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fpa_budget_approvals: {
        Row: {
          admin_approved_at: string | null
          admin_approved_by: string | null
          affected_accounts: string[] | null
          amount_impact: number | null
          analyst_approved_at: string | null
          analyst_approved_by: string | null
          approval_type: string
          company_id: string
          created_at: string
          current_approver: string | null
          current_level: string
          description: string | null
          id: string
          manager_approved_at: string | null
          manager_approved_by: string | null
          rejection_reason: string | null
          status: string
          submitted_by: string
          title: string
          updated_at: string
        }
        Insert: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          affected_accounts?: string[] | null
          amount_impact?: number | null
          analyst_approved_at?: string | null
          analyst_approved_by?: string | null
          approval_type: string
          company_id: string
          created_at?: string
          current_approver?: string | null
          current_level?: string
          description?: string | null
          id?: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_by: string
          title: string
          updated_at?: string
        }
        Update: {
          admin_approved_at?: string | null
          admin_approved_by?: string | null
          affected_accounts?: string[] | null
          amount_impact?: number | null
          analyst_approved_at?: string | null
          analyst_approved_by?: string | null
          approval_type?: string
          company_id?: string
          created_at?: string
          current_approver?: string | null
          current_level?: string
          description?: string | null
          id?: string
          manager_approved_at?: string | null
          manager_approved_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_by?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpa_budget_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fpa_comments: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          is_resolved: boolean | null
          mentioned_user_ids: string[] | null
          parent_comment_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          target_key: string
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          target_key: string
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          mentioned_user_ids?: string[] | null
          parent_comment_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          target_key?: string
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fpa_comments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fpa_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "fpa_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      fpa_variance_reviews: {
        Row: {
          account_name: string
          assigned_to: string | null
          company_id: string
          comparison_mode: string
          created_at: string
          flagged_by: string
          id: string
          notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          variance_amount: number
          variance_pct: number
        }
        Insert: {
          account_name: string
          assigned_to?: string | null
          company_id: string
          comparison_mode: string
          created_at?: string
          flagged_by: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          variance_amount: number
          variance_pct: number
        }
        Update: {
          account_name?: string
          assigned_to?: string | null
          company_id?: string
          comparison_mode?: string
          created_at?: string
          flagged_by?: string
          id?: string
          notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          variance_amount?: number
          variance_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "fpa_variance_reviews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gamma_analytics: {
        Row: {
          created_at: string
          deal_id: string | null
          event_type: string
          generation_id: string | null
          id: string
          metadata: Json | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          event_type: string
          generation_id?: string | null
          id?: string
          metadata?: Json | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          event_type?: string
          generation_id?: string | null
          id?: string
          metadata?: Json | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamma_analytics_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamma_analytics_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "gamma_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      gamma_custom_templates: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_shared: boolean
          name: string
          prompt: string
          suggested_format: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_shared?: boolean
          name: string
          prompt: string
          suggested_format?: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          prompt?: string
          suggested_format?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamma_custom_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gamma_generation_comments: {
        Row: {
          content: string
          created_at: string
          generation_id: string
          id: string
          review_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          generation_id: string
          id?: string
          review_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          generation_id?: string
          id?: string
          review_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamma_generation_comments_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "gamma_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      gamma_generations: {
        Row: {
          created_at: string
          deal_id: string
          format: string
          gamma_url: string | null
          generation_id: string
          id: string
          is_starred: boolean
          pdf_url: string | null
          pptx_url: string | null
          prompt_text: string | null
          review_count: number | null
          review_status: string | null
          share_expires_at: string | null
          share_token: string | null
          status: string
          template_id: string | null
          theme_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          format?: string
          gamma_url?: string | null
          generation_id: string
          id?: string
          is_starred?: boolean
          pdf_url?: string | null
          pptx_url?: string | null
          prompt_text?: string | null
          review_count?: number | null
          review_status?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          template_id?: string | null
          theme_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          format?: string
          gamma_url?: string | null
          generation_id?: string
          id?: string
          is_starred?: boolean
          pdf_url?: string | null
          pptx_url?: string | null
          prompt_text?: string | null
          review_count?: number | null
          review_status?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          status?: string
          template_id?: string | null
          theme_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamma_generations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_messages: {
        Row: {
          bcc_emails: string[] | null
          body_html: string | null
          body_text: string | null
          cc_emails: string[] | null
          created_at: string
          from_email: string | null
          from_name: string | null
          gmail_message_id: string
          id: string
          is_read: boolean | null
          is_starred: boolean | null
          labels: string[] | null
          received_at: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
          to_emails: string[] | null
          user_id: string
        }
        Insert: {
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id: string
          id?: string
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[] | null
          user_id: string
        }
        Update: {
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string
          id?: string
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      gmail_sent_messages: {
        Row: {
          bcc_emails: string[] | null
          body_html: string | null
          body_text: string | null
          cc_emails: string[] | null
          created_at: string
          error_message: string | null
          gmail_message_id: string | null
          id: string
          sent_at: string | null
          status: string | null
          subject: string | null
          to_emails: string[]
          user_id: string
        }
        Insert: {
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          error_message?: string | null
          gmail_message_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          to_emails: string[]
          user_id: string
        }
        Update: {
          bcc_emails?: string[] | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          error_message?: string | null
          gmail_message_id?: string | null
          id?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          to_emails?: string[]
          user_id?: string
        }
        Relationships: []
      }
      gmail_tokens: {
        Row: {
          access_token: string | null
          account_id: string | null
          created_at: string
          email_address: string | null
          expires_at: string | null
          grant_id: string | null
          id: string
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          created_at?: string
          email_address?: string | null
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          created_at?: string
          email_address?: string | null
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      help_articles: {
        Row: {
          body_html: string
          category: string
          company_id: string | null
          created_at: string | null
          created_by: string | null
          helpful_count: number | null
          id: string
          search_vector: unknown
          slug: string
          status: string
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          body_html: string
          category: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          helpful_count?: number | null
          id?: string
          search_vector?: unknown
          slug: string
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          body_html?: string
          category?: string
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          helpful_count?: number | null
          id?: string
          search_vector?: unknown
          slug?: string
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "help_articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_field_mappings: {
        Row: {
          created_at: string
          external_field_name: string
          external_object: string
          id: string
          integration_config_id: string
          is_required: boolean
          native_field_name: string
          native_object: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_field_name: string
          external_object?: string
          id?: string
          integration_config_id: string
          is_required?: boolean
          native_field_name: string
          native_object?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_field_name?: string
          external_object?: string
          id?: string
          integration_config_id?: string
          is_required?: boolean
          native_field_name?: string
          native_object?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_field_mappings_integration_config_id_fkey"
            columns: ["integration_config_id"]
            isOneToOne: false
            referencedRelation: "hubspot_integration_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_integration_configs: {
        Row: {
          company_id: string | null
          created_at: string
          direction: string
          id: string
          last_sync_at: string | null
          record_behavior: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          last_sync_at?: string | null
          record_behavior?: string
          status?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          last_sync_at?: string | null
          record_behavior?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_integration_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_sync_runs: {
        Row: {
          error_count: number
          error_summary: Json | null
          finished_at: string | null
          id: string
          integration_config_id: string
          records_processed: number
          started_at: string
          status: string
        }
        Insert: {
          error_count?: number
          error_summary?: Json | null
          finished_at?: string | null
          id?: string
          integration_config_id: string
          records_processed?: number
          started_at?: string
          status?: string
        }
        Update: {
          error_count?: number
          error_summary?: Json | null
          finished_at?: string | null
          id?: string
          integration_config_id?: string
          records_processed?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_sync_runs_integration_config_id_fkey"
            columns: ["integration_config_id"]
            isOneToOne: false
            referencedRelation: "hubspot_integration_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_history: {
        Row: {
          active_deals: number | null
          avg_deal_size: number | null
          company_id: string | null
          created_at: string
          deals_snapshot: Json | null
          id: string
          opportunities: Json | null
          pipeline_health_score: number
          pipeline_health_summary: string | null
          recommendations: Json | null
          risk_alerts: Json | null
          total_value: number | null
          trends: Json | null
          user_id: string
        }
        Insert: {
          active_deals?: number | null
          avg_deal_size?: number | null
          company_id?: string | null
          created_at?: string
          deals_snapshot?: Json | null
          id?: string
          opportunities?: Json | null
          pipeline_health_score: number
          pipeline_health_summary?: string | null
          recommendations?: Json | null
          risk_alerts?: Json | null
          total_value?: number | null
          trends?: Json | null
          user_id: string
        }
        Update: {
          active_deals?: number | null
          avg_deal_size?: number | null
          company_id?: string | null
          created_at?: string
          deals_snapshot?: Json | null
          id?: string
          opportunities?: Json | null
          pipeline_health_score?: number
          pipeline_health_summary?: string | null
          recommendations?: Json | null
          risk_alerts?: Json | null
          total_value?: number | null
          trends?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_interest: {
        Row: {
          created_at: string
          id: string
          integration_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_key?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          integration_type: string
          payload: Json | null
          response: Json | null
          retry_count: number | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          integration_type: string
          payload?: Json | null
          response?: Json | null
          retry_count?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          integration_type?: string
          payload?: Json | null
          response?: Json | null
          retry_count?: number | null
          status?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          company_id: string | null
          config: Json
          created_at: string
          id: string
          last_sync_at: string | null
          name: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          last_sync_at?: string | null
          name: string
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          last_sync_at?: string | null
          name?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_allowlist: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          ip_address: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ip_address: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean
        }
        Relationships: []
      }
      lender_attachments: {
        Row: {
          category: string
          company_id: string | null
          content_type: string | null
          created_at: string
          file_path: string
          id: string
          lender_name: string
          name: string
          size_bytes: number
          user_id: string
        }
        Insert: {
          category?: string
          company_id?: string | null
          content_type?: string | null
          created_at?: string
          file_path: string
          id?: string
          lender_name: string
          name: string
          size_bytes?: number
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string | null
          content_type?: string | null
          created_at?: string
          file_path?: string
          id?: string
          lender_name?: string
          name?: string
          size_bytes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_audit_logs: {
        Row: {
          action: string
          created_at: string
          field_changed: string | null
          id: string
          lender_id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          user_display_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          field_changed?: string | null
          id?: string
          lender_id: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          user_display_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          field_changed?: string | null
          id?: string
          lender_id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          user_display_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_audit_logs_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "master_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_contacts: {
        Row: {
          created_at: string
          email: string | null
          geography: string | null
          id: string
          is_primary: boolean | null
          lender_id: string
          name: string
          notes: string | null
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          geography?: string | null
          id?: string
          is_primary?: boolean | null
          lender_id: string
          name: string
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          geography?: string | null
          id?: string
          is_primary?: boolean | null
          lender_id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_contacts_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "master_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_disqualifications: {
        Row: {
          created_at: string
          deal_geography: string | null
          deal_id: string
          deal_industry: string | null
          deal_lender_id: string | null
          deal_size: number | null
          disqualified_by: string | null
          id: string
          lender_name: string
          master_lender_id: string | null
          reason_category: Database["public"]["Enums"]["lender_pass_reason_category"]
          reason_details: string | null
        }
        Insert: {
          created_at?: string
          deal_geography?: string | null
          deal_id: string
          deal_industry?: string | null
          deal_lender_id?: string | null
          deal_size?: number | null
          disqualified_by?: string | null
          id?: string
          lender_name: string
          master_lender_id?: string | null
          reason_category: Database["public"]["Enums"]["lender_pass_reason_category"]
          reason_details?: string | null
        }
        Update: {
          created_at?: string
          deal_geography?: string | null
          deal_id?: string
          deal_industry?: string | null
          deal_lender_id?: string | null
          deal_size?: number | null
          disqualified_by?: string | null
          id?: string
          lender_name?: string
          master_lender_id?: string | null
          reason_category?: Database["public"]["Enums"]["lender_pass_reason_category"]
          reason_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_disqualifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_disqualifications_deal_lender_id_fkey"
            columns: ["deal_lender_id"]
            isOneToOne: false
            referencedRelation: "deal_lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_disqualifications_master_lender_id_fkey"
            columns: ["master_lender_id"]
            isOneToOne: false
            referencedRelation: "master_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_history_warning_dismissals: {
        Row: {
          deal_id: string
          dismissed_at: string
          dismissed_by: string
          id: string
          lender_name: string
        }
        Insert: {
          deal_id: string
          dismissed_at?: string
          dismissed_by: string
          id?: string
          lender_name: string
        }
        Update: {
          deal_id?: string
          dismissed_at?: string
          dismissed_by?: string
          id?: string
          lender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_history_warning_dismissals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_notes: {
        Row: {
          author_user_id: string
          body: string
          company_id: string | null
          created_at: string
          id: string
          is_flag: boolean
          lender_name: string
          master_lender_id: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_flag?: boolean
          lender_name: string
          master_lender_id?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_flag?: boolean
          lender_name?: string
          master_lender_id?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_notes_master_lender_id_fkey"
            columns: ["master_lender_id"]
            isOneToOne: false
            referencedRelation: "master_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_notes_history: {
        Row: {
          created_at: string
          deal_lender_id: string
          id: string
          text: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_lender_id: string
          id?: string
          text: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_lender_id?: string
          id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_notes_history_deal_lender_id_fkey"
            columns: ["deal_lender_id"]
            isOneToOne: false
            referencedRelation: "deal_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_pass_patterns: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          last_updated: string
          lender_name: string
          master_lender_id: string | null
          occurrence_count: number | null
          pattern_type: string
          pattern_value: string
          reason_category: Database["public"]["Enums"]["lender_pass_reason_category"]
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_updated?: string
          lender_name: string
          master_lender_id?: string | null
          occurrence_count?: number | null
          pattern_type: string
          pattern_value: string
          reason_category: Database["public"]["Enums"]["lender_pass_reason_category"]
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          last_updated?: string
          lender_name?: string
          master_lender_id?: string | null
          occurrence_count?: number | null
          pattern_type?: string
          pattern_value?: string
          reason_category?: Database["public"]["Enums"]["lender_pass_reason_category"]
        }
        Relationships: [
          {
            foreignKeyName: "lender_pass_patterns_master_lender_id_fkey"
            columns: ["master_lender_id"]
            isOneToOne: false
            referencedRelation: "master_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_stage_configs: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          pass_reasons: Json
          stages: Json
          substages: Json
          tracking_statuses: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          pass_reasons?: Json
          stages?: Json
          substages?: Json
          tracking_statuses?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          pass_reasons?: Json
          stages?: Json
          substages?: Json
          tracking_statuses?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_stage_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_sync_requests: {
        Row: {
          changes_diff: Json | null
          created_at: string
          existing_lender_id: string | null
          existing_lender_name: string | null
          id: string
          incoming_data: Json
          processed_at: string | null
          processed_by: string | null
          processing_notes: string | null
          request_type: string
          source_lender_id: string | null
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          changes_diff?: Json | null
          created_at?: string
          existing_lender_id?: string | null
          existing_lender_name?: string | null
          id?: string
          incoming_data: Json
          processed_at?: string | null
          processed_by?: string | null
          processing_notes?: string | null
          request_type: string
          source_lender_id?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Update: {
          changes_diff?: Json | null
          created_at?: string
          existing_lender_id?: string | null
          existing_lender_name?: string | null
          id?: string
          incoming_data?: Json
          processed_at?: string | null
          processed_by?: string | null
          processing_notes?: string | null
          request_type?: string
          source_lender_id?: string | null
          source_system?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_sync_requests_existing_lender_id_fkey"
            columns: ["existing_lender_id"]
            isOneToOne: false
            referencedRelation: "master_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          ip_address: string | null
          os: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          os?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          ip_address?: string | null
          os?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mapping_patterns: {
        Row: {
          action: string
          company_id: string
          confidence: number | null
          created_at: string
          deal_id: string | null
          field_category: string
          id: string
          mapped_field: string
          occurrence_count: number
          source_label: string
          source_label_normalized: string
          suggested_by: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          confidence?: number | null
          created_at?: string
          deal_id?: string | null
          field_category?: string
          id?: string
          mapped_field: string
          occurrence_count?: number
          source_label: string
          source_label_normalized: string
          suggested_by?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          deal_id?: string | null
          field_category?: string
          id?: string
          mapped_field?: string
          occurrence_count?: number
          source_label?: string
          source_label_normalized?: string
          suggested_by?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mapping_patterns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mapping_patterns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      master_lenders: {
        Row: {
          active: boolean | null
          b2b_b2c: string | null
          cash_burn: string | null
          company_id: string | null
          company_requirements: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_title: string | null
          created_at: string
          deal_structure_notes: string | null
          ebitda_min: number | null
          email: string | null
          external_created_by: string | null
          external_last_modified: string | null
          flex_lender_id: string | null
          geo: string | null
          gift_address: string | null
          id: string
          industries: string[] | null
          industries_to_avoid: string[] | null
          last_synced_from_flex: string | null
          lender_one_pager_url: string | null
          lender_type: string | null
          loan_types: string[] | null
          max_deal: number | null
          min_deal: number | null
          min_revenue: number | null
          name: string
          nda: string | null
          onboarded_to_flex: string | null
          post_term_sheet_checklist: string | null
          referral_agreement: string | null
          referral_fee_offered: string | null
          referral_lender: string | null
          refinancing: string | null
          relationship_owners: string | null
          sponsorship: string | null
          sub_debt: string | null
          sync_source: string | null
          tier: string | null
          updated_at: string
          upfront_checklist: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          b2b_b2c?: string | null
          cash_burn?: string | null
          company_id?: string | null
          company_requirements?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          deal_structure_notes?: string | null
          ebitda_min?: number | null
          email?: string | null
          external_created_by?: string | null
          external_last_modified?: string | null
          flex_lender_id?: string | null
          geo?: string | null
          gift_address?: string | null
          id?: string
          industries?: string[] | null
          industries_to_avoid?: string[] | null
          last_synced_from_flex?: string | null
          lender_one_pager_url?: string | null
          lender_type?: string | null
          loan_types?: string[] | null
          max_deal?: number | null
          min_deal?: number | null
          min_revenue?: number | null
          name: string
          nda?: string | null
          onboarded_to_flex?: string | null
          post_term_sheet_checklist?: string | null
          referral_agreement?: string | null
          referral_fee_offered?: string | null
          referral_lender?: string | null
          refinancing?: string | null
          relationship_owners?: string | null
          sponsorship?: string | null
          sub_debt?: string | null
          sync_source?: string | null
          tier?: string | null
          updated_at?: string
          upfront_checklist?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          b2b_b2c?: string | null
          cash_burn?: string | null
          company_id?: string | null
          company_requirements?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          deal_structure_notes?: string | null
          ebitda_min?: number | null
          email?: string | null
          external_created_by?: string | null
          external_last_modified?: string | null
          flex_lender_id?: string | null
          geo?: string | null
          gift_address?: string | null
          id?: string
          industries?: string[] | null
          industries_to_avoid?: string[] | null
          last_synced_from_flex?: string | null
          lender_one_pager_url?: string | null
          lender_type?: string | null
          loan_types?: string[] | null
          max_deal?: number | null
          min_deal?: number | null
          min_revenue?: number | null
          name?: string
          nda?: string | null
          onboarded_to_flex?: string | null
          post_term_sheet_checklist?: string | null
          referral_agreement?: string | null
          referral_fee_offered?: string | null
          referral_lender?: string | null
          refinancing?: string | null
          relationship_owners?: string | null
          sponsorship?: string | null
          sub_debt?: string | null
          sync_source?: string | null
          tier?: string | null
          updated_at?: string
          upfront_checklist?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "master_lenders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_tokens: {
        Row: {
          access_token: string
          connected_at: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          expires_at: string
          id: string
          refresh_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          expires_at: string
          id?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      model_annotations: {
        Row: {
          content: string
          created_at: string
          deal_id: string
          id: string
          mentions: string[] | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          target_ref: string
          target_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deal_id: string
          id?: string
          mentions?: string[] | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          target_ref: string
          target_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          mentions?: string[] | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          target_ref?: string
          target_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_annotations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      model_snapshots: {
        Row: {
          created_at: string
          deal_id: string
          description: string | null
          id: string
          label: string
          lender_data: Json | null
          model_data: Json
          sensitivity_data: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          description?: string | null
          id?: string
          label?: string
          lender_data?: Json | null
          model_data: Json
          sensitivity_data?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          description?: string | null
          id?: string
          label?: string
          lender_data?: Json | null
          model_data?: Json
          sensitivity_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      news_alerts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          notify_email: boolean
          notify_in_app: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          notify_email?: boolean
          notify_in_app?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          notify_email?: boolean
          notify_in_app?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      news_bookmarks: {
        Row: {
          article_data: Json
          article_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          article_data: Json
          article_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          article_data?: Json
          article_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      news_channels: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          keywords: string[]
          name: string
          position: number
          sources: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          name: string
          position?: number
          sources?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          name?: string
          position?: number
          sources?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      news_digest_settings: {
        Row: {
          created_at: string
          frequency: string
          id: string
          include_categories: string[] | null
          is_enabled: boolean
          max_articles: number | null
          preferred_day: number | null
          preferred_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency?: string
          id?: string
          include_categories?: string[] | null
          is_enabled?: boolean
          max_articles?: number | null
          preferred_day?: number | null
          preferred_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          include_categories?: string[] | null
          is_enabled?: boolean
          max_articles?: number | null
          preferred_day?: number | null
          preferred_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      news_pinned_sources: {
        Row: {
          created_at: string
          id: string
          source_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_name?: string
          user_id?: string
        }
        Relationships: []
      }
      news_preferences: {
        Row: {
          created_at: string
          default_layout: string
          default_tab: string
          digest_frequency: string | null
          digest_max_articles: number | null
          id: string
          industries: string[] | null
          keywords: string[] | null
          onboarding_completed: boolean
          preferred_sources: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_layout?: string
          default_tab?: string
          digest_frequency?: string | null
          digest_max_articles?: number | null
          id?: string
          industries?: string[] | null
          keywords?: string[] | null
          onboarding_completed?: boolean
          preferred_sources?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_layout?: string
          default_tab?: string
          digest_frequency?: string | null
          digest_max_articles?: number | null
          id?: string
          industries?: string[] | null
          keywords?: string[] | null
          onboarding_completed?: boolean
          preferred_sources?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      news_read_status: {
        Row: {
          article_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          article_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          article_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_instances: {
        Row: {
          actor_user_id: string | null
          body: string | null
          channel_type: Database["public"]["Enums"]["notification_channel_type"]
          context: Json | null
          created_at: string
          error_message: string | null
          id: string
          provider_id: string | null
          read_at: string | null
          recipient_user_id: string
          rendered_data: Json | null
          rule_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_instance_status"]
          title: string | null
          trigger_key: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string | null
          channel_type: Database["public"]["Enums"]["notification_channel_type"]
          context?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_id?: string | null
          read_at?: string | null
          recipient_user_id: string
          rendered_data?: Json | null
          rule_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_instance_status"]
          title?: string | null
          trigger_key: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string | null
          channel_type?: Database["public"]["Enums"]["notification_channel_type"]
          context?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          provider_id?: string | null
          read_at?: string | null
          recipient_user_id?: string
          rendered_data?: Json | null
          rule_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_instance_status"]
          title?: string | null
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_instances_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "notification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          id: string
          notification_id: string
          notification_type: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          notification_type: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          notification_type?: string
          read_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_rules: {
        Row: {
          category: Database["public"]["Enums"]["notification_category"]
          channels: Json
          company_id: string | null
          created_at: string
          default_recipients: Json
          description: string | null
          id: string
          is_enabled: boolean
          metadata: Json | null
          name: string
          trigger_key: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["notification_category"]
          channels?: Json
          company_id?: string | null
          created_at?: string
          default_recipients?: Json
          description?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          name: string
          trigger_key: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["notification_category"]
          channels?: Json
          company_id?: string | null
          created_at?: string
          default_recipients?: Json
          description?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          name?: string
          trigger_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_tracking_settings: {
        Row: {
          company_id: string
          exclude_bot_traffic: boolean | null
          id: string
          internal_domains: string[] | null
          internal_ip_ranges: string[] | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          exclude_bot_traffic?: boolean | null
          id?: string
          internal_domains?: string[] | null
          internal_ip_ranges?: string[] | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          exclude_bot_traffic?: boolean | null
          id?: string
          internal_domains?: string[] | null
          internal_ip_ranges?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_tracking_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      outstanding_item_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          item_id: string
          user_display_name: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          item_id: string
          user_display_name?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          item_id?: string
          user_display_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outstanding_item_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "outstanding_items"
            referencedColumns: ["id"]
          },
        ]
      }
      outstanding_items: {
        Row: {
          assigned_to: string | null
          created_at: string
          deal_id: string
          description: string
          due_date: string | null
          eta: string | null
          id: string
          lender_id: string | null
          notes: string | null
          position: number
          priority: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          deal_id: string
          description: string
          due_date?: string | null
          eta?: string | null
          id?: string
          lender_id?: string | null
          notes?: string | null
          position?: number
          priority?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          deal_id?: string
          description?: string
          due_date?: string | null
          eta?: string | null
          id?: string
          lender_id?: string | null
          notes?: string | null
          position?: number
          priority?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outstanding_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outstanding_items_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "deal_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          company_id: string | null
          created_at: string
          device_type: string | null
          id: string
          page_path: string
          page_title: string | null
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          page_path: string
          page_title?: string | null
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          page_path?: string
          page_title?: string | null
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_requested_at: string | null
          approved_at: string | null
          approved_by: string | null
          avatar_url: string | null
          backup_email: string | null
          company_name: string | null
          company_role: string | null
          company_size: string | null
          company_url: string | null
          created_at: string
          deal_updates_app: boolean
          deal_updates_email: boolean
          display_name: string | null
          email: string | null
          email_notifications: boolean
          email_task_assigned: boolean | null
          first_name: string | null
          id: string
          in_app_notifications: boolean
          last_name: string | null
          lender_updates_app: boolean
          lender_updates_email: boolean
          notify_activity_deal_created: boolean
          notify_activity_lender_added: boolean
          notify_activity_lender_updated: boolean
          notify_activity_milestone_added: boolean
          notify_activity_milestone_completed: boolean
          notify_activity_milestone_missed: boolean
          notify_activity_stage_changed: boolean
          notify_activity_status_changed: boolean
          notify_flex_alerts: boolean
          notify_info_request_emails: boolean
          notify_stale_alerts: boolean
          onboarding_completed: boolean
          phone: string | null
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
          user_id: string
          weekly_summary_email: boolean
        }
        Insert: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          backup_email?: string | null
          company_name?: string | null
          company_role?: string | null
          company_size?: string | null
          company_url?: string | null
          created_at?: string
          deal_updates_app?: boolean
          deal_updates_email?: boolean
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean
          email_task_assigned?: boolean | null
          first_name?: string | null
          id?: string
          in_app_notifications?: boolean
          last_name?: string | null
          lender_updates_app?: boolean
          lender_updates_email?: boolean
          notify_activity_deal_created?: boolean
          notify_activity_lender_added?: boolean
          notify_activity_lender_updated?: boolean
          notify_activity_milestone_added?: boolean
          notify_activity_milestone_completed?: boolean
          notify_activity_milestone_missed?: boolean
          notify_activity_stage_changed?: boolean
          notify_activity_status_changed?: boolean
          notify_flex_alerts?: boolean
          notify_info_request_emails?: boolean
          notify_stale_alerts?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          user_id: string
          weekly_summary_email?: boolean
        }
        Update: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          avatar_url?: string | null
          backup_email?: string | null
          company_name?: string | null
          company_role?: string | null
          company_size?: string | null
          company_url?: string | null
          created_at?: string
          deal_updates_app?: boolean
          deal_updates_email?: boolean
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean
          email_task_assigned?: boolean | null
          first_name?: string | null
          id?: string
          in_app_notifications?: boolean
          last_name?: string | null
          lender_updates_app?: boolean
          lender_updates_email?: boolean
          notify_activity_deal_created?: boolean
          notify_activity_lender_added?: boolean
          notify_activity_lender_updated?: boolean
          notify_activity_milestone_added?: boolean
          notify_activity_milestone_completed?: boolean
          notify_activity_milestone_missed?: boolean
          notify_activity_stage_changed?: boolean
          notify_activity_status_changed?: boolean
          notify_flex_alerts?: boolean
          notify_info_request_emails?: boolean
          notify_stale_alerts?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          user_id?: string
          weekly_summary_email?: boolean
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sections: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_sections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          default_view: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_view?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          default_view?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_accounts: {
        Row: {
          account_sub_type: string | null
          account_type: string | null
          active: boolean | null
          classification: string | null
          created_at: string
          currency_ref: string | null
          current_balance: number | null
          description: string | null
          fully_qualified_name: string | null
          id: string
          metadata: Json | null
          name: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          account_sub_type?: string | null
          account_type?: string | null
          active?: boolean | null
          classification?: string | null
          created_at?: string
          currency_ref?: string | null
          current_balance?: number | null
          description?: string | null
          fully_qualified_name?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          account_sub_type?: string | null
          account_type?: string | null
          active?: boolean | null
          classification?: string | null
          created_at?: string
          currency_ref?: string | null
          current_balance?: number | null
          description?: string | null
          fully_qualified_name?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_bank_transactions: {
        Row: {
          account_ref_id: string | null
          account_ref_name: string | null
          created_at: string
          doc_number: string | null
          id: string
          line_items: Json | null
          metadata: Json | null
          private_note: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          txn_type: string
          user_id: string
        }
        Insert: {
          account_ref_id?: string | null
          account_ref_name?: string | null
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          private_note?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          txn_type: string
          user_id: string
        }
        Update: {
          account_ref_id?: string | null
          account_ref_name?: string | null
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          private_note?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          txn_type?: string
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_bills: {
        Row: {
          balance: number | null
          created_at: string
          doc_number: string | null
          due_date: string | null
          id: string
          line_items: Json | null
          metadata: Json | null
          private_note: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          user_id: string
          vendor_ref_id: string | null
          vendor_ref_name: string | null
        }
        Insert: {
          balance?: number | null
          created_at?: string
          doc_number?: string | null
          due_date?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          private_note?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id: string
          vendor_ref_id?: string | null
          vendor_ref_name?: string | null
        }
        Update: {
          balance?: number | null
          created_at?: string
          doc_number?: string | null
          due_date?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          private_note?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id?: string
          vendor_ref_id?: string | null
          vendor_ref_name?: string | null
        }
        Relationships: []
      }
      quickbooks_credit_memos: {
        Row: {
          balance: number | null
          created_at: string
          customer_ref_id: string | null
          customer_ref_name: string | null
          doc_number: string | null
          id: string
          line_items: Json | null
          metadata: Json | null
          qb_id: string
          realm_id: string
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          customer_ref_id?: string | null
          customer_ref_name?: string | null
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          qb_id: string
          realm_id: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          customer_ref_id?: string | null
          customer_ref_name?: string | null
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_customers: {
        Row: {
          active: boolean | null
          balance: number | null
          company_name: string | null
          display_name: string | null
          email: string | null
          family_name: string | null
          given_name: string | null
          id: string
          metadata: Json | null
          phone: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          balance?: number | null
          company_name?: string | null
          display_name?: string | null
          email?: string | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          metadata?: Json | null
          phone?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          balance?: number | null
          company_name?: string | null
          display_name?: string | null
          email?: string | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          metadata?: Json | null
          phone?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_estimates: {
        Row: {
          created_at: string
          customer_ref_id: string | null
          customer_ref_name: string | null
          doc_number: string | null
          expiration_date: string | null
          id: string
          line_items: Json | null
          metadata: Json | null
          qb_id: string
          realm_id: string
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          txn_status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_ref_id?: string | null
          customer_ref_name?: string | null
          doc_number?: string | null
          expiration_date?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          qb_id: string
          realm_id: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          txn_status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          customer_ref_id?: string | null
          customer_ref_name?: string | null
          doc_number?: string | null
          expiration_date?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          txn_status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_expenses: {
        Row: {
          account_ref_id: string | null
          account_ref_name: string | null
          created_at: string
          doc_number: string | null
          id: string
          line_items: Json | null
          metadata: Json | null
          payment_type: string | null
          private_note: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          user_id: string
          vendor_ref_id: string | null
          vendor_ref_name: string | null
        }
        Insert: {
          account_ref_id?: string | null
          account_ref_name?: string | null
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          payment_type?: string | null
          private_note?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id: string
          vendor_ref_id?: string | null
          vendor_ref_name?: string | null
        }
        Update: {
          account_ref_id?: string | null
          account_ref_name?: string | null
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          payment_type?: string | null
          private_note?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id?: string
          vendor_ref_id?: string | null
          vendor_ref_name?: string | null
        }
        Relationships: []
      }
      quickbooks_invoices: {
        Row: {
          balance: number | null
          customer_id: string | null
          customer_name: string | null
          doc_number: string | null
          due_date: string | null
          email_status: string | null
          id: string
          metadata: Json | null
          qb_id: string
          realm_id: string
          status: string | null
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          customer_id?: string | null
          customer_name?: string | null
          doc_number?: string | null
          due_date?: string | null
          email_status?: string | null
          id?: string
          metadata?: Json | null
          qb_id: string
          realm_id: string
          status?: string | null
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          customer_id?: string | null
          customer_name?: string | null
          doc_number?: string | null
          due_date?: string | null
          email_status?: string | null
          id?: string
          metadata?: Json | null
          qb_id?: string
          realm_id?: string
          status?: string | null
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_journal_entries: {
        Row: {
          adjustment: boolean | null
          created_at: string
          doc_number: string | null
          id: string
          line_items: Json | null
          metadata: Json | null
          private_note: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          user_id: string
        }
        Insert: {
          adjustment?: boolean | null
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          private_note?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id: string
        }
        Update: {
          adjustment?: boolean | null
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          private_note?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_payments: {
        Row: {
          customer_id: string | null
          customer_name: string | null
          id: string
          metadata: Json | null
          payment_method: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          user_id: string
        }
        Insert: {
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id: string
        }
        Update: {
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_purchase_orders: {
        Row: {
          created_at: string
          doc_number: string | null
          id: string
          line_items: Json | null
          metadata: Json | null
          qb_id: string
          realm_id: string
          status: string | null
          synced_at: string
          total_amt: number | null
          txn_date: string | null
          user_id: string
          vendor_ref_id: string | null
          vendor_ref_name: string | null
        }
        Insert: {
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          qb_id: string
          realm_id: string
          status?: string | null
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id: string
          vendor_ref_id?: string | null
          vendor_ref_name?: string | null
        }
        Update: {
          created_at?: string
          doc_number?: string | null
          id?: string
          line_items?: Json | null
          metadata?: Json | null
          qb_id?: string
          realm_id?: string
          status?: string | null
          synced_at?: string
          total_amt?: number | null
          txn_date?: string | null
          user_id?: string
          vendor_ref_id?: string | null
          vendor_ref_name?: string | null
        }
        Relationships: []
      }
      quickbooks_reports: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          period_end: string | null
          period_start: string | null
          realm_id: string
          report_data: Json
          report_date: string | null
          report_type: string
          synced_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          period_end?: string | null
          period_start?: string | null
          realm_id: string
          report_data: Json
          report_date?: string | null
          report_type: string
          synced_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          period_end?: string | null
          period_start?: string | null
          realm_id?: string
          report_data?: Json
          report_date?: string | null
          report_type?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_sync_history: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          realm_id: string
          records_synced: number | null
          started_at: string
          status: string
          sync_type: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          realm_id: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          realm_id?: string
          records_synced?: number | null
          started_at?: string
          status?: string
          sync_type?: string
          user_id?: string
        }
        Relationships: []
      }
      quickbooks_tokens: {
        Row: {
          access_token: string
          company_id: string | null
          company_name: string | null
          created_at: string
          expires_at: string
          id: string
          realm_id: string
          refresh_token: string
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          expires_at: string
          id?: string
          realm_id: string
          refresh_token: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          realm_id?: string
          refresh_token?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quickbooks_vendors: {
        Row: {
          active: boolean | null
          balance: number | null
          company_name: string | null
          created_at: string
          display_name: string | null
          email: string | null
          family_name: string | null
          given_name: string | null
          id: string
          metadata: Json | null
          phone: string | null
          qb_id: string
          realm_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          balance?: number | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          metadata?: Json | null
          phone?: string | null
          qb_id: string
          realm_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          balance?: number | null
          company_name?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          family_name?: string | null
          given_name?: string | null
          id?: string
          metadata?: Json | null
          phone?: string | null
          qb_id?: string
          realm_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          blocked_until: string | null
          created_at: string
          id: string
          ip_address: string
          is_bot: boolean | null
          path: string
          request_count: number
          updated_at: string
          user_agent: string | null
          window_start: string
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          ip_address: string
          is_bot?: boolean | null
          path: string
          request_count?: number
          updated_at?: string
          user_agent?: string | null
          window_start?: string
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          ip_address?: string
          is_bot?: boolean | null
          path?: string
          request_count?: number
          updated_at?: string
          user_agent?: string | null
          window_start?: string
        }
        Relationships: []
      }
      referral_sources: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_definitions: {
        Row: {
          ai_regenerate_on_run: boolean | null
          ai_summary_enabled: boolean | null
          company_id: string | null
          created_at: string
          data_sources: string[]
          description: string | null
          global_filters: Json | null
          id: string
          is_locked: boolean | null
          layout_config: Json | null
          name: string
          owner_user_id: string
          shared_with_user_ids: string[] | null
          updated_at: string
          visibility: string
        }
        Insert: {
          ai_regenerate_on_run?: boolean | null
          ai_summary_enabled?: boolean | null
          company_id?: string | null
          created_at?: string
          data_sources?: string[]
          description?: string | null
          global_filters?: Json | null
          id?: string
          is_locked?: boolean | null
          layout_config?: Json | null
          name: string
          owner_user_id: string
          shared_with_user_ids?: string[] | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          ai_regenerate_on_run?: boolean | null
          ai_summary_enabled?: boolean | null
          company_id?: string | null
          created_at?: string
          data_sources?: string[]
          description?: string | null
          global_filters?: Json | null
          id?: string
          is_locked?: boolean | null
          layout_config?: Json | null
          name?: string
          owner_user_id?: string
          shared_with_user_ids?: string[] | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_definitions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_runs: {
        Row: {
          ai_narrative: string | null
          ai_sources: Json | null
          completed_at: string | null
          created_at: string
          delivery_response: Json | null
          delivery_status: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          report_data: Json | null
          run_type: string | null
          scheduled_report_id: string
          started_at: string | null
          status: string
          summary_text: string | null
          user_id: string
        }
        Insert: {
          ai_narrative?: string | null
          ai_sources?: Json | null
          completed_at?: string | null
          created_at?: string
          delivery_response?: Json | null
          delivery_status?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          report_data?: Json | null
          run_type?: string | null
          scheduled_report_id: string
          started_at?: string | null
          status?: string
          summary_text?: string | null
          user_id: string
        }
        Update: {
          ai_narrative?: string | null
          ai_sources?: Json | null
          completed_at?: string | null
          created_at?: string
          delivery_response?: Json | null
          delivery_status?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          report_data?: Json | null
          run_type?: string | null
          scheduled_report_id?: string
          started_at?: string | null
          status?: string
          summary_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_runs_scheduled_report_id_fkey"
            columns: ["scheduled_report_id"]
            isOneToOne: false
            referencedRelation: "scheduled_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_widgets: {
        Row: {
          ai_annotation: string | null
          ai_annotation_sources: Json | null
          created_at: string
          id: string
          position: number
          query_config: Json | null
          report_id: string
          title: string | null
          type: string
          updated_at: string
          visualization_config: Json | null
          width: number
        }
        Insert: {
          ai_annotation?: string | null
          ai_annotation_sources?: Json | null
          created_at?: string
          id?: string
          position?: number
          query_config?: Json | null
          report_id: string
          title?: string | null
          type: string
          updated_at?: string
          visualization_config?: Json | null
          width?: number
        }
        Update: {
          ai_annotation?: string | null
          ai_annotation_sources?: Json | null
          created_at?: string
          id?: string
          position?: number
          query_config?: Json | null
          report_id?: string
          title?: string | null
          type?: string
          updated_at?: string
          visualization_config?: Json | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_widgets_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_actions: {
        Row: {
          action_config: Json
          action_id: string
          action_type: string
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          result: Json | null
          scheduled_for: string
          status: string
          trigger_data: Json
          user_id: string
          workflow_id: string
          workflow_run_id: string | null
        }
        Insert: {
          action_config?: Json
          action_id: string
          action_type: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          result?: Json | null
          scheduled_for: string
          status?: string
          trigger_data?: Json
          user_id: string
          workflow_id: string
          workflow_run_id?: string | null
        }
        Update: {
          action_config?: Json
          action_id?: string
          action_type?: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          result?: Json | null
          scheduled_for?: string
          status?: string
          trigger_data?: Json
          user_id?: string
          workflow_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_actions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          agent_id: string | null
          company_id: string | null
          created_at: string
          delivery_config: Json
          delivery_method: string
          description: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          next_run_at: string | null
          report_config: Json
          report_definition_id: string | null
          report_type: string
          schedule_cron: string
          schedule_timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          company_id?: string | null
          created_at?: string
          delivery_config?: Json
          delivery_method?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          report_config?: Json
          report_definition_id?: string | null
          report_type: string
          schedule_cron?: string
          schedule_timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          company_id?: string | null
          created_at?: string
          delivery_config?: Json
          delivery_method?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          report_config?: Json
          report_definition_id?: string | null
          report_type?: string
          schedule_cron?: string
          schedule_timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_reports_report_definition_id_fkey"
            columns: ["report_definition_id"]
            isOneToOne: false
            referencedRelation: "report_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      slack_agent_routes: {
        Row: {
          agent_id: string
          company_id: string | null
          config: Json | null
          created_at: string
          id: string
          is_active: boolean | null
          route_type: string
          slack_channel_id: string
          slack_channel_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          company_id?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          route_type?: string
          slack_channel_id: string
          slack_channel_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          company_id?: string | null
          config?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          route_type?: string
          slack_channel_id?: string
          slack_channel_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slack_agent_routes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slack_agent_routes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      spreadsheet_versions: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string | null
          version: number
          workbook_id: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          name?: string | null
          version: number
          workbook_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string | null
          version?: number
          workbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spreadsheet_versions_workbook_id_fkey"
            columns: ["workbook_id"]
            isOneToOne: false
            referencedRelation: "spreadsheet_workbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      spreadsheet_workbooks: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      subtask_checklist_items: {
        Row: {
          created_at: string
          id: string
          is_completed: boolean
          label: string
          position: number
          subtask_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_completed?: boolean
          label: string
          position?: number
          subtask_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_completed?: boolean
          label?: string
          position?: number
          subtask_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtask_checklist_items_subtask_id_fkey"
            columns: ["subtask_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      support_audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          resource_id: string | null
          resource_type: string
          support_user_id: string
          target_company_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type: string
          support_user_id: string
          target_company_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type?: string
          support_user_id?: string
          target_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_audit_logs_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sessions: {
        Row: {
          ended_at: string | null
          id: string
          started_at: string
          support_user_id: string
          target_company_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          started_at?: string
          support_user_id: string
          target_company_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          started_at?: string
          support_user_id?: string
          target_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_comments: {
        Row: {
          author_id: string | null
          author_type: string
          body: string
          created_at: string | null
          id: string
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_type: string
          body: string
          created_at?: string | null
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_type?: string
          body?: string
          created_at?: string | null
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to_user_id: string | null
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          priority: string | null
          requester_user_id: string
          source: string | null
          status: string
          subject: string
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          requester_user_id: string
          source?: string | null
          status?: string
          subject: string
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          requester_user_id?: string
          source?: string | null
          status?: string
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_schedule_settings: {
        Row: {
          created_at: string
          hs_enabled: boolean
          id: string
          interval_hours: number
          last_hs_sync: string | null
          last_qb_sync: string | null
          qb_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hs_enabled?: boolean
          id?: string
          interval_hours?: number
          last_hs_sync?: string | null
          last_qb_sync?: string | null
          qb_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hs_enabled?: boolean
          id?: string
          interval_hours?: number
          last_hs_sync?: string | null
          last_qb_sync?: string | null
          qb_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_announcements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          message: string
          show_from: string | null
          show_until: string | null
          target_roles: string[] | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message: string
          show_from?: string | null
          show_until?: string | null
          target_roles?: string[] | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          message?: string
          show_from?: string | null
          show_until?: string | null
          target_roles?: string[] | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      task_activity: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          task_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          task_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_collaborators: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          dependency_type: string
          depends_on_task_id: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          dependency_type?: string
          depends_on_task_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_followers: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_followers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_label_assignments: {
        Row: {
          created_at: string
          id: string
          label_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "task_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_label_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          color: string
          company_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          company_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_labels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_mentions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          is_read: boolean
          mentioned_by: string
          mentioned_user_id: string
          read_at: string | null
          source: string
          task_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          mentioned_by: string
          mentioned_user_id: string
          read_at?: string | null
          source?: string
          task_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          mentioned_by?: string
          mentioned_user_id?: string
          read_at?: string | null
          source?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_mentions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_projects: {
        Row: {
          created_at: string
          id: string
          project_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_projects_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_saved_views: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          position: number
          updated_at: string
          user_id: string
          view_config: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          updated_at?: string
          user_id: string
          view_config?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
          view_config?: Json
        }
        Relationships: []
      }
      task_tag_assignments: {
        Row: {
          id: string
          tag_id: string
          task_id: string
        }
        Insert: {
          id?: string
          tag_id: string
          task_id: string
        }
        Update: {
          id?: string
          tag_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "task_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tag_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          color: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          template_tasks: Json
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          template_tasks?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          template_tasks?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      task_time_entries: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          logged_date: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes: number
          id?: string
          logged_date?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          logged_date?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_watchers: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_watchers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          assigned_by: string
          assigned_to: string
          blocker_note: string | null
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_recurring: boolean
          is_starred: boolean
          lender_id: string | null
          parent_task_id: string | null
          position: number
          priority: string
          project_id: string | null
          recurrence_end_date: string | null
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          recurrence_source_id: string | null
          section_id: string | null
          start_date: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_by: string
          assigned_to: string
          blocker_note?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          is_starred?: boolean
          lender_id?: string | null
          parent_task_id?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          recurrence_end_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          section_id?: string | null
          start_date?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_by?: string
          assigned_to?: string
          blocker_note?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          is_starred?: boolean
          lender_id?: string | null
          parent_task_id?: string | null
          position?: number
          priority?: string
          project_id?: string | null
          recurrence_end_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          section_id?: string | null
          start_date?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "deal_lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_source_id_fkey"
            columns: ["recurrence_source_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "project_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      team_interaction_metrics: {
        Row: {
          breakdown: Json | null
          company_id: string
          created_at: string
          id: string
          metric_date: string
          metric_type: string
          metric_value: number
        }
        Insert: {
          breakdown?: Json | null
          company_id: string
          created_at?: string
          id?: string
          metric_date?: string
          metric_type: string
          metric_value: number
        }
        Update: {
          breakdown?: Json | null
          company_id?: string
          created_at?: string
          id?: string
          metric_date?: string
          metric_type?: string
          metric_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_interaction_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      template_favorites: {
        Row: {
          created_at: string
          id: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_favorites_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_versions: {
        Row: {
          actions: Json
          category: string
          change_summary: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          tags: string[] | null
          template_id: string
          trigger_config: Json
          trigger_type: string
          version_number: number
        }
        Insert: {
          actions?: Json
          category: string
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          tags?: string[] | null
          template_id: string
          trigger_config?: Json
          trigger_type: string
          version_number?: number
        }
        Update: {
          actions?: Json
          category?: string
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          tags?: string[] | null
          template_id?: string
          trigger_config?: Json
          trigger_type?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_jobs: {
        Row: {
          completed_at: string | null
          deal_id: string
          files_failed: number
          files_uploaded_successfully: number
          id: string
          initiated_at: string
          initiated_by: string
          job_type: string
          status: string
          total_files_detected: number
        }
        Insert: {
          completed_at?: string | null
          deal_id: string
          files_failed?: number
          files_uploaded_successfully?: number
          id?: string
          initiated_at?: string
          initiated_by: string
          job_type?: string
          status?: string
          total_files_detected?: number
        }
        Update: {
          completed_at?: string | null
          deal_id?: string
          files_failed?: number
          files_uploaded_successfully?: number
          id?: string
          initiated_at?: string
          initiated_by?: string
          job_type?: string
          status?: string
          total_files_detected?: number
        }
        Relationships: [
          {
            foreignKeyName: "upload_jobs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_behavior_insights: {
        Row: {
          category: string
          company_id: string | null
          created_at: string
          data: Json
          description: string
          dismissed_at: string | null
          expires_at: string | null
          id: string
          insight_type: string
          is_dismissed: boolean
          severity: string
          suggested_workflow_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          category: string
          company_id?: string | null
          created_at?: string
          data?: Json
          description: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          insight_type: string
          is_dismissed?: boolean
          severity?: string
          suggested_workflow_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string
          company_id?: string | null
          created_at?: string
          data?: Json
          description?: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          insight_type?: string
          is_dismissed?: boolean
          severity?: string
          suggested_workflow_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_behavior_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_behavior_insights_suggested_workflow_id_fkey"
            columns: ["suggested_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_data_permissions: {
        Row: {
          analytics_scope: Database["public"]["Enums"]["data_access_scope"]
          assigned_deal_ids: string[] | null
          can_bulk_edit: boolean
          can_delete: boolean
          can_export: boolean
          can_view_financials: boolean
          can_view_sensitive: boolean
          company_id: string | null
          created_at: string
          created_by: string | null
          deals_scope: Database["public"]["Enums"]["data_access_scope"]
          id: string
          insights_scope: Database["public"]["Enums"]["data_access_scope"]
          lenders_scope: Database["public"]["Enums"]["data_access_scope"]
          notes: string | null
          reports_scope: Database["public"]["Enums"]["data_access_scope"]
          updated_at: string
          user_id: string
        }
        Insert: {
          analytics_scope?: Database["public"]["Enums"]["data_access_scope"]
          assigned_deal_ids?: string[] | null
          can_bulk_edit?: boolean
          can_delete?: boolean
          can_export?: boolean
          can_view_financials?: boolean
          can_view_sensitive?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deals_scope?: Database["public"]["Enums"]["data_access_scope"]
          id?: string
          insights_scope?: Database["public"]["Enums"]["data_access_scope"]
          lenders_scope?: Database["public"]["Enums"]["data_access_scope"]
          notes?: string | null
          reports_scope?: Database["public"]["Enums"]["data_access_scope"]
          updated_at?: string
          user_id: string
        }
        Update: {
          analytics_scope?: Database["public"]["Enums"]["data_access_scope"]
          assigned_deal_ids?: string[] | null
          can_bulk_edit?: boolean
          can_delete?: boolean
          can_export?: boolean
          can_view_financials?: boolean
          can_view_sensitive?: boolean
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deals_scope?: Database["public"]["Enums"]["data_access_scope"]
          id?: string
          insights_scope?: Database["public"]["Enums"]["data_access_scope"]
          lenders_scope?: Database["public"]["Enums"]["data_access_scope"]
          notes?: string | null
          reports_scope?: Database["public"]["Enums"]["data_access_scope"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_data_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          channel_overrides: Json
          created_at: string
          custom_recipients: Json | null
          id: string
          is_enabled: boolean
          trigger_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_overrides?: Json
          created_at?: string
          custom_recipients?: Json | null
          id?: string
          is_enabled?: boolean
          trigger_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_overrides?: Json
          created_at?: string
          custom_recipients?: Json | null
          id?: string
          is_enabled?: boolean
          trigger_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          permissions: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quick_prompts: {
        Row: {
          category: string | null
          created_at: string
          icon: string | null
          id: string
          position: number | null
          prompt: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          position?: number | null
          prompt: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          position?: number | null
          prompt?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ux_accessibility_issues: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          element_selector: string | null
          id: string
          is_resolved: boolean | null
          issue_type: string
          page_path: string
          severity: string
          user_id: string | null
          wcag_criteria: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          element_selector?: string | null
          id?: string
          is_resolved?: boolean | null
          issue_type: string
          page_path: string
          severity: string
          user_id?: string | null
          wcag_criteria?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          element_selector?: string | null
          id?: string
          is_resolved?: boolean | null
          issue_type?: string
          page_path?: string
          severity?: string
          user_id?: string | null
          wcag_criteria?: string | null
        }
        Relationships: []
      }
      ux_click_heatmap: {
        Row: {
          click_count: number | null
          company_id: string | null
          created_at: string
          device_type: string | null
          element_selector: string
          element_text: string | null
          id: string
          page_path: string
          session_id: string
          user_id: string | null
          x_percent: number | null
          y_percent: number | null
        }
        Insert: {
          click_count?: number | null
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          element_selector: string
          element_text?: string | null
          id?: string
          page_path: string
          session_id: string
          user_id?: string | null
          x_percent?: number | null
          y_percent?: number | null
        }
        Update: {
          click_count?: number | null
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          element_selector?: string
          element_text?: string | null
          id?: string
          page_path?: string
          session_id?: string
          user_id?: string | null
          x_percent?: number | null
          y_percent?: number | null
        }
        Relationships: []
      }
      ux_client_errors: {
        Row: {
          company_id: string | null
          component_name: string | null
          created_at: string
          error_message: string | null
          error_stack: string | null
          error_type: string
          id: string
          page_path: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          component_name?: string | null
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          error_type: string
          id?: string
          page_path: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          component_name?: string | null
          created_at?: string
          error_message?: string | null
          error_stack?: string | null
          error_type?: string
          id?: string
          page_path?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ux_feature_usage: {
        Row: {
          action_type: string
          company_id: string | null
          created_at: string
          feature_name: string
          id: string
          metadata: Json | null
          page_path: string | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          company_id?: string | null
          created_at?: string
          feature_name: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          company_id?: string | null
          created_at?: string
          feature_name?: string
          id?: string
          metadata?: Json | null
          page_path?: string | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ux_navigation_events: {
        Row: {
          company_id: string | null
          created_at: string
          device_type: string | null
          from_path: string | null
          id: string
          is_bounce: boolean | null
          is_exit: boolean | null
          scroll_depth_percent: number | null
          session_id: string
          time_on_previous_page_ms: number | null
          to_path: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          from_path?: string | null
          id?: string
          is_bounce?: boolean | null
          is_exit?: boolean | null
          scroll_depth_percent?: number | null
          session_id: string
          time_on_previous_page_ms?: number | null
          to_path: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          from_path?: string | null
          id?: string
          is_bounce?: boolean | null
          is_exit?: boolean | null
          scroll_depth_percent?: number | null
          session_id?: string
          time_on_previous_page_ms?: number | null
          to_path?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ux_performance_metrics: {
        Row: {
          company_id: string | null
          created_at: string
          device_type: string | null
          id: string
          metric_type: string
          page_path: string
          rating: string | null
          session_id: string
          user_id: string | null
          value_ms: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          metric_type: string
          page_path: string
          rating?: string | null
          session_id: string
          user_id?: string | null
          value_ms?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          metric_type?: string
          page_path?: string
          rating?: string | null
          session_id?: string
          user_id?: string | null
          value_ms?: number | null
        }
        Relationships: []
      }
      ux_rage_clicks: {
        Row: {
          click_count: number | null
          company_id: string | null
          created_at: string
          device_type: string | null
          element_selector: string | null
          element_text: string | null
          id: string
          page_path: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          click_count?: number | null
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          element_selector?: string | null
          element_text?: string | null
          id?: string
          page_path: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          click_count?: number | null
          company_id?: string | null
          created_at?: string
          device_type?: string | null
          element_selector?: string | null
          element_text?: string | null
          id?: string
          page_path?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ux_search_events: {
        Row: {
          clicked_result_index: number | null
          company_id: string | null
          created_at: string
          filters_used: Json | null
          id: string
          page_path: string
          query: string
          results_count: number | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          clicked_result_index?: number | null
          company_id?: string | null
          created_at?: string
          filters_used?: Json | null
          id?: string
          page_path: string
          query: string
          results_count?: number | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          clicked_result_index?: number | null
          company_id?: string | null
          created_at?: string
          filters_used?: Json | null
          id?: string
          page_path?: string
          query?: string
          results_count?: number | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ux_user_feedback: {
        Row: {
          category: string | null
          comment: string | null
          company_id: string | null
          created_at: string
          id: string
          page_path: string
          rating: number | null
          session_id: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          comment?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          page_path: string
          rating?: number | null
          session_id: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          comment?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          page_path?: string
          rating?: number | null
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      vdr_document_account_tags: {
        Row: {
          account_category: string
          confidence_score: number | null
          created_at: string
          deal_id: string
          document_id: string
          id: string
        }
        Insert: {
          account_category: string
          confidence_score?: number | null
          created_at?: string
          deal_id: string
          document_id: string
          id?: string
        }
        Update: {
          account_category?: string
          confidence_score?: number | null
          created_at?: string
          deal_id?: string
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdr_document_account_tags_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vdr_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_document_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          company_id: string | null
          created_at: string
          deal_id: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index?: number
          chunk_text: string
          company_id?: string | null
          created_at?: string
          deal_id: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          company_id?: string | null
          created_at?: string
          deal_id?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "vdr_document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vdr_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_document_entities: {
        Row: {
          context_snippet: string | null
          created_at: string
          deal_id: string
          document_id: string
          entity_type: string
          entity_value: string
          id: string
        }
        Insert: {
          context_snippet?: string | null
          created_at?: string
          deal_id: string
          document_id: string
          entity_type: string
          entity_value: string
          id?: string
        }
        Update: {
          context_snippet?: string | null
          created_at?: string
          deal_id?: string
          document_id?: string
          entity_type?: string
          entity_value?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdr_document_entities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vdr_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_documents: {
        Row: {
          chunk_count: number | null
          company_id: string | null
          created_at: string
          deal_id: string
          entity_count: number | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          filename: string
          folder_path: string
          id: string
          ingestion_status: string | null
          is_folder: boolean
          sort_order: number | null
          source: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          chunk_count?: number | null
          company_id?: string | null
          created_at?: string
          deal_id: string
          entity_count?: number | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          filename: string
          folder_path?: string
          id?: string
          ingestion_status?: string | null
          is_folder?: boolean
          sort_order?: number | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          chunk_count?: number | null
          company_id?: string | null
          created_at?: string
          deal_id?: string
          entity_count?: number | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string
          folder_path?: string
          id?: string
          ingestion_status?: string | null
          is_folder?: boolean
          sort_order?: number | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vdr_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vdr_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_irl_document_matches: {
        Row: {
          confidence_score: number
          created_at: string
          deal_id: string
          document_id: string
          explanation: string | null
          flagged_mislabel: boolean | null
          id: string
          irl_request_id: string
          match_type: string
          status: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          deal_id: string
          document_id: string
          explanation?: string | null
          flagged_mislabel?: boolean | null
          id?: string
          irl_request_id: string
          match_type?: string
          status?: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          deal_id?: string
          document_id?: string
          explanation?: string | null
          flagged_mislabel?: boolean | null
          id?: string
          irl_request_id?: string
          match_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdr_irl_document_matches_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vdr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vdr_irl_document_matches_irl_request_id_fkey"
            columns: ["irl_request_id"]
            isOneToOne: false
            referencedRelation: "vdr_irl_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_irl_requests: {
        Row: {
          category: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
          request_name: string
          request_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
          request_name: string
          request_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          request_name?: string
          request_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdr_irl_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vdr_irl_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_task_document_links: {
        Row: {
          document_id: string
          id: string
          task_id: string
        }
        Insert: {
          document_id: string
          id?: string
          task_id: string
        }
        Update: {
          document_id?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdr_task_document_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vdr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vdr_task_document_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "vdr_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_task_request_links: {
        Row: {
          id: string
          irl_request_id: string
          task_id: string
        }
        Insert: {
          id?: string
          irl_request_id: string
          task_id: string
        }
        Update: {
          id?: string
          irl_request_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdr_task_request_links_irl_request_id_fkey"
            columns: ["irl_request_id"]
            isOneToOne: false
            referencedRelation: "vdr_irl_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vdr_task_request_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "vdr_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      vdr_tasks: {
        Row: {
          assignee: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          hours_allocated: number | null
          id: string
          instructions: string | null
          status: string
          task_name: string
          task_type: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          hours_allocated?: number | null
          id?: string
          instructions?: string | null
          status?: string
          task_name: string
          task_type?: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          hours_allocated?: number | null
          id?: string
          instructions?: string | null
          status?: string
          task_name?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vdr_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vdr_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      video_resources: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          duration_seconds: number | null
          id: string
          level: string | null
          status: string
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_url: string
          view_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          level?: string | null
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_url: string
          view_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          duration_seconds?: number | null
          id?: string
          level?: string | null
          status?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string
          view_count?: number | null
        }
        Relationships: []
      }
      video_views: {
        Row: {
          company_id: string | null
          completed_at: string | null
          id: string
          started_at: string | null
          user_id: string | null
          video_resource_id: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          id?: string
          started_at?: string | null
          user_id?: string | null
          video_resource_id: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          id?: string
          started_at?: string | null
          user_id?: string | null
          video_resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_views_video_resource_id_fkey"
            columns: ["video_resource_id"]
            isOneToOne: false
            referencedRelation: "video_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company: string | null
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      weekly_hours_tasks: {
        Row: {
          company_id: string | null
          completed_at: string | null
          created_at: string
          deals_submitted: number
          id: string
          status: string
          total_deals: number
          updated_at: string
          user_id: string
          week_start_date: string
        }
        Insert: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          deals_submitted?: number
          id?: string
          status?: string
          total_deals?: number
          updated_at?: string
          user_id: string
          week_start_date: string
        }
        Update: {
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          deals_submitted?: number
          id?: string
          status?: string
          total_deals?: number
          updated_at?: string
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_hours_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_time_entries: {
        Row: {
          created_at: string
          deal_id: string
          hours: number
          id: string
          source: string
          updated_at: string
          user_id: string
          week_start_date: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          hours?: number
          id?: string
          source?: string
          updated_at?: string
          user_id: string
          week_start_date: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          hours?: number
          id?: string
          source?: string
          updated_at?: string
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_time_entries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_agreements: {
        Row: {
          clauses_json: Json | null
          created_at: string
          deal_id: string
          file_url: string | null
          id: string
          org_company_id: string | null
          signed_at: string | null
          type: Database["public"]["Enums"]["wf_agreement_type"]
          updated_at: string
        }
        Insert: {
          clauses_json?: Json | null
          created_at?: string
          deal_id: string
          file_url?: string | null
          id?: string
          org_company_id?: string | null
          signed_at?: string | null
          type?: Database["public"]["Enums"]["wf_agreement_type"]
          updated_at?: string
        }
        Update: {
          clauses_json?: Json | null
          created_at?: string
          deal_id?: string
          file_url?: string | null
          id?: string
          org_company_id?: string | null
          signed_at?: string | null
          type?: Database["public"]["Enums"]["wf_agreement_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_agreements_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "wf_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_agreements_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_contacts: {
        Row: {
          created_at: string
          email: string | null
          firm_name: string | null
          id: string
          is_client: boolean
          is_lender: boolean
          last_contacted_at: string | null
          name: string
          notes: string | null
          org_company_id: string | null
          owner_user_id: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          firm_name?: string | null
          id?: string
          is_client?: boolean
          is_lender?: boolean
          last_contacted_at?: string | null
          name: string
          notes?: string | null
          org_company_id?: string | null
          owner_user_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          firm_name?: string | null
          id?: string
          is_client?: boolean
          is_lender?: boolean
          last_contacted_at?: string | null
          name?: string
          notes?: string | null
          org_company_id?: string | null
          owner_user_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_contacts_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_deals: {
        Row: {
          agreement_status: string | null
          analyst_id: string | null
          client_email: string | null
          company_name: string | null
          created_at: string
          current_workflow: string | null
          funding_status: string | null
          id: string
          last_client_touch_at: string | null
          manager_id: string | null
          name: string
          ops_id: string | null
          org_company_id: string | null
          proposal_status: string | null
          stage: Database["public"]["Enums"]["wf_deal_stage"]
          updated_at: string
        }
        Insert: {
          agreement_status?: string | null
          analyst_id?: string | null
          client_email?: string | null
          company_name?: string | null
          created_at?: string
          current_workflow?: string | null
          funding_status?: string | null
          id?: string
          last_client_touch_at?: string | null
          manager_id?: string | null
          name: string
          ops_id?: string | null
          org_company_id?: string | null
          proposal_status?: string | null
          stage?: Database["public"]["Enums"]["wf_deal_stage"]
          updated_at?: string
        }
        Update: {
          agreement_status?: string | null
          analyst_id?: string | null
          client_email?: string | null
          company_name?: string | null
          created_at?: string
          current_workflow?: string | null
          funding_status?: string | null
          id?: string
          last_client_touch_at?: string | null
          manager_id?: string | null
          name?: string
          ops_id?: string | null
          org_company_id?: string | null
          proposal_status?: string | null
          stage?: Database["public"]["Enums"]["wf_deal_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_deals_analyst_id_fkey"
            columns: ["analyst_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_deals_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_deals_ops_id_fkey"
            columns: ["ops_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_deals_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_emails_queue: {
        Row: {
          body: string | null
          created_at: string
          deal_id: string | null
          id: string
          last_error: string | null
          opened_at: string | null
          org_company_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["wf_email_status"]
          subject: string
          template_key: string | null
          to_email: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          last_error?: string | null
          opened_at?: string | null
          org_company_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wf_email_status"]
          subject: string
          template_key?: string | null
          to_email: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          last_error?: string | null
          opened_at?: string | null
          org_company_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wf_email_status"]
          subject?: string
          template_key?: string | null
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_emails_queue_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "wf_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_emails_queue_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_invoices: {
        Row: {
          amount: number | null
          created_at: string
          deal_id: string
          id: string
          link_url: string | null
          org_company_id: string | null
          paid_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["wf_invoice_status"]
          type: Database["public"]["Enums"]["wf_invoice_type"]
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          deal_id: string
          id?: string
          link_url?: string | null
          org_company_id?: string | null
          paid_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wf_invoice_status"]
          type?: Database["public"]["Enums"]["wf_invoice_type"]
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          deal_id?: string
          id?: string
          link_url?: string | null
          org_company_id?: string | null
          paid_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["wf_invoice_status"]
          type?: Database["public"]["Enums"]["wf_invoice_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_invoices_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "wf_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_invoices_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_lenders: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          org_company_id: string | null
          primary_contact_id: string | null
          terms_profile_json: Json | null
          type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          org_company_id?: string | null
          primary_contact_id?: string | null
          terms_profile_json?: Json | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          org_company_id?: string | null
          primary_contact_id?: string | null
          terms_profile_json?: Json | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_lenders_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_lenders_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "wf_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_meeting_notes: {
        Row: {
          ai_summary: string | null
          calendar_event_id: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          id: string
          notes: string | null
          org_company_id: string | null
          type: Database["public"]["Enums"]["wf_meeting_type"]
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          calendar_event_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          notes?: string | null
          org_company_id?: string | null
          type?: Database["public"]["Enums"]["wf_meeting_type"]
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          calendar_event_id?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          notes?: string | null
          org_company_id?: string | null
          type?: Database["public"]["Enums"]["wf_meeting_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_meeting_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "wf_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_meeting_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "wf_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_meeting_notes_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by_id: string | null
          deal_id: string | null
          description: string | null
          due_at: string | null
          id: string
          is_recurring: boolean
          org_company_id: string | null
          recurrence_rule_json: Json | null
          status: Database["public"]["Enums"]["wf_task_status"]
          title: string
          trigger_source: Database["public"]["Enums"]["wf_trigger_source"]
          updated_at: string
          workflow_key: string | null
          workflow_owner_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_recurring?: boolean
          org_company_id?: string | null
          recurrence_rule_json?: Json | null
          status?: Database["public"]["Enums"]["wf_task_status"]
          title: string
          trigger_source?: Database["public"]["Enums"]["wf_trigger_source"]
          updated_at?: string
          workflow_key?: string | null
          workflow_owner_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_recurring?: boolean
          org_company_id?: string | null
          recurrence_rule_json?: Json | null
          status?: Database["public"]["Enums"]["wf_task_status"]
          title?: string
          trigger_source?: Database["public"]["Enums"]["wf_trigger_source"]
          updated_at?: string
          workflow_key?: string | null
          workflow_owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wf_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_tasks_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "wf_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_tasks_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_tasks_workflow_owner_id_fkey"
            columns: ["workflow_owner_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_term_sheets: {
        Row: {
          created_at: string
          deal_id: string
          file_url: string | null
          id: string
          lender_id: string | null
          org_company_id: string | null
          received_at: string | null
          signed_at: string | null
          status: Database["public"]["Enums"]["wf_term_sheet_status"]
          summary_json: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          file_url?: string | null
          id?: string
          lender_id?: string | null
          org_company_id?: string | null
          received_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["wf_term_sheet_status"]
          summary_json?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          file_url?: string | null
          id?: string
          lender_id?: string | null
          org_company_id?: string | null
          received_at?: string | null
          signed_at?: string | null
          status?: Database["public"]["Enums"]["wf_term_sheet_status"]
          summary_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_term_sheets_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "wf_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_term_sheets_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "wf_lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_term_sheets_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_users: {
        Row: {
          auth_user_id: string | null
          company_id: string | null
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["wf_user_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          role?: Database["public"]["Enums"]["wf_user_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["wf_user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_workflow_preferences: {
        Row: {
          created_at: string
          default_due_offset_days: number | null
          enabled: boolean
          grouped_mode: boolean
          id: string
          notify_via_email: boolean
          org_company_id: string | null
          stage: Database["public"]["Enums"]["wf_deal_stage"] | null
          task_type_key: string | null
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          default_due_offset_days?: number | null
          enabled?: boolean
          grouped_mode?: boolean
          id?: string
          notify_via_email?: boolean
          org_company_id?: string | null
          stage?: Database["public"]["Enums"]["wf_deal_stage"] | null
          task_type_key?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          default_due_offset_days?: number | null
          enabled?: boolean
          grouped_mode?: boolean
          id?: string
          notify_via_email?: boolean
          org_company_id?: string | null
          stage?: Database["public"]["Enums"]["wf_deal_stage"] | null
          task_type_key?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wf_workflow_preferences_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_workflow_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_workflows: {
        Row: {
          created_at: string
          default_owner_role: Database["public"]["Enums"]["wf_owner_role"]
          default_owner_user_id: string | null
          description: string | null
          id: string
          is_active: boolean
          key: string
          name: string
          org_company_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_owner_role?: Database["public"]["Enums"]["wf_owner_role"]
          default_owner_user_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          name: string
          org_company_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_owner_role?: Database["public"]["Enums"]["wf_owner_role"]
          default_owner_user_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          org_company_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_workflows_default_owner_user_id_fkey"
            columns: ["default_owner_user_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_workflows_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_workflows_log: {
        Row: {
          created_at: string
          deal_id: string | null
          id: string
          metadata_json: Json | null
          org_company_id: string | null
          owner_user_id: string | null
          trigger_type: Database["public"]["Enums"]["wf_trigger_type"]
          workflow_id: string | null
          workflow_name: string
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          id?: string
          metadata_json?: Json | null
          org_company_id?: string | null
          owner_user_id?: string | null
          trigger_type: Database["public"]["Enums"]["wf_trigger_type"]
          workflow_id?: string | null
          workflow_name: string
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          id?: string
          metadata_json?: Json | null
          org_company_id?: string | null
          owner_user_id?: string | null
          trigger_type?: Database["public"]["Enums"]["wf_trigger_type"]
          workflow_id?: string | null
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_workflows_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "wf_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_workflows_log_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_workflows_log_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "wf_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wf_workflows_log_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "wf_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          id: string
          results: Json
          started_at: string
          status: string
          trigger_data: Json
          user_id: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          results?: Json
          started_at?: string
          status?: string
          trigger_data?: Json
          user_id: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          id?: string
          results?: Json
          started_at?: string
          status?: string
          trigger_data?: Json
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_suggestions: {
        Row: {
          actions: Json
          applied_at: string | null
          company_id: string | null
          created_at: string
          description: string
          dismissed_at: string | null
          id: string
          insight_id: string | null
          is_applied: boolean
          is_dismissed: boolean
          name: string
          priority: string
          reasoning: string
          trigger_config: Json
          trigger_type: string
          user_id: string
        }
        Insert: {
          actions?: Json
          applied_at?: string | null
          company_id?: string | null
          created_at?: string
          description: string
          dismissed_at?: string | null
          id?: string
          insight_id?: string | null
          is_applied?: boolean
          is_dismissed?: boolean
          name: string
          priority?: string
          reasoning: string
          trigger_config?: Json
          trigger_type: string
          user_id: string
        }
        Update: {
          actions?: Json
          applied_at?: string | null
          company_id?: string | null
          created_at?: string
          description?: string
          dismissed_at?: string | null
          id?: string
          insight_id?: string | null
          is_applied?: boolean
          is_dismissed?: boolean
          name?: string
          priority?: string
          reasoning?: string
          trigger_config?: Json
          trigger_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_suggestions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_suggestions_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "user_behavior_insights"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          actions: Json
          category: string
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_shared: boolean
          name: string
          tags: string[] | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          actions?: Json
          category?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_shared?: boolean
          name: string
          tags?: string[] | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          actions?: Json
          category?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_shared?: boolean
          name?: string
          tags?: string[] | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          actions: Json
          change_summary: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger_config: Json
          trigger_type: string
          version_number: number
          workflow_id: string
        }
        Insert: {
          actions?: Json
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger_config?: Json
          trigger_type: string
          version_number?: number
          workflow_id: string
        }
        Update: {
          actions?: Json
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger_config?: Json
          trigger_type?: string
          version_number?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          actions: Json
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          template_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions?: Json
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions?: Json
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      zapier_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json | null
          response_body: string | null
          status_code: number | null
          success: boolean
          webhook_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          status_code?: number | null
          success?: boolean
          webhook_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          status_code?: number | null
          success?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zapier_webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "zapier_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      zapier_webhooks: {
        Row: {
          company_id: string | null
          created_at: string
          event_types: string[]
          id: string
          is_active: boolean
          label: string
          updated_at: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          event_types?: string[]
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
          user_id: string
          webhook_url: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          event_types?: string[]
          id?: string
          is_active?: boolean
          label?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "zapier_webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agent_suggestion_stats: {
        Row: {
          apply_count: number | null
          apply_rate_percent: number | null
          avg_decision_time_seconds: number | null
          deep_dive_count: number | null
          dismiss_count: number | null
          suggestion_category: string | null
          suggestion_priority: string | null
          view_count: number | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          onboarding_completed: boolean | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          onboarding_completed?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_add_company_member: {
        Args: {
          _company_id: string
          _role?: Database["public"]["Enums"]["company_role"]
          _user_email: string
        }
        Returns: undefined
      }
      admin_approve_user: { Args: { _user_id: string }; Returns: undefined }
      admin_archive_company: {
        Args: { _archive: boolean; _company_id: string; _reason?: string }
        Returns: undefined
      }
      admin_bulk_approve_users: {
        Args: { _user_ids: string[] }
        Returns: {
          display_name: string
          email: string
          user_id: string
        }[]
      }
      admin_delete_company: {
        Args: { _company_id: string }
        Returns: undefined
      }
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_get_all_companies: {
        Args: never
        Returns: {
          created_at: string
          employee_size: string
          id: string
          industry: string
          logo_url: string
          member_count: number
          name: string
          website_url: string
        }[]
      }
      admin_get_all_invitations: {
        Args: never
        Returns: {
          accepted_at: string
          company_id: string
          company_name: string
          created_at: string
          email: string
          email_status: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
        }[]
      }
      admin_get_all_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          first_name: string
          id: string
          last_name: string
          onboarding_completed: boolean
          user_id: string
        }[]
      }
      admin_get_audit_logs: {
        Args: { _limit?: number; _offset?: number }
        Returns: {
          action_type: string
          admin_email: string
          admin_name: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          target_id: string
          target_name: string
          target_type: string
        }[]
      }
      admin_get_company_activity: {
        Args: { _company_id: string; _limit?: number }
        Returns: {
          activity_type: string
          created_at: string
          deal_id: string
          deal_name: string
          description: string
          id: string
          user_name: string
        }[]
      }
      admin_get_company_members: {
        Args: { _company_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }[]
      }
      admin_get_company_stats: {
        Args: { _company_id: string }
        Returns: {
          active_deals: number
          total_deal_value: number
          total_deals: number
          total_lenders: number
        }[]
      }
      admin_get_pending_approvals: {
        Args: never
        Returns: {
          approval_requested_at: string
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          first_name: string
          last_name: string
          user_id: string
        }[]
      }
      admin_get_system_stats: {
        Args: never
        Returns: {
          active_deals: number
          total_companies: number
          total_deals: number
          total_lenders: number
          total_users: number
          waitlist_count: number
        }[]
      }
      admin_remove_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: undefined
      }
      admin_revoke_approval: { Args: { _user_id: string }; Returns: undefined }
      admin_toggle_company_suspension: {
        Args: { _company_id: string; _reason?: string; _suspend: boolean }
        Returns: undefined
      }
      admin_toggle_user_suspension: {
        Args: { _reason?: string; _suspend: boolean; _user_id: string }
        Returns: undefined
      }
      admin_update_company_member_role: {
        Args: {
          _company_id: string
          _new_role: Database["public"]["Enums"]["company_role"]
          _user_id: string
        }
        Returns: undefined
      }
      approve_join_request: {
        Args: {
          _request_id: string
          _role?: Database["public"]["Enums"]["company_role"]
        }
        Returns: undefined
      }
      calculate_next_schedule: {
        Args: { cron_expression: string; timezone?: string }
        Returns: string
      }
      can_access_deal: {
        Args: { _deal_id: string; _user_id: string }
        Returns: boolean
      }
      can_delete_lenders: { Args: { _user_id: string }; Returns: boolean }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_user_workspace: {
        Args: {
          _company_name?: string
          _company_size?: string
          _company_url?: string
        }
        Returns: string
      }
      find_companies_by_domain: {
        Args: { _domain: string }
        Returns: {
          id: string
          logo_url: string
          member_count: number
          name: string
          primary_domain: string
        }[]
      }
      get_company_join_requests: {
        Args: { _company_id: string; _status?: string }
        Returns: {
          created_at: string
          decided_by_name: string
          decision_at: string
          id: string
          note: string
          rejection_note: string
          status: string
          user_avatar_url: string
          user_display_name: string
          user_email: string
          user_id: string
        }[]
      }
      get_lender_deal_stats: {
        Args: { _company_id: string; _limit?: number }
        Returns: {
          active_count: number
          deal_count: number
          funded_count: number
          lender_name: string
          total_volume: number
        }[]
      }
      get_team_members_for_mention: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          email: string
          first_name: string
          last_name: string
          user_id: string
        }[]
      }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_company_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_company_role: {
        Args: { _company_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["company_role"]
      }
      get_user_data_scope: {
        Args: { _company_id: string; _scope_type: string; _user_id: string }
        Returns: Database["public"]["Enums"]["data_access_scope"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_5thline_user: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_same_company_as_user: {
        Args: { _current_user_id: string; _deal_owner_id: string }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          _action_type: string
          _details?: Json
          _target_id?: string
          _target_name?: string
          _target_type: string
        }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reject_join_request: {
        Args: { _rejection_note?: string; _request_id: string }
        Returns: undefined
      }
      save_fpa_dashboard_config: {
        Args: { _company_id: string; _config_key: string; _config_value: Json }
        Returns: undefined
      }
      search_lenders_keyword: {
        Args: { _limit?: number; _offset?: number; _search_query: string }
        Returns: {
          lender_id: string
          relevance_score: number
          total_count: number
        }[]
      }
      seed_new_company_defaults: {
        Args: { _company_id: string }
        Returns: undefined
      }
      vdr_search_chunks: {
        Args: {
          _deal_id: string
          _match_count?: number
          _query_embedding: string
        }
        Returns: {
          chunk_text: string
          document_id: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "support_admin"
      claap_meeting_status:
        | "pending_review"
        | "routed"
        | "excluded"
        | "awaiting_confirmation"
      claap_task_status: "pending" | "completed" | "expired" | "dismissed"
      claap_task_type:
        | "confirm_contact"
        | "confirm_company"
        | "create_deal"
        | "disambiguate_deal"
      client_draft_status: "needs_approval" | "approved" | "rejected" | "sent"
      client_request_status:
        | "pending"
        | "queued_for_email"
        | "included_in_draft"
        | "approved"
        | "sent"
      company_role: "owner" | "admin" | "member"
      contact_buying_role:
        | "economic_buyer"
        | "champion"
        | "influencer"
        | "user"
        | "blocker"
        | "legal"
        | "finance"
        | "other"
      contact_lifecycle_stage:
        | "subscriber"
        | "lead"
        | "mql"
        | "sql"
        | "opportunity"
        | "customer"
        | "evangelist"
        | "other"
      contact_status:
        | "new"
        | "working"
        | "meeting_scheduled"
        | "no_show"
        | "no_fit"
        | "nurture"
        | "bad_data"
        | "converted"
        | "closed"
      copilot_preference_category:
        | "formatting"
        | "terminology"
        | "behavior"
        | "domain_knowledge"
      copilot_preference_source: "manual" | "thumbs_down" | "chat_command"
      crm_company_lifecycle:
        | "target"
        | "engaged"
        | "opportunity"
        | "customer"
        | "expansion"
        | "churn_risk"
      crm_company_status: "active" | "inactive" | "target" | "churned"
      crm_company_type:
        | "customer"
        | "prospect"
        | "partner"
        | "vendor"
        | "internal"
        | "other"
      data_access_scope: "all" | "team" | "own" | "none"
      feature_status: "disabled" | "staging" | "deployed" | "james_only"
      financial_period_type: "monthly" | "quarterly" | "annual"
      financial_statement_type: "pnl" | "balance_sheet" | "cash_flow"
      lender_pass_reason_category:
        | "deal_size_mismatch"
        | "industry_exclusion"
        | "geographic_restriction"
        | "risk_profile_concerns"
        | "timing_issues"
        | "relationship_issues"
        | "terms_mismatch"
        | "other"
      notification_category:
        | "deals"
        | "tasks"
        | "lenders"
        | "milestones"
        | "reporting"
        | "system"
      notification_channel_type: "in_app" | "email" | "slack" | "sms" | "push"
      notification_instance_status: "pending" | "sent" | "failed" | "skipped"
      wf_agreement_type: "nda" | "engagement" | "amendment" | "other"
      wf_deal_stage:
        | "nda_needs_list_sent"
        | "pre_credit_needs"
        | "analyst_completes_review"
        | "not_moving_forward"
        | "manager_approves_preview"
        | "initial_lender_review"
        | "initial_feedback_call"
        | "prop_in_dev"
        | "prop_issued"
        | "agreement_pending"
        | "final_credit_items"
        | "client_strategy_review"
        | "write_up_pending"
        | "submitted_to_lenders"
        | "lenders_in_review"
        | "terms_issued_analysis"
        | "terms_issued_payment"
        | "due_diligence_client"
        | "funded_naitive"
        | "funded_payment"
        | "funded_feedback_testimonials"
        | "funded_lender_review"
      wf_email_status: "pending" | "sent" | "failed"
      wf_invoice_status: "draft" | "sent" | "paid"
      wf_invoice_type: "retainer" | "milestone" | "final"
      wf_meeting_type:
        | "sales"
        | "bd"
        | "educational"
        | "kick_off"
        | "lender_meeting"
        | "other"
      wf_owner_role: "manager" | "analyst" | "ops" | "system"
      wf_task_status: "open" | "in_progress" | "done"
      wf_term_sheet_status:
        | "draft"
        | "received"
        | "approved"
        | "signed"
        | "rejected"
      wf_trigger_source:
        | "stage_change"
        | "calendar"
        | "email"
        | "manual"
        | "external"
      wf_trigger_type:
        | "stage_change"
        | "calendar_event"
        | "email_event"
        | "manual"
        | "external"
      wf_user_role: "manager" | "analyst" | "ops" | "admin" | "other"
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
      app_role: ["admin", "moderator", "user", "support_admin"],
      claap_meeting_status: [
        "pending_review",
        "routed",
        "excluded",
        "awaiting_confirmation",
      ],
      claap_task_status: ["pending", "completed", "expired", "dismissed"],
      claap_task_type: [
        "confirm_contact",
        "confirm_company",
        "create_deal",
        "disambiguate_deal",
      ],
      client_draft_status: ["needs_approval", "approved", "rejected", "sent"],
      client_request_status: [
        "pending",
        "queued_for_email",
        "included_in_draft",
        "approved",
        "sent",
      ],
      company_role: ["owner", "admin", "member"],
      contact_buying_role: [
        "economic_buyer",
        "champion",
        "influencer",
        "user",
        "blocker",
        "legal",
        "finance",
        "other",
      ],
      contact_lifecycle_stage: [
        "subscriber",
        "lead",
        "mql",
        "sql",
        "opportunity",
        "customer",
        "evangelist",
        "other",
      ],
      contact_status: [
        "new",
        "working",
        "meeting_scheduled",
        "no_show",
        "no_fit",
        "nurture",
        "bad_data",
        "converted",
        "closed",
      ],
      copilot_preference_category: [
        "formatting",
        "terminology",
        "behavior",
        "domain_knowledge",
      ],
      copilot_preference_source: ["manual", "thumbs_down", "chat_command"],
      crm_company_lifecycle: [
        "target",
        "engaged",
        "opportunity",
        "customer",
        "expansion",
        "churn_risk",
      ],
      crm_company_status: ["active", "inactive", "target", "churned"],
      crm_company_type: [
        "customer",
        "prospect",
        "partner",
        "vendor",
        "internal",
        "other",
      ],
      data_access_scope: ["all", "team", "own", "none"],
      feature_status: ["disabled", "staging", "deployed", "james_only"],
      financial_period_type: ["monthly", "quarterly", "annual"],
      financial_statement_type: ["pnl", "balance_sheet", "cash_flow"],
      lender_pass_reason_category: [
        "deal_size_mismatch",
        "industry_exclusion",
        "geographic_restriction",
        "risk_profile_concerns",
        "timing_issues",
        "relationship_issues",
        "terms_mismatch",
        "other",
      ],
      notification_category: [
        "deals",
        "tasks",
        "lenders",
        "milestones",
        "reporting",
        "system",
      ],
      notification_channel_type: ["in_app", "email", "slack", "sms", "push"],
      notification_instance_status: ["pending", "sent", "failed", "skipped"],
      wf_agreement_type: ["nda", "engagement", "amendment", "other"],
      wf_deal_stage: [
        "nda_needs_list_sent",
        "pre_credit_needs",
        "analyst_completes_review",
        "not_moving_forward",
        "manager_approves_preview",
        "initial_lender_review",
        "initial_feedback_call",
        "prop_in_dev",
        "prop_issued",
        "agreement_pending",
        "final_credit_items",
        "client_strategy_review",
        "write_up_pending",
        "submitted_to_lenders",
        "lenders_in_review",
        "terms_issued_analysis",
        "terms_issued_payment",
        "due_diligence_client",
        "funded_naitive",
        "funded_payment",
        "funded_feedback_testimonials",
        "funded_lender_review",
      ],
      wf_email_status: ["pending", "sent", "failed"],
      wf_invoice_status: ["draft", "sent", "paid"],
      wf_invoice_type: ["retainer", "milestone", "final"],
      wf_meeting_type: [
        "sales",
        "bd",
        "educational",
        "kick_off",
        "lender_meeting",
        "other",
      ],
      wf_owner_role: ["manager", "analyst", "ops", "system"],
      wf_task_status: ["open", "in_progress", "done"],
      wf_term_sheet_status: [
        "draft",
        "received",
        "approved",
        "signed",
        "rejected",
      ],
      wf_trigger_source: [
        "stage_change",
        "calendar",
        "email",
        "manual",
        "external",
      ],
      wf_trigger_type: [
        "stage_change",
        "calendar_event",
        "email_event",
        "manual",
        "external",
      ],
      wf_user_role: ["manager", "analyst", "ops", "admin", "other"],
    },
  },
} as const
