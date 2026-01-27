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
          default_deal_stage_id: string | null
          id: string
          permission_settings: Json | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_deal_stage_id?: string | null
          id?: string
          permission_settings?: Json | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_deal_stage_id?: string | null
          id?: string
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
          user_id?: string | null
        }
        Relationships: []
      }
      deal_checklist_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
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
      deal_milestones: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          deal_id: string
          due_date: string | null
          id: string
          position: number
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
          status: string | null
          this_year_revenue: string | null
          updated_at: string
          use_of_funds: string | null
          user_id: string
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
          status?: string | null
          this_year_revenue?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_id: string
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
          status?: string | null
          this_year_revenue?: string | null
          updated_at?: string
          use_of_funds?: string | null
          user_id?: string
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
          company: string
          company_id: string | null
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
          company: string
          company_id?: string | null
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
          company?: string
          company_id?: string | null
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
        ]
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
          name: string
          status: Database["public"]["Enums"]["feature_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["feature_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
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
          content_type?: string | null
          created_at?: string
          file_path?: string
          id?: string
          lender_name?: string
          name?: string
          size_bytes?: number
          user_id?: string
        }
        Relationships: []
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
      outstanding_items: {
        Row: {
          created_at: string
          deal_id: string
          description: string
          due_date: string | null
          id: string
          lender_id: string | null
          notes: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          description: string
          due_date?: string | null
          id?: string
          lender_id?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          description?: string
          due_date?: string | null
          id?: string
          lender_id?: string | null
          notes?: string | null
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
          created_at: string
          device_type: string | null
          element_selector: string
          element_text: string | null
          id: string
          page_path: string
          session_id: string
          x_percent: number | null
          y_percent: number | null
        }
        Insert: {
          click_count?: number | null
          created_at?: string
          device_type?: string | null
          element_selector: string
          element_text?: string | null
          id?: string
          page_path: string
          session_id: string
          x_percent?: number | null
          y_percent?: number | null
        }
        Update: {
          click_count?: number | null
          created_at?: string
          device_type?: string | null
          element_selector?: string
          element_text?: string | null
          id?: string
          page_path?: string
          session_id?: string
          x_percent?: number | null
          y_percent?: number | null
        }
        Relationships: []
      }
      ux_client_errors: {
        Row: {
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
        }
        Insert: {
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
        }
        Update: {
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
        }
        Relationships: []
      }
      ux_performance_metrics: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          metric_type: string
          page_path: string
          rating: string | null
          session_id: string
          value_ms: number | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          metric_type: string
          page_path: string
          rating?: string | null
          session_id: string
          value_ms?: number | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          metric_type?: string
          page_path?: string
          rating?: string | null
          session_id?: string
          value_ms?: number | null
        }
        Relationships: []
      }
      ux_rage_clicks: {
        Row: {
          click_count: number | null
          created_at: string
          device_type: string | null
          element_selector: string | null
          element_text: string | null
          id: string
          page_path: string
          session_id: string
        }
        Insert: {
          click_count?: number | null
          created_at?: string
          device_type?: string | null
          element_selector?: string | null
          element_text?: string | null
          id?: string
          page_path: string
          session_id: string
        }
        Update: {
          click_count?: number | null
          created_at?: string
          device_type?: string | null
          element_selector?: string | null
          element_text?: string | null
          id?: string
          page_path?: string
          session_id?: string
        }
        Relationships: []
      }
      ux_search_events: {
        Row: {
          clicked_result_index: number | null
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
          company: string | null
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
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
            foreignKeyName: "workflows_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
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
          company_name: string | null
          company_role: string | null
          created_at: string | null
          display_name: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          company_role?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          company_role?: string | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string | null
          last_name?: string | null
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
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
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
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      company_role: "owner" | "admin" | "member"
      data_access_scope: "all" | "team" | "own" | "none"
      feature_status: "disabled" | "staging" | "deployed"
      lender_pass_reason_category:
        | "deal_size_mismatch"
        | "industry_exclusion"
        | "geographic_restriction"
        | "risk_profile_concerns"
        | "timing_issues"
        | "relationship_issues"
        | "terms_mismatch"
        | "other"
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
      feature_status: ["disabled", "staging", "deployed"],
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
    },
  },
} as const
