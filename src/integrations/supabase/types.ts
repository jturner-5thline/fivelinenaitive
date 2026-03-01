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
      companies: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_reason: string | null
          city: string | null
          country: string | null
          created_at: string
          description: string | null
          employee_size: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
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
          employee_size?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
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
          employee_size?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          state?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
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
          deal_info_layout: Json | null
          deal_panel_layout: Json | null
          deal_stages: Json | null
          deals_special_widgets: Json | null
          deals_widgets_config: Json | null
          default_deal_stage_id: string | null
          fpa_dashboard_config: Json | null
          id: string
          lender_matching_config: Json | null
          permission_settings: Json | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deal_info_layout?: Json | null
          deal_panel_layout?: Json | null
          deal_stages?: Json | null
          deals_special_widgets?: Json | null
          deals_widgets_config?: Json | null
          default_deal_stage_id?: string | null
          fpa_dashboard_config?: Json | null
          id?: string
          lender_matching_config?: Json | null
          permission_settings?: Json | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deal_info_layout?: Json | null
          deal_panel_layout?: Json | null
          deal_stages?: Json | null
          deals_special_widgets?: Json | null
          deals_widgets_config?: Json | null
          default_deal_stage_id?: string | null
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
      dashboard_layouts: {
        Row: {
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
        Relationships: []
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
      deal_flag_notes: {
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
          data_room_url: string | null
          deal_id: string
          deal_type: string | null
          description: string | null
          existing_debt_details: string | null
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
          data_room_url?: string | null
          deal_id: string
          deal_type?: string | null
          description?: string | null
          existing_debt_details?: string | null
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
          data_room_url?: string | null
          deal_id?: string
          deal_type?: string | null
          description?: string | null
          existing_debt_details?: string | null
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
          deal_owner: string | null
          deal_type: string | null
          engagement_type: string | null
          exclusivity: string | null
          flag_notes: string | null
          id: string
          is_flagged: boolean
          manager: string | null
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
          deal_owner?: string | null
          deal_type?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          flag_notes?: string | null
          id?: string
          is_flagged?: boolean
          manager?: string | null
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
          deal_owner?: string | null
          deal_type?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          flag_notes?: string | null
          id?: string
          is_flagged?: boolean
          manager?: string | null
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
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "deal_pipelines"
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
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
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
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
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
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
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
      admin_revoke_approval: { Args: { _user_id: string }; Returns: undefined }
      admin_toggle_company_suspension: {
        Args: { _company_id: string; _reason?: string; _suspend: boolean }
        Returns: undefined
      }
      admin_toggle_user_suspension: {
        Args: { _reason?: string; _suspend: boolean; _user_id: string }
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
      search_lenders_keyword: {
        Args: { _limit?: number; _offset?: number; _search_query: string }
        Returns: {
          lender_id: string
          relevance_score: number
          total_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      company_role: "owner" | "admin" | "member"
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
      app_role: ["admin", "moderator", "user"],
      company_role: ["owner", "admin", "member"],
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
    },
  },
} as const
