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
      _deals_finserv_backup_20260527: {
        Row: {
          agreement_sent: boolean | null
          ai_custom_instructions: string | null
          ai_status_snapshot: Json | null
          analyst: string | null
          business_model: string | null
          closing_date: string | null
          company: string | null
          company_id: string | null
          company_url: string | null
          competitors_mentioned: string | null
          contact: string | null
          contact_email: string | null
          contact_info: string | null
          contact_title: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string | null
          crm_company_id: string | null
          dashboard_closing_date: string | null
          deal_class: string | null
          deal_owner: string | null
          deal_type: string | null
          dm_name: string | null
          dm_present: string | null
          engagement_type: string | null
          exclusivity: string | null
          fee_type: string | null
          flag_notes: string | null
          flex_visibility_override: string | null
          hubspot_deal_id: string | null
          hubspot_last_synced_at: string | null
          hubspot_sync_error: string | null
          hubspot_sync_status: string | null
          icp_category: string | null
          id: string | null
          is_flagged: boolean | null
          key_signal: string | null
          lead_source: string | null
          manager: string | null
          manager_move_forward_decision: boolean | null
          materials_added_to_naitive: boolean | null
          merged_hubspot_ids: string[] | null
          merged_into: string | null
          migrated_from_personal: boolean | null
          milestone_fee: number | null
          mrr: number | null
          narrative: string | null
          next_follow_up_at: string | null
          next_step: string | null
          next_step_date: string | null
          notes: string | null
          notes_updated_at: string | null
          objections_raised: string | null
          on_hold: boolean | null
          one_time_revenue: number | null
          opportunity_type: string | null
          outcome: string | null
          owned_by: string | null
          pain_points_confirmed: string | null
          pipeline_id: string | null
          post_signing_hours: number | null
          pre_signing_hours: number | null
          pricing: string | null
          product_gap_flagged: string | null
          projected_close_date: string | null
          prospect_type: string | null
          referral_source: string | null
          referral_source_id: string | null
          referred_by: string | null
          retainer_fee: number | null
          services_offered: string[] | null
          sourced_via: string | null
          stage: string | null
          status: string | null
          success_fee_percent: number | null
          tags: string[] | null
          total_fee: number | null
          updated_at: string | null
          user_id: string | null
          value: number | null
          why_not_moving_forward: string[] | null
        }
        Insert: {
          agreement_sent?: boolean | null
          ai_custom_instructions?: string | null
          ai_status_snapshot?: Json | null
          analyst?: string | null
          business_model?: string | null
          closing_date?: string | null
          company?: string | null
          company_id?: string | null
          company_url?: string | null
          competitors_mentioned?: string | null
          contact?: string | null
          contact_email?: string | null
          contact_info?: string | null
          contact_title?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          crm_company_id?: string | null
          dashboard_closing_date?: string | null
          deal_class?: string | null
          deal_owner?: string | null
          deal_type?: string | null
          dm_name?: string | null
          dm_present?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          fee_type?: string | null
          flag_notes?: string | null
          flex_visibility_override?: string | null
          hubspot_deal_id?: string | null
          hubspot_last_synced_at?: string | null
          hubspot_sync_error?: string | null
          hubspot_sync_status?: string | null
          icp_category?: string | null
          id?: string | null
          is_flagged?: boolean | null
          key_signal?: string | null
          lead_source?: string | null
          manager?: string | null
          manager_move_forward_decision?: boolean | null
          materials_added_to_naitive?: boolean | null
          merged_hubspot_ids?: string[] | null
          merged_into?: string | null
          migrated_from_personal?: boolean | null
          milestone_fee?: number | null
          mrr?: number | null
          narrative?: string | null
          next_follow_up_at?: string | null
          next_step?: string | null
          next_step_date?: string | null
          notes?: string | null
          notes_updated_at?: string | null
          objections_raised?: string | null
          on_hold?: boolean | null
          one_time_revenue?: number | null
          opportunity_type?: string | null
          outcome?: string | null
          owned_by?: string | null
          pain_points_confirmed?: string | null
          pipeline_id?: string | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          pricing?: string | null
          product_gap_flagged?: string | null
          projected_close_date?: string | null
          prospect_type?: string | null
          referral_source?: string | null
          referral_source_id?: string | null
          referred_by?: string | null
          retainer_fee?: number | null
          services_offered?: string[] | null
          sourced_via?: string | null
          stage?: string | null
          status?: string | null
          success_fee_percent?: number | null
          tags?: string[] | null
          total_fee?: number | null
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          why_not_moving_forward?: string[] | null
        }
        Update: {
          agreement_sent?: boolean | null
          ai_custom_instructions?: string | null
          ai_status_snapshot?: Json | null
          analyst?: string | null
          business_model?: string | null
          closing_date?: string | null
          company?: string | null
          company_id?: string | null
          company_url?: string | null
          competitors_mentioned?: string | null
          contact?: string | null
          contact_email?: string | null
          contact_info?: string | null
          contact_title?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          crm_company_id?: string | null
          dashboard_closing_date?: string | null
          deal_class?: string | null
          deal_owner?: string | null
          deal_type?: string | null
          dm_name?: string | null
          dm_present?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          fee_type?: string | null
          flag_notes?: string | null
          flex_visibility_override?: string | null
          hubspot_deal_id?: string | null
          hubspot_last_synced_at?: string | null
          hubspot_sync_error?: string | null
          hubspot_sync_status?: string | null
          icp_category?: string | null
          id?: string | null
          is_flagged?: boolean | null
          key_signal?: string | null
          lead_source?: string | null
          manager?: string | null
          manager_move_forward_decision?: boolean | null
          materials_added_to_naitive?: boolean | null
          merged_hubspot_ids?: string[] | null
          merged_into?: string | null
          migrated_from_personal?: boolean | null
          milestone_fee?: number | null
          mrr?: number | null
          narrative?: string | null
          next_follow_up_at?: string | null
          next_step?: string | null
          next_step_date?: string | null
          notes?: string | null
          notes_updated_at?: string | null
          objections_raised?: string | null
          on_hold?: boolean | null
          one_time_revenue?: number | null
          opportunity_type?: string | null
          outcome?: string | null
          owned_by?: string | null
          pain_points_confirmed?: string | null
          pipeline_id?: string | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          pricing?: string | null
          product_gap_flagged?: string | null
          projected_close_date?: string | null
          prospect_type?: string | null
          referral_source?: string | null
          referral_source_id?: string | null
          referred_by?: string | null
          retainer_fee?: number | null
          services_offered?: string[] | null
          sourced_via?: string | null
          stage?: string | null
          status?: string | null
          success_fee_percent?: number | null
          tags?: string[] | null
          total_fee?: number | null
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
          why_not_moving_forward?: string[] | null
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          activity_type: string
          bcc_addresses: string[] | null
          body: string | null
          cc_addresses: string[] | null
          created_at: string
          deal_id: string
          description: string
          direction: string | null
          from_address: string | null
          id: string
          in_reply_to: string | null
          message_id: string | null
          metadata: Json | null
          provider: string | null
          sent_at: string | null
          subject: string | null
          thread_id: string | null
          to_addresses: string[] | null
          user_display_name: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          bcc_addresses?: string[] | null
          body?: string | null
          cc_addresses?: string[] | null
          created_at?: string
          deal_id: string
          description: string
          direction?: string | null
          from_address?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          metadata?: Json | null
          provider?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
          user_display_name?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          bcc_addresses?: string[] | null
          body?: string | null
          cc_addresses?: string[] | null
          created_at?: string
          deal_id?: string
          description?: string
          direction?: string | null
          from_address?: string | null
          id?: string
          in_reply_to?: string | null
          message_id?: string | null
          metadata?: Json | null
          provider?: string | null
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_addresses?: string[] | null
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
          {
            foreignKeyName: "activity_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      admin_agent_audit_runs: {
        Row: {
          company_id: string
          created_at: string
          deal_ids: string[]
          findings_summary: Json
          id: string
          scope_type: string
          total_evaluated: number
          total_flagged: number
          total_never_updated: number
          triggered_by: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          deal_ids?: string[]
          findings_summary?: Json
          id?: string
          scope_type: string
          total_evaluated?: number
          total_flagged?: number
          total_never_updated?: number
          triggered_by?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          deal_ids?: string[]
          findings_summary?: Json
          id?: string
          scope_type?: string
          total_evaluated?: number
          total_flagged?: number
          total_never_updated?: number
          triggered_by?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_audit_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_agent_holidays: {
        Row: {
          company_id: string
          created_at: string
          holiday_date: string
          id: string
          label: string
        }
        Insert: {
          company_id: string
          created_at?: string
          holiday_date: string
          id?: string
          label?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          holiday_date?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_holidays_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_agent_knowledge_chunks: {
        Row: {
          agent_key: string
          chunk_index: number
          company_id: string
          content: string
          created_at: string
          doc_id: string
          embedding: string | null
          id: string
          token_count: number | null
        }
        Insert: {
          agent_key?: string
          chunk_index?: number
          company_id: string
          content: string
          created_at?: string
          doc_id: string
          embedding?: string | null
          id?: string
          token_count?: number | null
        }
        Update: {
          agent_key?: string
          chunk_index?: number
          company_id?: string
          content?: string
          created_at?: string
          doc_id?: string
          embedding?: string | null
          id?: string
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_knowledge_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "admin_agent_knowledge_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_agent_knowledge_docs: {
        Row: {
          agent_key: string
          company_id: string
          created_at: string
          error_message: string | null
          extracted_text: string | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          source_type: string
          status: string
          storage_path: string | null
          tags: string[]
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          agent_key?: string
          company_id: string
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source_type: string
          status?: string
          storage_path?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          agent_key?: string
          company_id?: string
          created_at?: string
          error_message?: string | null
          extracted_text?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          source_type?: string
          status?: string
          storage_path?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      admin_agent_knowledge_test_runs: {
        Row: {
          agent_key: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          questions: Json
          results: Json
          score: number
          tag_filter: string[]
          total: number
        }
        Insert: {
          agent_key?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          questions?: Json
          results?: Json
          score?: number
          tag_filter?: string[]
          total?: number
        }
        Update: {
          agent_key?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          questions?: Json
          results?: Json
          score?: number
          tag_filter?: string[]
          total?: number
        }
        Relationships: []
      }
      admin_agent_parse_logs: {
        Row: {
          audit_run_id: string | null
          clarifying_question: string | null
          company_id: string
          created_at: string
          error_message: string | null
          id: string
          outcome: string
          parsed_interpretation: Json
          raw_user_response: string | null
          selections_created: number
          user_id: string | null
        }
        Insert: {
          audit_run_id?: string | null
          clarifying_question?: string | null
          company_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          outcome: string
          parsed_interpretation?: Json
          raw_user_response?: string | null
          selections_created?: number
          user_id?: string | null
        }
        Update: {
          audit_run_id?: string | null
          clarifying_question?: string | null
          company_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          outcome?: string
          parsed_interpretation?: Json
          raw_user_response?: string | null
          selections_created?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_parse_logs_audit_run_id_fkey"
            columns: ["audit_run_id"]
            isOneToOne: false
            referencedRelation: "admin_agent_audit_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_agent_parse_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_agent_processed_reply_triggers: {
        Row: {
          cleared_item_id: string | null
          created_at: string
          deal_id: string
          from_email: string | null
          id: string
          message_id: string
          received_at: string | null
          rule: string
          source: string
          thread_id: string | null
        }
        Insert: {
          cleared_item_id?: string | null
          created_at?: string
          deal_id: string
          from_email?: string | null
          id?: string
          message_id: string
          received_at?: string | null
          rule?: string
          source: string
          thread_id?: string | null
        }
        Update: {
          cleared_item_id?: string | null
          created_at?: string
          deal_id?: string
          from_email?: string | null
          id?: string
          message_id?: string
          received_at?: string | null
          rule?: string
          source?: string
          thread_id?: string | null
        }
        Relationships: []
      }
      admin_agent_selected_actions: {
        Row: {
          action: string
          audit_run_id: string | null
          company_id: string
          confirmation_status: string
          created_at: string
          deal_id: string | null
          field: string
          id: string
          lender_id: string | null
          note: string | null
          parsed_interpretation: Json
          raw_user_response: string | null
          scope_level: string
          source_message: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action: string
          audit_run_id?: string | null
          company_id: string
          confirmation_status?: string
          created_at?: string
          deal_id?: string | null
          field: string
          id?: string
          lender_id?: string | null
          note?: string | null
          parsed_interpretation?: Json
          raw_user_response?: string | null
          scope_level?: string
          source_message?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          audit_run_id?: string | null
          company_id?: string
          confirmation_status?: string
          created_at?: string
          deal_id?: string | null
          field?: string
          id?: string
          lender_id?: string | null
          note?: string | null
          parsed_interpretation?: Json
          raw_user_response?: string | null
          scope_level?: string
          source_message?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_selected_actions_audit_run_id_fkey"
            columns: ["audit_run_id"]
            isOneToOne: false
            referencedRelation: "admin_agent_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_agent_settings: {
        Row: {
          active_pipeline_ids: string[]
          active_stage_ids: string[]
          advisory_tone: boolean
          company_id: string
          created_at: string
          critical_fields: string[]
          custom_rules: Json
          default_chat_behavior: Json
          enabled: boolean
          friday_sweep_enabled: boolean
          id: string
          knowledge_tag_filter: string[]
          stale_threshold_business_days: number
          updated_at: string
        }
        Insert: {
          active_pipeline_ids?: string[]
          active_stage_ids?: string[]
          advisory_tone?: boolean
          company_id: string
          created_at?: string
          critical_fields?: string[]
          custom_rules?: Json
          default_chat_behavior?: Json
          enabled?: boolean
          friday_sweep_enabled?: boolean
          id?: string
          knowledge_tag_filter?: string[]
          stale_threshold_business_days?: number
          updated_at?: string
        }
        Update: {
          active_pipeline_ids?: string[]
          active_stage_ids?: string[]
          advisory_tone?: boolean
          company_id?: string
          created_at?: string
          critical_fields?: string[]
          custom_rules?: Json
          default_chat_behavior?: Json
          enabled?: boolean
          friday_sweep_enabled?: boolean
          id?: string
          knowledge_tag_filter?: string[]
          stale_threshold_business_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_agent_tone_deltas: {
        Row: {
          action_type: string
          company_id: string | null
          created_at: string
          diff_summary: string | null
          edited_draft: Json
          id: string
          original_draft: Json
          queue_item_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          company_id?: string | null
          created_at?: string
          diff_summary?: string | null
          edited_draft?: Json
          id?: string
          original_draft?: Json
          queue_item_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          company_id?: string | null
          created_at?: string
          diff_summary?: string | null
          edited_draft?: Json
          id?: string
          original_draft?: Json
          queue_item_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_agent_user_overrides: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          is_activated: boolean
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_activated?: boolean
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          is_activated?: boolean
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_agent_user_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      admin_impersonation_session_secrets: {
        Row: {
          created_at: string
          session_id: string
          source_admin_refresh_token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          session_id: string
          source_admin_refresh_token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          session_id?: string
          source_admin_refresh_token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_impersonation_session_secrets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "admin_impersonation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_impersonation_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          ended_reason: string | null
          expires_at: string
          id: string
          ip_address: string | null
          nonce: string
          source_admin_email: string | null
          source_admin_user_id: string
          source_surface: string
          started_at: string
          target_demo_company_id: string | null
          target_demo_company_name: string | null
          target_demo_email: string | null
          target_demo_user_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          nonce: string
          source_admin_email?: string | null
          source_admin_user_id: string
          source_surface?: string
          started_at?: string
          target_demo_company_id?: string | null
          target_demo_company_name?: string | null
          target_demo_email?: string | null
          target_demo_user_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          nonce?: string
          source_admin_email?: string | null
          source_admin_user_id?: string
          source_surface?: string
          started_at?: string
          target_demo_company_id?: string | null
          target_demo_company_name?: string | null
          target_demo_email?: string | null
          target_demo_user_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_one_time_links: {
        Row: {
          admin_email: string | null
          admin_user_id: string | null
          consumed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          magic_link: string
          tenant_id: string
          tenant_name: string | null
        }
        Insert: {
          admin_email?: string | null
          admin_user_id?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          magic_link: string
          tenant_id: string
          tenant_name?: string | null
        }
        Update: {
          admin_email?: string | null
          admin_user_id?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          magic_link?: string
          tenant_id?: string
          tenant_name?: string | null
        }
        Relationships: []
      }
      agenda_comment_threads: {
        Row: {
          agenda_id: string
          anchor_text: string | null
          company_id: string
          created_at: string
          created_by: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        Insert: {
          agenda_id: string
          anchor_text?: string | null
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Update: {
          agenda_id?: string
          anchor_text?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_comment_threads_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "insights_agenda"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_comments: {
        Row: {
          author_id: string
          body: string
          comment_type: string
          company_id: string
          created_at: string
          deleted_at: string | null
          id: string
          mentions: string[]
          parent_comment_id: string | null
          period_key: string | null
          period_type: string | null
          thread_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          comment_type?: string
          company_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          period_key?: string | null
          period_type?: string | null
          thread_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          comment_type?: string
          company_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          mentions?: string[]
          parent_comment_id?: string | null
          period_key?: string | null
          period_type?: string | null
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "agenda_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agenda_comment_threads"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "agent_conversations_context_deal_id_fkey"
            columns: ["context_deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      agent_learned_rules: {
        Row: {
          agent_key: string
          company_id: string
          confidence: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          evidence: Json
          id: string
          last_synthesized_at: string
          occurrences: number
          rule_text: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_key?: string
          company_id: string
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json
          id?: string
          last_synthesized_at?: string
          occurrences?: number
          rule_text: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_key?: string
          company_id?: string
          confidence?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json
          id?: string
          last_synthesized_at?: string
          occurrences?: number
          rule_text?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "agent_runs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      ai_action_audit: {
        Row: {
          action_type: string
          clarification_reason: string | null
          clarification_required: boolean | null
          company_id: string | null
          confidence: Json | null
          conversation_id: string | null
          created_at: string
          created_task_id: string | null
          duplicate_candidates: Json
          duplicate_status: string | null
          error_message: string | null
          extracted_fields: Json | null
          field_changed: string | null
          id: string
          inferred_fields: Json
          intent: string | null
          new_value: Json | null
          old_value: Json | null
          outcome: string
          outcome_detail: string | null
          page_context: Json | null
          prompt: string | null
          rationale: string | null
          resolved_assignee_name: string | null
          resolved_assignee_user_id: string | null
          resolved_deal_id: string | null
          resolved_deal_name: string | null
          source: string | null
          success: boolean | null
          target_lender_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          clarification_reason?: string | null
          clarification_required?: boolean | null
          company_id?: string | null
          confidence?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_task_id?: string | null
          duplicate_candidates?: Json
          duplicate_status?: string | null
          error_message?: string | null
          extracted_fields?: Json | null
          field_changed?: string | null
          id?: string
          inferred_fields?: Json
          intent?: string | null
          new_value?: Json | null
          old_value?: Json | null
          outcome?: string
          outcome_detail?: string | null
          page_context?: Json | null
          prompt?: string | null
          rationale?: string | null
          resolved_assignee_name?: string | null
          resolved_assignee_user_id?: string | null
          resolved_deal_id?: string | null
          resolved_deal_name?: string | null
          source?: string | null
          success?: boolean | null
          target_lender_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          clarification_reason?: string | null
          clarification_required?: boolean | null
          company_id?: string | null
          confidence?: Json | null
          conversation_id?: string | null
          created_at?: string
          created_task_id?: string | null
          duplicate_candidates?: Json
          duplicate_status?: string | null
          error_message?: string | null
          extracted_fields?: Json | null
          field_changed?: string | null
          id?: string
          inferred_fields?: Json
          intent?: string | null
          new_value?: Json | null
          old_value?: Json | null
          outcome?: string
          outcome_detail?: string | null
          page_context?: Json | null
          prompt?: string | null
          rationale?: string | null
          resolved_assignee_name?: string | null
          resolved_assignee_user_id?: string | null
          resolved_deal_id?: string | null
          resolved_deal_name?: string | null
          source?: string | null
          success?: boolean | null
          target_lender_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_action_log: {
        Row: {
          action: string
          actor_user_id: string
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string
          thread_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          thread_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          thread_id?: string | null
        }
        Relationships: []
      }
      ai_action_queue: {
        Row: {
          action_type: string
          approved_at: string | null
          assigned_to: string | null
          created_at: string
          deal_id: string | null
          deal_name: string | null
          description: string | null
          dismissed_at: string | null
          edited_before_approval: boolean | null
          evidence: Json | null
          executed_at: string | null
          executed_by: string | null
          execution_error: string | null
          execution_result: Json | null
          expires_at: string
          id: string
          more_context_notes: string | null
          more_context_requested_at: string | null
          new_values: Json | null
          old_values: Json | null
          on_approve_execution_type: string | null
          payload: Json
          priority: string | null
          rationale: string | null
          reassigned_from: string | null
          rejection_reason: string | null
          reminder_sent_at: string | null
          risk_level: string | null
          source: Json
          status: string
          target_object_id: string | null
          target_object_type: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          assigned_to?: string | null
          created_at?: string
          deal_id?: string | null
          deal_name?: string | null
          description?: string | null
          dismissed_at?: string | null
          edited_before_approval?: boolean | null
          evidence?: Json | null
          executed_at?: string | null
          executed_by?: string | null
          execution_error?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          more_context_notes?: string | null
          more_context_requested_at?: string | null
          new_values?: Json | null
          old_values?: Json | null
          on_approve_execution_type?: string | null
          payload?: Json
          priority?: string | null
          rationale?: string | null
          reassigned_from?: string | null
          rejection_reason?: string | null
          reminder_sent_at?: string | null
          risk_level?: string | null
          source?: Json
          status?: string
          target_object_id?: string | null
          target_object_type?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          assigned_to?: string | null
          created_at?: string
          deal_id?: string | null
          deal_name?: string | null
          description?: string | null
          dismissed_at?: string | null
          edited_before_approval?: boolean | null
          evidence?: Json | null
          executed_at?: string | null
          executed_by?: string | null
          execution_error?: string | null
          execution_result?: Json | null
          expires_at?: string
          id?: string
          more_context_notes?: string | null
          more_context_requested_at?: string | null
          new_values?: Json | null
          old_values?: Json | null
          on_approve_execution_type?: string | null
          payload?: Json
          priority?: string | null
          rationale?: string | null
          reassigned_from?: string | null
          rejection_reason?: string | null
          reminder_sent_at?: string | null
          risk_level?: string | null
          source?: Json
          status?: string
          target_object_id?: string | null
          target_object_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_agent_run_steps: {
        Row: {
          approved_at: string | null
          args: Json
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          output: Json | null
          output_summary: string | null
          requires_approval: boolean
          run_id: string
          status: string
          step_index: number
          title: string
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          args?: Json
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          output?: Json | null
          output_summary?: string | null
          requires_approval?: boolean
          run_id: string
          status?: string
          step_index: number
          title: string
          tool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          args?: Json
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          output?: Json | null
          output_summary?: string | null
          requires_approval?: boolean
          run_id?: string
          status?: string
          step_index?: number
          title?: string
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_runs: {
        Row: {
          completed_at: string | null
          context: Json
          created_at: string
          error: string | null
          final_summary: string | null
          id: string
          plan_summary: string | null
          prompt: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          error?: string | null
          final_summary?: string | null
          id?: string
          plan_summary?: string | null
          prompt: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          created_at?: string
          error?: string | null
          final_summary?: string | null
          id?: string
          plan_summary?: string | null
          prompt?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_configuration: {
        Row: {
          company_id: string
          copilot_instructions: Json
          created_at: string
          default_model: string
          default_temperature: number
          features_enabled: Json
          id: string
          max_tokens: number
          updated_at: string
        }
        Insert: {
          company_id: string
          copilot_instructions?: Json
          created_at?: string
          default_model?: string
          default_temperature?: number
          features_enabled?: Json
          id?: string
          max_tokens?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          copilot_instructions?: Json
          created_at?: string
          default_model?: string
          default_temperature?: number
          features_enabled?: Json
          id?: string
          max_tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_configuration_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_copilot_audit: {
        Row: {
          action: string
          company_id: string | null
          deal_ids: string[] | null
          details: Json | null
          id: string
          occurred_at: string
          proposed: Json | null
          resolved_action: string | null
          user_id: string
        }
        Insert: {
          action: string
          company_id?: string | null
          deal_ids?: string[] | null
          details?: Json | null
          id?: string
          occurred_at?: string
          proposed?: Json | null
          resolved_action?: string | null
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string | null
          deal_ids?: string[] | null
          details?: Json | null
          id?: string
          occurred_at?: string
          proposed?: Json | null
          resolved_action?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_copilot_config: {
        Row: {
          company_id: string
          created_at: string
          default_report_template: string
          id: string
          system_prompt_override: string
          tone_override: string | null
          tools_enabled: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          default_report_template?: string
          id?: string
          system_prompt_override?: string
          tone_override?: string | null
          tools_enabled?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          default_report_template?: string
          id?: string
          system_prompt_override?: string
          tone_override?: string | null
          tools_enabled?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          created_at: string
          description: string | null
          feature_area: string
          id: string
          name: string
          prompt_text: string
          success_rate: number
          token_avg: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          feature_area: string
          id?: string
          name: string
          prompt_text: string
          success_rate?: number
          token_avg?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          feature_area?: string
          id?: string
          name?: string
          prompt_text?: string
          success_rate?: number
          token_avg?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_style_templates: {
        Row: {
          created_at: string
          fonts: Json
          id: string
          layout_notes: string | null
          name: string
          palette: Json
          preview_image_path: string | null
          source_type: string
          source_value: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fonts?: Json
          id?: string
          layout_notes?: string | null
          name: string
          palette?: Json
          preview_image_path?: string | null
          source_type: string
          source_value?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fonts?: Json
          id?: string
          layout_notes?: string | null
          name?: string
          palette?: Json
          preview_image_path?: string | null
          source_type?: string
          source_value?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_styled_documents: {
        Row: {
          created_at: string
          deal_id: string
          document_type: string
          exported_at: string | null
          exported_attachment_id: string | null
          html: string
          id: string
          prompt: string | null
          sections: Json
          status: string
          style: Json
          style_template_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          document_type: string
          exported_at?: string | null
          exported_attachment_id?: string | null
          html?: string
          id?: string
          prompt?: string | null
          sections?: Json
          status?: string
          style?: Json
          style_template_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          document_type?: string
          exported_at?: string | null
          exported_attachment_id?: string | null
          html?: string
          id?: string
          prompt?: string | null
          sections?: Json
          status?: string
          style?: Json
          style_template_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_styled_documents_style_template_id_fkey"
            columns: ["style_template_id"]
            isOneToOne: false
            referencedRelation: "ai_style_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          feature: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          feature: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          feature?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_queue_audit: {
        Row: {
          action_queue_id: string
          action_type: string
          approver_user_id: string | null
          created_at: string
          decision: string
          execution_status: string
          failure_reason: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          rejection_reason: string | null
          target_object_id: string | null
          target_object_type: string | null
          was_edited: boolean | null
        }
        Insert: {
          action_queue_id: string
          action_type: string
          approver_user_id?: string | null
          created_at?: string
          decision: string
          execution_status: string
          failure_reason?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          rejection_reason?: string | null
          target_object_id?: string | null
          target_object_type?: string | null
          was_edited?: boolean | null
        }
        Update: {
          action_queue_id?: string
          action_type?: string
          approver_user_id?: string | null
          created_at?: string
          decision?: string
          execution_status?: string
          failure_reason?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          rejection_reason?: string | null
          target_object_id?: string | null
          target_object_type?: string | null
          was_edited?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_queue_audit_action_queue_id_fkey"
            columns: ["action_queue_id"]
            isOneToOne: false
            referencedRelation: "ai_action_queue"
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
      asana_goal_filter_prefs: {
        Row: {
          company_id: string
          created_at: string
          exact_match: boolean
          filters: Json
          id: string
          override: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          exact_match?: boolean
          filters?: Json
          id?: string
          override?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          exact_match?: boolean
          filters?: Json
          id?: string
          override?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asana_project_filters: {
        Row: {
          asana_project_gid: string
          asana_project_name: string
          asana_section_gid: string | null
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
          asana_section_gid?: string | null
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
          asana_section_gid?: string | null
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
      asana_sync_log: {
        Row: {
          action: string
          asana_task_gid: string | null
          attempt_number: number
          company_id: string | null
          created_at: string
          error_message: string | null
          http_status: number | null
          id: string
          payload: Json | null
          response_body: Json | null
          success: boolean
          task_id: string | null
          triggered_by: string | null
        }
        Insert: {
          action: string
          asana_task_gid?: string | null
          attempt_number?: number
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          payload?: Json | null
          response_body?: Json | null
          success: boolean
          task_id?: string | null
          triggered_by?: string | null
        }
        Update: {
          action?: string
          asana_task_gid?: string | null
          attempt_number?: number
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          payload?: Json | null
          response_body?: Json | null
          success?: boolean
          task_id?: string | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      asana_webhooks: {
        Row: {
          asana_project_gid: string
          asana_webhook_gid: string | null
          created_at: string
          id: string
          integration_id: string
          is_active: boolean
          target_url: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          asana_project_gid: string
          asana_webhook_gid?: string | null
          created_at?: string
          id?: string
          integration_id: string
          is_active?: boolean
          target_url: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          asana_project_gid?: string
          asana_webhook_gid?: string | null
          created_at?: string
          id?: string
          integration_id?: string
          is_active?: boolean
          target_url?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asana_webhooks_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          body_html: string
          cover_image_alt: string | null
          cover_image_url: string | null
          created_at: string
          disabled_at: string | null
          excerpt: string | null
          id: string
          published_at: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["blog_post_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_html?: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          disabled_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_html?: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          disabled_at?: string | null
          excerpt?: string | null
          id?: string
          published_at?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["blog_post_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          attendees: string[]
          created_at: string
          end_time: string | null
          event_id: string
          follow_up_task_created: boolean
          id: string
          is_all_day: boolean
          is_cancelled: boolean
          location: string | null
          meeting_url: string | null
          organizer_email: string | null
          provider: string
          raw: Json | null
          start_time: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: string[]
          created_at?: string
          end_time?: string | null
          event_id: string
          follow_up_task_created?: boolean
          id?: string
          is_all_day?: boolean
          is_cancelled?: boolean
          location?: string | null
          meeting_url?: string | null
          organizer_email?: string | null
          provider: string
          raw?: Json | null
          start_time?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: string[]
          created_at?: string
          end_time?: string | null
          event_id?: string
          follow_up_task_created?: boolean
          id?: string
          is_all_day?: boolean
          is_cancelled?: boolean
          location?: string | null
          meeting_url?: string | null
          organizer_email?: string | null
          provider?: string
          raw?: Json | null
          start_time?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_item_sources: {
        Row: {
          created_at: string
          created_by: string
          deal_calendar_item_id: string | null
          deal_id: string
          id: string
          source_deep_link: string | null
          source_module: string
          source_record_id: string
          source_text: string
          source_timestamp: string
          task_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          deal_calendar_item_id?: string | null
          deal_id: string
          id?: string
          source_deep_link?: string | null
          source_module: string
          source_record_id: string
          source_text: string
          source_timestamp: string
          task_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deal_calendar_item_id?: string | null
          deal_id?: string
          id?: string
          source_deep_link?: string | null
          source_module?: string
          source_record_id?: string
          source_text?: string
          source_timestamp?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_item_sources_deal_calendar_item_id_fkey"
            columns: ["deal_calendar_item_id"]
            isOneToOne: false
            referencedRelation: "deal_calendar_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_item_sources_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_item_sources_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "calendar_item_sources_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
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
      cash_flow_imports: {
        Row: {
          company_id: string
          credit_facilities: Json
          daily_data: Json
          file_name: string
          id: string
          imported_at: string
          imported_by: string | null
          recurring_tags: Json | null
          row_structure: Json
          updated_at: string
          weekly_overrides: Json
        }
        Insert: {
          company_id: string
          credit_facilities?: Json
          daily_data?: Json
          file_name?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          recurring_tags?: Json | null
          row_structure?: Json
          updated_at?: string
          weekly_overrides?: Json
        }
        Update: {
          company_id?: string
          credit_facilities?: Json
          daily_data?: Json
          file_name?: string
          id?: string
          imported_at?: string
          imported_by?: string | null
          recurring_tags?: Json | null
          row_structure?: Json
          updated_at?: string
          weekly_overrides?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_imports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_override_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          changed_by_name: string | null
          company_id: string
          field: string
          id: string
          new_value: number | null
          previous_value: number | null
          week_key: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          changed_by_name?: string | null
          company_id: string
          field: string
          id?: string
          new_value?: number | null
          previous_value?: number | null
          week_key: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          changed_by_name?: string | null
          company_id?: string
          field?: string
          id?: string
          new_value?: number | null
          previous_value?: number | null
          week_key?: string
        }
        Relationships: []
      }
      cashflow_cash_in_items: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          deal_name: string
          fee_type: string
          id: string
          target_date: string
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          deal_name: string
          fee_type: string
          id?: string
          target_date: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          deal_name?: string
          fee_type?: string
          id?: string
          target_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_cash_in_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_cash_in_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_cash_in_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      cashflow_deal_overrides: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          deal_entry_id: string
          end_date: string | null
          excluded_dates: string[]
          id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          deal_entry_id: string
          end_date?: string | null
          excluded_dates?: string[]
          id?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          deal_entry_id?: string
          end_date?: string | null
          excluded_dates?: string[]
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_sidebar_data: {
        Row: {
          cash_in_items: Json
          company_id: string
          id: string
          notes: Json
          updated_at: string
        }
        Insert: {
          cash_in_items?: Json
          company_id: string
          id?: string
          notes?: Json
          updated_at?: string
        }
        Update: {
          cash_in_items?: Json
          company_id?: string
          id?: string
          notes?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_sidebar_data_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cell_comments: {
        Row: {
          cell_value_snapshot: number | null
          company_id: string
          content_html: string
          content_json: Json | null
          content_text: string
          created_at: string
          created_by: string
          id: string
          line_item_key: string
          line_item_label: string
          parent_comment_id: string | null
          plan_id: string | null
          updated_at: string
          week_ending: string | null
          week_key: string
          week_num: number | null
        }
        Insert: {
          cell_value_snapshot?: number | null
          company_id: string
          content_html?: string
          content_json?: Json | null
          content_text?: string
          created_at?: string
          created_by: string
          id?: string
          line_item_key: string
          line_item_label: string
          parent_comment_id?: string | null
          plan_id?: string | null
          updated_at?: string
          week_ending?: string | null
          week_key: string
          week_num?: number | null
        }
        Update: {
          cell_value_snapshot?: number | null
          company_id?: string
          content_html?: string
          content_json?: Json | null
          content_text?: string
          created_at?: string
          created_by?: string
          id?: string
          line_item_key?: string
          line_item_label?: string
          parent_comment_id?: string | null
          plan_id?: string | null
          updated_at?: string
          week_ending?: string | null
          week_key?: string
          week_num?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cell_comments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cell_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "cell_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_entries: {
        Row: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          crm_company_id: string | null
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          channel_type?: Database["public"]["Enums"]["channel_type"]
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["channel_type"]
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_entries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_entries_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
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
      claap_api_usage: {
        Row: {
          calls_made: number
          created_at: string
          daily_limit: number
          first_429_at: string | null
          last_429_at: string | null
          last_call_at: string | null
          reset_at: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          calls_made?: number
          created_at?: string
          daily_limit?: number
          first_429_at?: string | null
          last_429_at?: string | null
          last_call_at?: string | null
          reset_at?: string
          updated_at?: string
          usage_date?: string
        }
        Update: {
          calls_made?: number
          created_at?: string
          daily_limit?: number
          first_429_at?: string | null
          last_429_at?: string | null
          last_call_at?: string | null
          reset_at?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
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
          sync_all_calls: boolean
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
          sync_all_calls?: boolean
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
          sync_all_calls?: boolean
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
      claap_mapping_reviews: {
        Row: {
          candidate_id: string | null
          created_at: string
          feedback: Json | null
          id: string
          override_reason: string | null
          recording_id: string
          resolution: string
          reviewer_id: string | null
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          override_reason?: string | null
          recording_id: string
          resolution: string
          reviewer_id?: string | null
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          feedback?: Json | null
          id?: string
          override_reason?: string | null
          recording_id?: string
          resolution?: string
          reviewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_mapping_reviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "claap_recording_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_mapping_reviews_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "claap_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_match_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          match_confidence: number | null
          match_method: string | null
          match_reason: string | null
          meeting_id: string
          new_deal_id: string | null
          new_status: string | null
          performed_by: string | null
          previous_deal_id: string | null
          previous_status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          meeting_id: string
          new_deal_id?: string | null
          new_status?: string | null
          performed_by?: string | null
          previous_deal_id?: string | null
          previous_status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          meeting_id?: string
          new_deal_id?: string | null
          new_status?: string | null
          performed_by?: string | null
          previous_deal_id?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_match_audit_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "claap_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_match_feedback: {
        Row: {
          action: string
          chosen_deal_id: string | null
          company_id: string | null
          created_at: string
          id: string
          meeting_id: string
          performed_by: string | null
          signals: Json | null
          suggested_deal_id: string | null
          suggestion_id: string | null
        }
        Insert: {
          action: string
          chosen_deal_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          performed_by?: string | null
          signals?: Json | null
          suggested_deal_id?: string | null
          suggestion_id?: string | null
        }
        Update: {
          action?: string
          chosen_deal_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          performed_by?: string | null
          signals?: Json | null
          suggested_deal_id?: string | null
          suggestion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_match_feedback_chosen_deal_id_fkey"
            columns: ["chosen_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_match_feedback_chosen_deal_id_fkey"
            columns: ["chosen_deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "claap_match_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_match_feedback_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "claap_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_match_feedback_suggested_deal_id_fkey"
            columns: ["suggested_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_match_feedback_suggested_deal_id_fkey"
            columns: ["suggested_deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "claap_match_feedback_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "claap_match_suggestions"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_match_suggestions: {
        Row: {
          company_name: string | null
          confidence: number
          contact_email: string | null
          created_at: string
          deal_id: string | null
          feedback_action: string | null
          feedback_at: string | null
          feedback_by: string | null
          id: string
          lender_name: string | null
          meeting_id: string
          rank: number
          reason: string | null
          status: string
          suggestion_source: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          confidence?: number
          contact_email?: string | null
          created_at?: string
          deal_id?: string | null
          feedback_action?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          id?: string
          lender_name?: string | null
          meeting_id: string
          rank?: number
          reason?: string | null
          status?: string
          suggestion_source?: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          confidence?: number
          contact_email?: string | null
          created_at?: string
          deal_id?: string | null
          feedback_action?: string | null
          feedback_at?: string | null
          feedback_by?: string | null
          id?: string
          lender_name?: string | null
          meeting_id?: string
          rank?: number
          reason?: string | null
          status?: string
          suggestion_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claap_match_suggestions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_match_suggestions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "claap_match_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "claap_meetings"
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
          call_type: string | null
          claap_id: string
          company_id: string | null
          created_at: string
          deal_id: string | null
          duration_seconds: number | null
          exclusion_reason: string | null
          id: string
          key_decisions: string[] | null
          manually_locked: boolean | null
          match_candidates: Json | null
          match_confidence: number | null
          match_method: string | null
          match_reason: string | null
          match_source: string | null
          match_status: string | null
          matched_at: string | null
          matched_by: string | null
          matched_contact_id: string | null
          matched_crm_company_id: string | null
          matched_lender_id: string | null
          next_steps: string[] | null
          no_internal_participant: boolean | null
          organizer_email: string | null
          raw_payload: Json | null
          recording_url: string | null
          sentiment: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["claap_meeting_status"]
          suggestion_count: number | null
          suggestions_generated_at: string | null
          title: string | null
          topics: string[] | null
          transcript: string | null
          transcript_missing: boolean | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          call_type?: string | null
          claap_id: string
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          exclusion_reason?: string | null
          id?: string
          key_decisions?: string[] | null
          manually_locked?: boolean | null
          match_candidates?: Json | null
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          match_source?: string | null
          match_status?: string | null
          matched_at?: string | null
          matched_by?: string | null
          matched_contact_id?: string | null
          matched_crm_company_id?: string | null
          matched_lender_id?: string | null
          next_steps?: string[] | null
          no_internal_participant?: boolean | null
          organizer_email?: string | null
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["claap_meeting_status"]
          suggestion_count?: number | null
          suggestions_generated_at?: string | null
          title?: string | null
          topics?: string[] | null
          transcript?: string | null
          transcript_missing?: boolean | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          call_type?: string | null
          claap_id?: string
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_seconds?: number | null
          exclusion_reason?: string | null
          id?: string
          key_decisions?: string[] | null
          manually_locked?: boolean | null
          match_candidates?: Json | null
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          match_source?: string | null
          match_status?: string | null
          matched_at?: string | null
          matched_by?: string | null
          matched_contact_id?: string | null
          matched_crm_company_id?: string | null
          matched_lender_id?: string | null
          next_steps?: string[] | null
          no_internal_participant?: boolean | null
          organizer_email?: string | null
          raw_payload?: Json | null
          recording_url?: string | null
          sentiment?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["claap_meeting_status"]
          suggestion_count?: number | null
          suggestions_generated_at?: string | null
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
          {
            foreignKeyName: "claap_meetings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      claap_recording_candidates: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          evidence: Json
          id: string
          rank: number
          reasons: Json
          recording_id: string
          run_type: string
          score: number
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          evidence?: Json
          id?: string
          rank?: number
          reasons?: Json
          recording_id: string
          run_type: string
          score: number
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          evidence?: Json
          id?: string
          rank?: number
          reasons?: Json
          recording_id?: string
          run_type?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "claap_recording_candidates_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "claap_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_recording_links: {
        Row: {
          candidate_id: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          link_role: string
          recording_id: string
          source: string
        }
        Insert: {
          candidate_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          link_role: string
          recording_id: string
          source?: string
        }
        Update: {
          candidate_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          link_role?: string
          recording_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "claap_recording_links_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "claap_recording_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_recording_links_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "claap_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_recordings: {
        Row: {
          action_items: Json
          chapters: Json | null
          claap_summary_synced_at: string | null
          created_at: string
          ended_at: string | null
          external_id: string
          hydrated_at: string | null
          hydration_complete: boolean
          id: string
          key_takeaways: Json
          last_scored_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          next_sync_at: string | null
          org_company_id: string | null
          organizer_email: string | null
          participants: Json
          recording_url: string | null
          refresh_priority: string
          refresh_requested_at: string | null
          source_payload: Json | null
          started_at: string | null
          status: string
          summary: string | null
          sync_attempts: number
          synthesized_note: Json | null
          synthesized_note_generated_at: string | null
          title: string | null
          transcript_available: boolean
          transcript_url: string | null
          updated_at: string
          workspace_id: string | null
          workspace_name: string | null
        }
        Insert: {
          action_items?: Json
          chapters?: Json | null
          claap_summary_synced_at?: string | null
          created_at?: string
          ended_at?: string | null
          external_id: string
          hydrated_at?: string | null
          hydration_complete?: boolean
          id?: string
          key_takeaways?: Json
          last_scored_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          next_sync_at?: string | null
          org_company_id?: string | null
          organizer_email?: string | null
          participants?: Json
          recording_url?: string | null
          refresh_priority?: string
          refresh_requested_at?: string | null
          source_payload?: Json | null
          started_at?: string | null
          status?: string
          summary?: string | null
          sync_attempts?: number
          synthesized_note?: Json | null
          synthesized_note_generated_at?: string | null
          title?: string | null
          transcript_available?: boolean
          transcript_url?: string | null
          updated_at?: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          action_items?: Json
          chapters?: Json | null
          claap_summary_synced_at?: string | null
          created_at?: string
          ended_at?: string | null
          external_id?: string
          hydrated_at?: string | null
          hydration_complete?: boolean
          id?: string
          key_takeaways?: Json
          last_scored_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          next_sync_at?: string | null
          org_company_id?: string | null
          organizer_email?: string | null
          participants?: Json
          recording_url?: string | null
          refresh_priority?: string
          refresh_requested_at?: string | null
          source_payload?: Json | null
          started_at?: string | null
          status?: string
          summary?: string | null
          sync_attempts?: number
          synthesized_note?: Json | null
          synthesized_note_generated_at?: string | null
          title?: string | null
          transcript_available?: boolean
          transcript_url?: string | null
          updated_at?: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_recordings_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      claap_scoring_runs: {
        Row: {
          auto_links_written: number
          candidates_written: number
          error: string | null
          finished_at: string | null
          id: string
          recording_id: string | null
          run_type: string
          started_at: string
        }
        Insert: {
          auto_links_written?: number
          candidates_written?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          recording_id?: string | null
          run_type: string
          started_at?: string
        }
        Update: {
          auto_links_written?: number
          candidates_written?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          recording_id?: string | null
          run_type?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claap_scoring_runs_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "claap_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_skipped_calls: {
        Row: {
          claap_id: string
          company_id: string | null
          created_at: string
          duration_seconds: number | null
          force_synced: boolean
          force_synced_at: string | null
          force_synced_by: string | null
          id: string
          match_attempts: Json | null
          organizer_email: string | null
          participants: Json | null
          recording_url: string | null
          skip_reason: string
          started_at: string | null
          title: string | null
        }
        Insert: {
          claap_id: string
          company_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          force_synced?: boolean
          force_synced_at?: string | null
          force_synced_by?: string | null
          id?: string
          match_attempts?: Json | null
          organizer_email?: string | null
          participants?: Json | null
          recording_url?: string | null
          skip_reason: string
          started_at?: string | null
          title?: string | null
        }
        Update: {
          claap_id?: string
          company_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          force_synced?: boolean
          force_synced_at?: string | null
          force_synced_by?: string | null
          id?: string
          match_attempts?: Json | null
          organizer_email?: string | null
          participants?: Json | null
          recording_url?: string | null
          skip_reason?: string
          started_at?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_skipped_calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_sync_errors: {
        Row: {
          attempts: number
          created_at: string
          error_code: string
          error_message: string | null
          id: string
          meeting_id: string | null
          org_company_id: string | null
          recording_external_id: string | null
          recording_id: string | null
          workspace_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_code: string
          error_message?: string | null
          id?: string
          meeting_id?: string | null
          org_company_id?: string | null
          recording_external_id?: string | null
          recording_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          error_code?: string
          error_message?: string | null
          id?: string
          meeting_id?: string | null
          org_company_id?: string | null
          recording_external_id?: string | null
          recording_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_sync_errors_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "claap_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_sync_errors_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "claap_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      claap_sync_scope_log: {
        Row: {
          external_id: string | null
          id: string
          in_scope: boolean
          note: string | null
          run_at: string
          source: string
          token_workspace_id: string | null
          workspace_id: string | null
          workspace_name: string | null
        }
        Insert: {
          external_id?: string | null
          id?: string
          in_scope?: boolean
          note?: string | null
          run_at?: string
          source: string
          token_workspace_id?: string | null
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          external_id?: string | null
          id?: string
          in_scope?: boolean
          note?: string | null
          run_at?: string
          source?: string
          token_workspace_id?: string | null
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Relationships: []
      }
      claap_transcripts: {
        Row: {
          call_type: string | null
          claap_meeting_id: string
          created_at: string
          deal_id: string
          duration_seconds: number | null
          id: string
          match_source: string | null
          participants: Json | null
          recorded_at: string | null
          summary: string | null
          transcript_text: string | null
        }
        Insert: {
          call_type?: string | null
          claap_meeting_id: string
          created_at?: string
          deal_id: string
          duration_seconds?: number | null
          id?: string
          match_source?: string | null
          participants?: Json | null
          recorded_at?: string | null
          summary?: string | null
          transcript_text?: string | null
        }
        Update: {
          call_type?: string | null
          claap_meeting_id?: string
          created_at?: string
          deal_id?: string
          duration_seconds?: number | null
          id?: string
          match_source?: string | null
          participants?: Json | null
          recorded_at?: string | null
          summary?: string | null
          transcript_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claap_transcripts_claap_meeting_id_fkey"
            columns: ["claap_meeting_id"]
            isOneToOne: true
            referencedRelation: "claap_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_transcripts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claap_transcripts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      claap_webhook_log: {
        Row: {
          error: string | null
          external_id: string | null
          id: string
          ok: boolean
          org_company_id: string | null
          payload: Json | null
          received_at: string
          status_code: number | null
        }
        Insert: {
          error?: string | null
          external_id?: string | null
          id?: string
          ok: boolean
          org_company_id?: string | null
          payload?: Json | null
          received_at?: string
          status_code?: number | null
        }
        Update: {
          error?: string | null
          external_id?: string | null
          id?: string
          ok?: boolean
          org_company_id?: string | null
          payload?: Json | null
          received_at?: string
          status_code?: number | null
        }
        Relationships: []
      }
      client_error_log: {
        Row: {
          company_id: string | null
          created_at: string
          error_type: string
          feature_area: string | null
          id: string
          message: string
          metadata: Json | null
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          error_type: string
          feature_area?: string | null
          id?: string
          message: string
          metadata?: Json | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          error_type?: string
          feature_area?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
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
          {
            foreignKeyName: "client_request_drafts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "client_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          account_type: string | null
          address: string | null
          archived_at: string | null
          archived_reason: string | null
          channel_type_id: string | null
          city: string | null
          converted_at: string | null
          converted_by: string | null
          country: string | null
          created_at: string
          created_by: string | null
          demo_warning_sent_at: string | null
          description: string | null
          domains: string[] | null
          employee_size: string | null
          id: string
          industry: string | null
          is_demo: boolean
          is_seeding: boolean
          logo_url: string | null
          name: string
          notes: string | null
          primary_domain: string | null
          seed_version: string | null
          seeded_at: string | null
          state: string | null
          subscription_status: string | null
          suspended_at: string | null
          suspended_reason: string | null
          trial_ends_at: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          account_type?: string | null
          address?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          channel_type_id?: string | null
          city?: string | null
          converted_at?: string | null
          converted_by?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          demo_warning_sent_at?: string | null
          description?: string | null
          domains?: string[] | null
          employee_size?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          is_seeding?: boolean
          logo_url?: string | null
          name: string
          notes?: string | null
          primary_domain?: string | null
          seed_version?: string | null
          seeded_at?: string | null
          state?: string | null
          subscription_status?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          account_type?: string | null
          address?: string | null
          archived_at?: string | null
          archived_reason?: string | null
          channel_type_id?: string | null
          city?: string | null
          converted_at?: string | null
          converted_by?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          demo_warning_sent_at?: string | null
          description?: string | null
          domains?: string[] | null
          employee_size?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          is_seeding?: boolean
          logo_url?: string | null
          name?: string
          notes?: string | null
          primary_domain?: string | null
          seed_version?: string | null
          seeded_at?: string | null
          state?: string | null
          subscription_status?: string | null
          suspended_at?: string | null
          suspended_reason?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_channel_type_id_fkey"
            columns: ["channel_type_id"]
            isOneToOne: false
            referencedRelation: "channel_types"
            referencedColumns: ["id"]
          },
        ]
      }
      company_agent_access: {
        Row: {
          access_mode: string | null
          agent_key: string
          company_id: string
          created_at: string
          enabled_by: string | null
          id: string
          is_enabled: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          access_mode?: string | null
          agent_key: string
          company_id: string
          created_at?: string
          enabled_by?: string | null
          id?: string
          is_enabled?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          access_mode?: string | null
          agent_key?: string
          company_id?: string
          created_at?: string
          enabled_by?: string | null
          id?: string
          is_enabled?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_agent_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_email_style_guide: {
        Row: {
          closing: string
          company_id: string
          created_at: string
          custom_instructions: string
          greeting: string
          id: string
          signature: string
          stage_rules: Json
          tone_guidelines: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closing?: string
          company_id: string
          created_at?: string
          custom_instructions?: string
          greeting?: string
          id?: string
          signature?: string
          stage_rules?: Json
          tone_guidelines?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closing?: string
          company_id?: string
          created_at?: string
          custom_instructions?: string
          greeting?: string
          id?: string
          signature?: string
          stage_rules?: Json
          tone_guidelines?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_email_style_guide_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          assist_enabled: boolean | null
          company_id: string
          created_at: string
          deal_memo_enabled: boolean
          gamma_enabled: boolean | null
          id: string
          key_metrics_flex_enabled: boolean | null
          sample_deal_on_signup: boolean
          timeline_view_enabled: boolean
          updated_at: string
          workflows_enabled: boolean
        }
        Insert: {
          agreement_icon_visible?: boolean
          assist_enabled?: boolean | null
          company_id: string
          created_at?: string
          deal_memo_enabled?: boolean
          gamma_enabled?: boolean | null
          id?: string
          key_metrics_flex_enabled?: boolean | null
          sample_deal_on_signup?: boolean
          timeline_view_enabled?: boolean
          updated_at?: string
          workflows_enabled?: boolean
        }
        Update: {
          agreement_icon_visible?: boolean
          assist_enabled?: boolean | null
          company_id?: string
          created_at?: string
          deal_memo_enabled?: boolean
          gamma_enabled?: boolean | null
          id?: string
          key_metrics_flex_enabled?: boolean | null
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
          can_see_insights: boolean
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          can_see_insights?: boolean
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          can_see_insights?: boolean
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
          ai_settings: Json
          company_id: string
          created_at: string
          data_room_default_checklists: Json | null
          deal_info_layout: Json | null
          deal_panel_layout: Json | null
          deal_sourced_via_options: Json | null
          deal_stages: Json | null
          deal_types: Json | null
          deals_hidden_widget_metrics: Json
          deals_special_widgets: Json | null
          deals_widgets_config: Json | null
          default_deal_stage_id: string | null
          disclaimer: string | null
          feature_flags: Json
          fpa_dashboard_config: Json | null
          id: string
          lender_matching_config: Json | null
          permission_settings: Json | null
          stale_alert_config: Json | null
          updated_at: string
        }
        Insert: {
          ai_settings?: Json
          company_id: string
          created_at?: string
          data_room_default_checklists?: Json | null
          deal_info_layout?: Json | null
          deal_panel_layout?: Json | null
          deal_sourced_via_options?: Json | null
          deal_stages?: Json | null
          deal_types?: Json | null
          deals_hidden_widget_metrics?: Json
          deals_special_widgets?: Json | null
          deals_widgets_config?: Json | null
          default_deal_stage_id?: string | null
          disclaimer?: string | null
          feature_flags?: Json
          fpa_dashboard_config?: Json | null
          id?: string
          lender_matching_config?: Json | null
          permission_settings?: Json | null
          stale_alert_config?: Json | null
          updated_at?: string
        }
        Update: {
          ai_settings?: Json
          company_id?: string
          created_at?: string
          data_room_default_checklists?: Json | null
          deal_info_layout?: Json | null
          deal_panel_layout?: Json | null
          deal_sourced_via_options?: Json | null
          deal_stages?: Json | null
          deal_types?: Json | null
          deals_hidden_widget_metrics?: Json
          deals_special_widgets?: Json | null
          deals_widgets_config?: Json | null
          default_deal_stage_id?: string | null
          disclaimer?: string | null
          feature_flags?: Json
          fpa_dashboard_config?: Json | null
          id?: string
          lender_matching_config?: Json | null
          permission_settings?: Json | null
          stale_alert_config?: Json | null
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
      computed_kpis: {
        Row: {
          company_id: string
          created_at: string
          denominator_value: number | null
          error_message: string | null
          id: string
          last_refreshed_at: string
          metric_key: string
          metric_value: number | null
          numerator_value: number | null
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          denominator_value?: number | null
          error_message?: string | null
          id?: string
          last_refreshed_at?: string
          metric_key: string
          metric_value?: number | null
          numerator_value?: number | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          denominator_value?: number | null
          error_message?: string | null
          id?: string
          last_refreshed_at?: string
          metric_key?: string
          metric_value?: number | null
          numerator_value?: number | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "computed_kpis_company_id_fkey"
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
          {
            foreignKeyName: "contact_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      contact_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          contact_id: string
          created_at: string
          field: string | null
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          contact_id: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          contact_id?: string
          created_at?: string
          field?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_audit_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
      contact_company_match_audit: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          decision: string
          id: string
          normalized_company_domain: string | null
          normalized_contact_domain: string | null
          org_company_id: string
          proposed_company_id: string | null
          raw_company_website: string | null
          raw_contact_email: string | null
          reason: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          decision: string
          id?: string
          normalized_company_domain?: string | null
          normalized_contact_domain?: string | null
          org_company_id: string
          proposed_company_id?: string | null
          raw_company_website?: string | null
          raw_contact_email?: string | null
          reason?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          decision?: string
          id?: string
          normalized_company_domain?: string | null
          normalized_contact_domain?: string | null
          org_company_id?: string
          proposed_company_id?: string | null
          raw_company_website?: string | null
          raw_contact_email?: string | null
          reason?: string | null
        }
        Relationships: []
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
          {
            foreignKeyName: "contact_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      contact_types: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          additional_emails: string[] | null
          ae_owner_id: string | null
          behavioral_score: number | null
          buying_role: string | null
          campaign: string | null
          city: string | null
          company_id: string | null
          contact_score: number | null
          contact_type: string | null
          created_at: string
          created_by: string | null
          crm_company_id: string | null
          custom_fields: Json | null
          department: string | null
          description: string | null
          email: string | null
          email_domain_normalized: string | null
          email_opt_in: boolean | null
          external_ids: Json | null
          first_name: string | null
          fit_score: number | null
          full_name: string | null
          hs_additional_emails_raw: string | null
          hs_address: string | null
          hs_annualrevenue: string | null
          hs_associatedcompanyid: number | null
          hs_associatedcompanylastupdated: number | null
          hs_behavioral_lead_scoring_2025: number | null
          hs_behavioral_lead_scoring_2025_threshold: string | null
          hs_business_revenue_modeldate_picker: string | null
          hs_capital_ask: string | null
          hs_city: string | null
          hs_closedate: string | null
          hs_company_name: string | null
          hs_company_size: string | null
          hs_contact_source: string | null
          hs_contact_status: string | null
          hs_contact_type: string | null
          hs_conversion_source_at_time_of_mql: string | null
          hs_conversion_source_at_time_of_paid_lead: string | null
          hs_country: string | null
          hs_created_or_updated_by_amplemarket: string | null
          hs_csat_expectations_met: string | null
          hs_csat_future_openness: string | null
          hs_csat_score: string | null
          hs_csat_score_reason: string | null
          hs_currentlyinworkflow: string | null
          hs_customer_concentration_date_picker: string | null
          hs_date_of_birth: string | null
          hs_days_to_close: number | null
          hs_degree: string | null
          hs_disqualification_reason: string | null
          hs_email_verification_status: string | null
          hs_engagements_last_meeting_booked: string | null
          hs_engagements_last_meeting_booked_campaign: string | null
          hs_engagements_last_meeting_booked_medium: string | null
          hs_engagements_last_meeting_booked_source: string | null
          hs_fax: string | null
          hs_field_of_study: string | null
          hs_first_conversion_date: string | null
          hs_first_conversion_event_name: string | null
          hs_first_deal_created_date: string | null
          hs_fit_lead_scoring_2025: number | null
          hs_fit_lead_scoring_2025_threshold: string | null
          hs_flat_or_declining_revenue_growth_date_picker: string | null
          hs_focus_description: string | null
          hs_followercount: number | null
          hs_gender: string | null
          hs_graduation_date: string | null
          hs_high_burn_rate_date_picker: string | null
          hs_hs_all_accessible_team_ids: string | null
          hs_hs_all_assigned_business_unit_ids: string | null
          hs_hs_all_contact_vids: string | null
          hs_hs_all_owner_ids: string | null
          hs_hs_all_team_ids: string | null
          hs_hs_analytics_average_page_views: number | null
          hs_hs_analytics_first_referrer: string | null
          hs_hs_analytics_first_timestamp: string | null
          hs_hs_analytics_first_touch_converting_campaign: string | null
          hs_hs_analytics_first_url: string | null
          hs_hs_analytics_first_visit_timestamp: string | null
          hs_hs_analytics_last_referrer: string | null
          hs_hs_analytics_last_timestamp: string | null
          hs_hs_analytics_last_touch_converting_campaign: string | null
          hs_hs_analytics_last_url: string | null
          hs_hs_analytics_last_visit_timestamp: string | null
          hs_hs_analytics_num_event_completions: number | null
          hs_hs_analytics_num_page_views: number | null
          hs_hs_analytics_num_visits: number | null
          hs_hs_analytics_revenue: number | null
          hs_hs_analytics_source: string | null
          hs_hs_analytics_source_composite_data: string | null
          hs_hs_analytics_source_data_1: string | null
          hs_hs_analytics_source_data_2: string | null
          hs_hs_associated_target_accounts: number | null
          hs_hs_avatar_filemanager_key: string | null
          hs_hs_bing_ad_clicked: boolean | null
          hs_hs_bing_click_id: string | null
          hs_hs_calculated_form_submissions: string | null
          hs_hs_calculated_merged_vids: string | null
          hs_hs_calculated_mobile_number: string | null
          hs_hs_calculated_phone_number: string | null
          hs_hs_calculated_phone_number_area_code: string | null
          hs_hs_calculated_phone_number_country_code: string | null
          hs_hs_calculated_phone_number_region_code: string | null
          hs_hs_chat_assistant_iql_date: string | null
          hs_hs_chat_assistant_source: string | null
          hs_hs_chat_assistant_summary: string | null
          hs_hs_clicked_linkedin_ad: string | null
          hs_hs_contact_creation_legal_basis_source_instance_id: string | null
          hs_hs_contact_enrichment_opt_out: boolean | null
          hs_hs_contact_enrichment_opt_out_timestamp: string | null
          hs_hs_content_membership_email: string | null
          hs_hs_content_membership_email_confirmed: boolean | null
          hs_hs_content_membership_follow_up_enqueued_at: string | null
          hs_hs_content_membership_registered_at: string | null
          hs_hs_content_membership_registration_domain_sent_to: string | null
          hs_hs_content_membership_registration_email_sent_at: string | null
          hs_hs_content_membership_status: string | null
          hs_hs_conversations_visitor_email: string | null
          hs_hs_count_is_unworked: number | null
          hs_hs_count_is_worked: number | null
          hs_hs_country_region_code: string | null
          hs_hs_created_by_conversations: boolean | null
          hs_hs_created_by_user_id: number | null
          hs_hs_cross_account_note: string | null
          hs_hs_cross_sell_opportunity: boolean | null
          hs_hs_current_customer: string | null
          hs_hs_currently_enrolled_in_prospecting_agent: boolean | null
          hs_hs_customer_agent_lead_status: string | null
          hs_hs_data_privacy_ads_consent: boolean | null
          hs_hs_document_last_revisited: string | null
          hs_hs_email_bad_address: boolean | null
          hs_hs_email_bounce: number | null
          hs_hs_email_click: number | null
          hs_hs_email_customer_quarantined_reason: string | null
          hs_hs_email_delivered: number | null
          hs_hs_email_domain: string | null
          hs_hs_email_first_click_date: string | null
          hs_hs_email_first_open_date: string | null
          hs_hs_email_first_reply_date: string | null
          hs_hs_email_first_send_date: string | null
          hs_hs_email_hard_bounce_reason: string | null
          hs_hs_email_hard_bounce_reason_enum: string | null
          hs_hs_email_is_ineligible: boolean | null
          hs_hs_email_last_click_date: string | null
          hs_hs_email_last_email_name: string | null
          hs_hs_email_last_open_date: string | null
          hs_hs_email_last_reply_date: string | null
          hs_hs_email_last_send_date: string | null
          hs_hs_email_live_sourcing_restricted: boolean | null
          hs_hs_email_open: number | null
          hs_hs_email_optimal_send_day_of_week: string | null
          hs_hs_email_optimal_send_time_of_day: string | null
          hs_hs_email_optout: boolean | null
          hs_hs_email_optout_46655910: string | null
          hs_hs_email_optout_6226421: string | null
          hs_hs_email_optout_6226462: string | null
          hs_hs_email_optout_64393452: string | null
          hs_hs_email_quarantined: boolean | null
          hs_hs_email_quarantined_reason: string | null
          hs_hs_email_recipient_fatigue_recovery_time: string | null
          hs_hs_email_replied: number | null
          hs_hs_email_sends_since_last_engagement: number | null
          hs_hs_email_type: string | null
          hs_hs_emailconfirmationstatus: string | null
          hs_hs_employment_change_detected_date: string | null
          hs_hs_enriched_email_bounce_detected: boolean | null
          hs_hs_facebook_ad_clicked: boolean | null
          hs_hs_facebook_click_id: string | null
          hs_hs_facebookid: string | null
          hs_hs_feedback_last_csat_survey_date: string | null
          hs_hs_feedback_last_csat_survey_follow_up: string | null
          hs_hs_feedback_last_csat_survey_rating: number | null
          hs_hs_feedback_last_nps_follow_up: string | null
          hs_hs_feedback_last_nps_rating: string | null
          hs_hs_feedback_last_nps_rating_number: number | null
          hs_hs_feedback_last_survey_date: string | null
          hs_hs_feedback_show_nps_web_survey: boolean | null
          hs_hs_first_closed_order_id: number | null
          hs_hs_first_engagement_object_id: number | null
          hs_hs_first_order_closed_date: string | null
          hs_hs_first_outreach_date: string | null
          hs_hs_first_subscription_create_date: string | null
          hs_hs_full_name_or_email: string | null
          hs_hs_google_click_id: string | null
          hs_hs_googleplusid: string | null
          hs_hs_gps_error: string | null
          hs_hs_gps_latitude: string | null
          hs_hs_gps_longitude: string | null
          hs_hs_has_active_subscription: number | null
          hs_hs_inferred_language_codes: string | null
          hs_hs_intent_paid_up_to_date: string | null
          hs_hs_intent_signals_enabled: boolean | null
          hs_hs_ip_timezone: string | null
          hs_hs_is_contact: boolean | null
          hs_hs_is_enriched: boolean | null
          hs_hs_is_merge_revertible: boolean | null
          hs_hs_is_unworked: boolean | null
          hs_hs_job_change_detected_date: string | null
          hs_hs_journey_stage: string | null
          hs_hs_last_metered_enrichment_timestamp: string | null
          hs_hs_last_sales_activity_date: string | null
          hs_hs_last_sales_activity_timestamp: string | null
          hs_hs_last_sales_activity_type: string | null
          hs_hs_last_sms_send_date: string | null
          hs_hs_last_sms_send_name: string | null
          hs_hs_latest_disqualified_lead_date: string | null
          hs_hs_latest_meeting_activity: string | null
          hs_hs_latest_open_lead_date: string | null
          hs_hs_latest_qualified_lead_date: string | null
          hs_hs_latest_sequence_ended_date: string | null
          hs_hs_latest_sequence_enrolled: number | null
          hs_hs_latest_sequence_enrolled_date: string | null
          hs_hs_latest_sequence_finished_date: string | null
          hs_hs_latest_sequence_unenrolled_date: string | null
          hs_hs_latest_source: string | null
          hs_hs_latest_source_composite_data: string | null
          hs_hs_latest_source_data_1: string | null
          hs_hs_latest_source_data_2: string | null
          hs_hs_latest_source_timestamp: string | null
          hs_hs_latest_subscription_create_date: string | null
          hs_hs_latitude: number | null
          hs_hs_legal_basis: string | null
          hs_hs_linkedin_ad_clicked: string | null
          hs_hs_linkedin_click_id: string | null
          hs_hs_linkedin_url: string | null
          hs_hs_linkedinid: string | null
          hs_hs_live_enrichment_deadline: string | null
          hs_hs_longitude: number | null
          hs_hs_manual_campaign_ids: number | null
          hs_hs_marketable_reason_id: string | null
          hs_hs_marketable_reason_type: string | null
          hs_hs_marketable_status: string | null
          hs_hs_marketable_until_renewal: string | null
          hs_hs_membership_has_accessed_private_content: number | null
          hs_hs_membership_last_private_content_access_date: string | null
          hs_hs_merged_object_ids: string | null
          hs_hs_messaging_engagement_score: number | null
          hs_hs_mobile_sdk_push_tokens: string | null
          hs_hs_notes_last_activity: string | null
          hs_hs_notes_next_activity: string | null
          hs_hs_notes_next_activity_type: string | null
          hs_hs_object_source: string | null
          hs_hs_object_source_detail_1: string | null
          hs_hs_object_source_detail_2: string | null
          hs_hs_object_source_detail_3: string | null
          hs_hs_object_source_id: string | null
          hs_hs_object_source_label: string | null
          hs_hs_object_source_user_id: number | null
          hs_hs_owning_teams: string | null
          hs_hs_persona: string | null
          hs_hs_pinned_engagement_id: number | null
          hs_hs_pipeline: string | null
          hs_hs_predictivecontactscore: number | null
          hs_hs_predictivecontactscore_v2: number | null
          hs_hs_predictivecontactscorebucket: string | null
          hs_hs_predictivescoringtier: string | null
          hs_hs_prospecting_agent_actively_enrolled_count: number | null
          hs_hs_prospecting_agent_last_enrolled: string | null
          hs_hs_prospecting_agent_total_enrolled_count: number | null
          hs_hs_quarantined_emails: string | null
          hs_hs_read_only: boolean | null
          hs_hs_recent_closed_order_date: string | null
          hs_hs_registered_member: number | null
          hs_hs_registration_method: string | null
          hs_hs_returning_to_office_detected_date: string | null
          hs_hs_role: string | null
          hs_hs_sa_first_engagement_date: string | null
          hs_hs_sa_first_engagement_descr: string | null
          hs_hs_sa_first_engagement_object_type: string | null
          hs_hs_sales_email_last_clicked: string | null
          hs_hs_sales_email_last_opened: string | null
          hs_hs_sales_email_last_replied: string | null
          hs_hs_searchable_calculated_international_mobile_number: string | null
          hs_hs_searchable_calculated_international_phone_number: string | null
          hs_hs_searchable_calculated_mobile_number: string | null
          hs_hs_searchable_calculated_phone_number: string | null
          hs_hs_seniority: string | null
          hs_hs_sequences_actively_enrolled_count: number | null
          hs_hs_sequences_enrolled_count: number | null
          hs_hs_sequences_is_enrolled: boolean | null
          hs_hs_shared_team_ids: string | null
          hs_hs_shared_user_ids: string | null
          hs_hs_social_facebook_clicks: number | null
          hs_hs_social_google_plus_clicks: number | null
          hs_hs_social_last_engagement: string | null
          hs_hs_social_linkedin_clicks: number | null
          hs_hs_social_num_broadcast_clicks: number | null
          hs_hs_social_twitter_clicks: number | null
          hs_hs_source_object_id: number | null
          hs_hs_source_portal_id: number | null
          hs_hs_state_code: string | null
          hs_hs_sub_role: string | null
          hs_hs_testpurge: string | null
          hs_hs_testrollback: string | null
          hs_hs_tiktok_ad_clicked: boolean | null
          hs_hs_tiktok_click_id: string | null
          hs_hs_time_between_contact_creation_and_deal_close: number | null
          hs_hs_time_between_contact_creation_and_deal_creation: number | null
          hs_hs_time_to_first_engagement: number | null
          hs_hs_time_to_move_from_lead_to_customer: number | null
          hs_hs_time_to_move_from_marketingqualifiedlead_to_customer:
            | number
            | null
          hs_hs_time_to_move_from_opportunity_to_customer: number | null
          hs_hs_time_to_move_from_salesqualifiedlead_to_customer: number | null
          hs_hs_time_to_move_from_subscriber_to_customer: number | null
          hs_hs_twitterid: string | null
          hs_hs_unique_creation_key: string | null
          hs_hs_updated_by_user_id: number | null
          hs_hs_user_ids_of_all_notification_followers: string | null
          hs_hs_user_ids_of_all_notification_unfollowers: string | null
          hs_hs_user_ids_of_all_owners: string | null
          hs_hs_v2_cumulative_time_in_customer: number | null
          hs_hs_v2_cumulative_time_in_evangelist: number | null
          hs_hs_v2_cumulative_time_in_lead: number | null
          hs_hs_v2_cumulative_time_in_marketingqualifiedlead: number | null
          hs_hs_v2_cumulative_time_in_opportunity: number | null
          hs_hs_v2_cumulative_time_in_other: number | null
          hs_hs_v2_cumulative_time_in_salesqualifiedlead: number | null
          hs_hs_v2_cumulative_time_in_subscriber: number | null
          hs_hs_v2_date_entered_current_stage: string | null
          hs_hs_v2_date_entered_customer: string | null
          hs_hs_v2_date_entered_evangelist: string | null
          hs_hs_v2_date_entered_lead: string | null
          hs_hs_v2_date_entered_marketingqualifiedlead: string | null
          hs_hs_v2_date_entered_opportunity: string | null
          hs_hs_v2_date_entered_other: string | null
          hs_hs_v2_date_entered_salesqualifiedlead: string | null
          hs_hs_v2_date_entered_subscriber: string | null
          hs_hs_v2_date_exited_customer: string | null
          hs_hs_v2_date_exited_evangelist: string | null
          hs_hs_v2_date_exited_lead: string | null
          hs_hs_v2_date_exited_marketingqualifiedlead: string | null
          hs_hs_v2_date_exited_opportunity: string | null
          hs_hs_v2_date_exited_other: string | null
          hs_hs_v2_date_exited_salesqualifiedlead: string | null
          hs_hs_v2_date_exited_subscriber: string | null
          hs_hs_v2_latest_time_in_customer: number | null
          hs_hs_v2_latest_time_in_evangelist: number | null
          hs_hs_v2_latest_time_in_lead: number | null
          hs_hs_v2_latest_time_in_marketingqualifiedlead: number | null
          hs_hs_v2_latest_time_in_opportunity: number | null
          hs_hs_v2_latest_time_in_other: number | null
          hs_hs_v2_latest_time_in_salesqualifiedlead: number | null
          hs_hs_v2_latest_time_in_subscriber: number | null
          hs_hs_v2_time_in_current_stage: string | null
          hs_hs_was_imported: boolean | null
          hs_hs_whatsapp_phone_number: string | null
          hs_hubspot_owner_assigneddate: string | null
          hs_hubspot_owner_id: string | null
          hs_hubspot_team_id: string | null
          hs_hubspotscore: number | null
          hs_industry: string | null
          hs_industry_or_sector_date_picker: string | null
          hs_initial_zoom_webinar_attendance_average_duration: number | null
          hs_ip_city: string | null
          hs_ip_country: string | null
          hs_ip_country_code: string | null
          hs_ip_latlon: string | null
          hs_ip_state: string | null
          hs_ip_state_code: string | null
          hs_ip_zipcode: string | null
          hs_job_function: string | null
          hs_kloutscoregeneral: number | null
          hs_lender_form_completed: string | null
          hs_lgm_linkedinbio: string | null
          hs_lgm_linkedinurl: string | null
          hs_linkedin: string | null
          hs_linkedin_profile_link: string | null
          hs_linkedinbio: string | null
          hs_linkedinconnections: number | null
          hs_low_gross_margins_date_picker: string | null
          hs_mail_pending: number | null
          hs_mail_received_count: number | null
          hs_mail_sent_count: number | null
          hs_marital_status: string | null
          hs_message: string | null
          hs_metric_issues_date_picker: string | null
          hs_military_status: string | null
          hs_no_clear_path_to_profitability_breakeven_date_picker: string | null
          hs_notes_last_contacted: string | null
          hs_notes_last_updated: string | null
          hs_notes_next_activity_date: string | null
          hs_num_associated_deals: number | null
          hs_num_contacted_notes: number | null
          hs_num_conversion_events: number | null
          hs_num_notes: number | null
          hs_num_unique_conversion_events: number | null
          hs_numemployees: string | null
          hs_operational_concerns_date_picker: string | null
          hs_overleveraged_balance_sheet_date_picker: string | null
          hs_owneremail: string | null
          hs_ownername: string | null
          hs_photo: string | null
          hs_pipeline_challenges_date_picker: string | null
          hs_pipeline_used: string | null
          hs_professional_experience_summary: string | null
          hs_prospect_status: string | null
          hs_reasons_lenders_say_no: string | null
          hs_recent_conversion_date: string | null
          hs_recent_conversion_event_name: string | null
          hs_recent_deal_amount: number | null
          hs_recent_deal_close_date: string | null
          hs_refinancing_too_muchdate_picker: string | null
          hs_relationship_status: string | null
          hs_response_approved: number | null
          hs_response_modified: number | null
          hs_response_regenerated: number | null
          hs_rsvp: string | null
          hs_rsvp_m_a_socal: string | null
          hs_runway_liquidity_challenges_date_picker: string | null
          hs_salutation: string | null
          hs_school: string | null
          hs_service_interest: string | null
          hs_start_date: string | null
          hs_state: string | null
          hs_surveymonkeyeventlastupdated: number | null
          hs_total_revenue: number | null
          hs_twitterbio: string | null
          hs_twitterhandle: string | null
          hs_twitterprofilephoto: string | null
          hs_typeform_response_type: string | null
          hs_utm_campaign: string | null
          hs_utm_content: string | null
          hs_utm_medium: string | null
          hs_utm_source: string | null
          hs_utm_term: string | null
          hs_webinareventlastupdated: number | null
          hs_what_do_you_hope_to_get_out_of_this_event: string | null
          hs_work_email: string | null
          hs_zip: string | null
          hs_zoom_webinar_attendance_average_duration: number | null
          hs_zoom_webinar_attendance_count: number | null
          hs_zoom_webinar_joinlink: string | null
          hs_zoom_webinar_registration_count: number | null
          hubspot_contact_id: string | null
          id: string
          industry: string | null
          job_title: string | null
          last_activity_date: string | null
          last_contact_at: string | null
          last_contacted_date: string | null
          last_inbound_activity_date: string | null
          last_match_run_at: string | null
          last_modified_by: string | null
          last_name: string | null
          last_outbound_touch_date: string | null
          lead_source: string | null
          lead_source_latest: string | null
          lead_source_original: string | null
          lead_status: string | null
          lender_referred_pct: string | null
          lifecycle_stage: string | null
          linkedin_url: string | null
          locale: string | null
          match_confidence: number | null
          match_source: string | null
          match_status: string
          migrated_from_hubspot: boolean | null
          next_activity_date: string | null
          opted_out_one_to_one: boolean | null
          org_company_id: string | null
          owner_user_id: string | null
          phone_mobile: string | null
          phone_opt_in: boolean | null
          phone_other: string | null
          phone_work: string | null
          preferred_channel: string | null
          primary_company_id: string | null
          referral_agreement_on_file: boolean
          referral_fee: string | null
          sdr_owner_id: string | null
          seniority: string | null
          sms_opt_in: boolean | null
          source_system: string | null
          state_region: string | null
          status: string | null
          synced_with_hubspot: boolean | null
          tags: string[] | null
          timezone: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          w9_on_file: boolean
          website_url: string | null
        }
        Insert: {
          additional_emails?: string[] | null
          ae_owner_id?: string | null
          behavioral_score?: number | null
          buying_role?: string | null
          campaign?: string | null
          city?: string | null
          company_id?: string | null
          contact_score?: number | null
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          custom_fields?: Json | null
          department?: string | null
          description?: string | null
          email?: string | null
          email_domain_normalized?: string | null
          email_opt_in?: boolean | null
          external_ids?: Json | null
          first_name?: string | null
          fit_score?: number | null
          full_name?: string | null
          hs_additional_emails_raw?: string | null
          hs_address?: string | null
          hs_annualrevenue?: string | null
          hs_associatedcompanyid?: number | null
          hs_associatedcompanylastupdated?: number | null
          hs_behavioral_lead_scoring_2025?: number | null
          hs_behavioral_lead_scoring_2025_threshold?: string | null
          hs_business_revenue_modeldate_picker?: string | null
          hs_capital_ask?: string | null
          hs_city?: string | null
          hs_closedate?: string | null
          hs_company_name?: string | null
          hs_company_size?: string | null
          hs_contact_source?: string | null
          hs_contact_status?: string | null
          hs_contact_type?: string | null
          hs_conversion_source_at_time_of_mql?: string | null
          hs_conversion_source_at_time_of_paid_lead?: string | null
          hs_country?: string | null
          hs_created_or_updated_by_amplemarket?: string | null
          hs_csat_expectations_met?: string | null
          hs_csat_future_openness?: string | null
          hs_csat_score?: string | null
          hs_csat_score_reason?: string | null
          hs_currentlyinworkflow?: string | null
          hs_customer_concentration_date_picker?: string | null
          hs_date_of_birth?: string | null
          hs_days_to_close?: number | null
          hs_degree?: string | null
          hs_disqualification_reason?: string | null
          hs_email_verification_status?: string | null
          hs_engagements_last_meeting_booked?: string | null
          hs_engagements_last_meeting_booked_campaign?: string | null
          hs_engagements_last_meeting_booked_medium?: string | null
          hs_engagements_last_meeting_booked_source?: string | null
          hs_fax?: string | null
          hs_field_of_study?: string | null
          hs_first_conversion_date?: string | null
          hs_first_conversion_event_name?: string | null
          hs_first_deal_created_date?: string | null
          hs_fit_lead_scoring_2025?: number | null
          hs_fit_lead_scoring_2025_threshold?: string | null
          hs_flat_or_declining_revenue_growth_date_picker?: string | null
          hs_focus_description?: string | null
          hs_followercount?: number | null
          hs_gender?: string | null
          hs_graduation_date?: string | null
          hs_high_burn_rate_date_picker?: string | null
          hs_hs_all_accessible_team_ids?: string | null
          hs_hs_all_assigned_business_unit_ids?: string | null
          hs_hs_all_contact_vids?: string | null
          hs_hs_all_owner_ids?: string | null
          hs_hs_all_team_ids?: string | null
          hs_hs_analytics_average_page_views?: number | null
          hs_hs_analytics_first_referrer?: string | null
          hs_hs_analytics_first_timestamp?: string | null
          hs_hs_analytics_first_touch_converting_campaign?: string | null
          hs_hs_analytics_first_url?: string | null
          hs_hs_analytics_first_visit_timestamp?: string | null
          hs_hs_analytics_last_referrer?: string | null
          hs_hs_analytics_last_timestamp?: string | null
          hs_hs_analytics_last_touch_converting_campaign?: string | null
          hs_hs_analytics_last_url?: string | null
          hs_hs_analytics_last_visit_timestamp?: string | null
          hs_hs_analytics_num_event_completions?: number | null
          hs_hs_analytics_num_page_views?: number | null
          hs_hs_analytics_num_visits?: number | null
          hs_hs_analytics_revenue?: number | null
          hs_hs_analytics_source?: string | null
          hs_hs_analytics_source_composite_data?: string | null
          hs_hs_analytics_source_data_1?: string | null
          hs_hs_analytics_source_data_2?: string | null
          hs_hs_associated_target_accounts?: number | null
          hs_hs_avatar_filemanager_key?: string | null
          hs_hs_bing_ad_clicked?: boolean | null
          hs_hs_bing_click_id?: string | null
          hs_hs_calculated_form_submissions?: string | null
          hs_hs_calculated_merged_vids?: string | null
          hs_hs_calculated_mobile_number?: string | null
          hs_hs_calculated_phone_number?: string | null
          hs_hs_calculated_phone_number_area_code?: string | null
          hs_hs_calculated_phone_number_country_code?: string | null
          hs_hs_calculated_phone_number_region_code?: string | null
          hs_hs_chat_assistant_iql_date?: string | null
          hs_hs_chat_assistant_source?: string | null
          hs_hs_chat_assistant_summary?: string | null
          hs_hs_clicked_linkedin_ad?: string | null
          hs_hs_contact_creation_legal_basis_source_instance_id?: string | null
          hs_hs_contact_enrichment_opt_out?: boolean | null
          hs_hs_contact_enrichment_opt_out_timestamp?: string | null
          hs_hs_content_membership_email?: string | null
          hs_hs_content_membership_email_confirmed?: boolean | null
          hs_hs_content_membership_follow_up_enqueued_at?: string | null
          hs_hs_content_membership_registered_at?: string | null
          hs_hs_content_membership_registration_domain_sent_to?: string | null
          hs_hs_content_membership_registration_email_sent_at?: string | null
          hs_hs_content_membership_status?: string | null
          hs_hs_conversations_visitor_email?: string | null
          hs_hs_count_is_unworked?: number | null
          hs_hs_count_is_worked?: number | null
          hs_hs_country_region_code?: string | null
          hs_hs_created_by_conversations?: boolean | null
          hs_hs_created_by_user_id?: number | null
          hs_hs_cross_account_note?: string | null
          hs_hs_cross_sell_opportunity?: boolean | null
          hs_hs_current_customer?: string | null
          hs_hs_currently_enrolled_in_prospecting_agent?: boolean | null
          hs_hs_customer_agent_lead_status?: string | null
          hs_hs_data_privacy_ads_consent?: boolean | null
          hs_hs_document_last_revisited?: string | null
          hs_hs_email_bad_address?: boolean | null
          hs_hs_email_bounce?: number | null
          hs_hs_email_click?: number | null
          hs_hs_email_customer_quarantined_reason?: string | null
          hs_hs_email_delivered?: number | null
          hs_hs_email_domain?: string | null
          hs_hs_email_first_click_date?: string | null
          hs_hs_email_first_open_date?: string | null
          hs_hs_email_first_reply_date?: string | null
          hs_hs_email_first_send_date?: string | null
          hs_hs_email_hard_bounce_reason?: string | null
          hs_hs_email_hard_bounce_reason_enum?: string | null
          hs_hs_email_is_ineligible?: boolean | null
          hs_hs_email_last_click_date?: string | null
          hs_hs_email_last_email_name?: string | null
          hs_hs_email_last_open_date?: string | null
          hs_hs_email_last_reply_date?: string | null
          hs_hs_email_last_send_date?: string | null
          hs_hs_email_live_sourcing_restricted?: boolean | null
          hs_hs_email_open?: number | null
          hs_hs_email_optimal_send_day_of_week?: string | null
          hs_hs_email_optimal_send_time_of_day?: string | null
          hs_hs_email_optout?: boolean | null
          hs_hs_email_optout_46655910?: string | null
          hs_hs_email_optout_6226421?: string | null
          hs_hs_email_optout_6226462?: string | null
          hs_hs_email_optout_64393452?: string | null
          hs_hs_email_quarantined?: boolean | null
          hs_hs_email_quarantined_reason?: string | null
          hs_hs_email_recipient_fatigue_recovery_time?: string | null
          hs_hs_email_replied?: number | null
          hs_hs_email_sends_since_last_engagement?: number | null
          hs_hs_email_type?: string | null
          hs_hs_emailconfirmationstatus?: string | null
          hs_hs_employment_change_detected_date?: string | null
          hs_hs_enriched_email_bounce_detected?: boolean | null
          hs_hs_facebook_ad_clicked?: boolean | null
          hs_hs_facebook_click_id?: string | null
          hs_hs_facebookid?: string | null
          hs_hs_feedback_last_csat_survey_date?: string | null
          hs_hs_feedback_last_csat_survey_follow_up?: string | null
          hs_hs_feedback_last_csat_survey_rating?: number | null
          hs_hs_feedback_last_nps_follow_up?: string | null
          hs_hs_feedback_last_nps_rating?: string | null
          hs_hs_feedback_last_nps_rating_number?: number | null
          hs_hs_feedback_last_survey_date?: string | null
          hs_hs_feedback_show_nps_web_survey?: boolean | null
          hs_hs_first_closed_order_id?: number | null
          hs_hs_first_engagement_object_id?: number | null
          hs_hs_first_order_closed_date?: string | null
          hs_hs_first_outreach_date?: string | null
          hs_hs_first_subscription_create_date?: string | null
          hs_hs_full_name_or_email?: string | null
          hs_hs_google_click_id?: string | null
          hs_hs_googleplusid?: string | null
          hs_hs_gps_error?: string | null
          hs_hs_gps_latitude?: string | null
          hs_hs_gps_longitude?: string | null
          hs_hs_has_active_subscription?: number | null
          hs_hs_inferred_language_codes?: string | null
          hs_hs_intent_paid_up_to_date?: string | null
          hs_hs_intent_signals_enabled?: boolean | null
          hs_hs_ip_timezone?: string | null
          hs_hs_is_contact?: boolean | null
          hs_hs_is_enriched?: boolean | null
          hs_hs_is_merge_revertible?: boolean | null
          hs_hs_is_unworked?: boolean | null
          hs_hs_job_change_detected_date?: string | null
          hs_hs_journey_stage?: string | null
          hs_hs_last_metered_enrichment_timestamp?: string | null
          hs_hs_last_sales_activity_date?: string | null
          hs_hs_last_sales_activity_timestamp?: string | null
          hs_hs_last_sales_activity_type?: string | null
          hs_hs_last_sms_send_date?: string | null
          hs_hs_last_sms_send_name?: string | null
          hs_hs_latest_disqualified_lead_date?: string | null
          hs_hs_latest_meeting_activity?: string | null
          hs_hs_latest_open_lead_date?: string | null
          hs_hs_latest_qualified_lead_date?: string | null
          hs_hs_latest_sequence_ended_date?: string | null
          hs_hs_latest_sequence_enrolled?: number | null
          hs_hs_latest_sequence_enrolled_date?: string | null
          hs_hs_latest_sequence_finished_date?: string | null
          hs_hs_latest_sequence_unenrolled_date?: string | null
          hs_hs_latest_source?: string | null
          hs_hs_latest_source_composite_data?: string | null
          hs_hs_latest_source_data_1?: string | null
          hs_hs_latest_source_data_2?: string | null
          hs_hs_latest_source_timestamp?: string | null
          hs_hs_latest_subscription_create_date?: string | null
          hs_hs_latitude?: number | null
          hs_hs_legal_basis?: string | null
          hs_hs_linkedin_ad_clicked?: string | null
          hs_hs_linkedin_click_id?: string | null
          hs_hs_linkedin_url?: string | null
          hs_hs_linkedinid?: string | null
          hs_hs_live_enrichment_deadline?: string | null
          hs_hs_longitude?: number | null
          hs_hs_manual_campaign_ids?: number | null
          hs_hs_marketable_reason_id?: string | null
          hs_hs_marketable_reason_type?: string | null
          hs_hs_marketable_status?: string | null
          hs_hs_marketable_until_renewal?: string | null
          hs_hs_membership_has_accessed_private_content?: number | null
          hs_hs_membership_last_private_content_access_date?: string | null
          hs_hs_merged_object_ids?: string | null
          hs_hs_messaging_engagement_score?: number | null
          hs_hs_mobile_sdk_push_tokens?: string | null
          hs_hs_notes_last_activity?: string | null
          hs_hs_notes_next_activity?: string | null
          hs_hs_notes_next_activity_type?: string | null
          hs_hs_object_source?: string | null
          hs_hs_object_source_detail_1?: string | null
          hs_hs_object_source_detail_2?: string | null
          hs_hs_object_source_detail_3?: string | null
          hs_hs_object_source_id?: string | null
          hs_hs_object_source_label?: string | null
          hs_hs_object_source_user_id?: number | null
          hs_hs_owning_teams?: string | null
          hs_hs_persona?: string | null
          hs_hs_pinned_engagement_id?: number | null
          hs_hs_pipeline?: string | null
          hs_hs_predictivecontactscore?: number | null
          hs_hs_predictivecontactscore_v2?: number | null
          hs_hs_predictivecontactscorebucket?: string | null
          hs_hs_predictivescoringtier?: string | null
          hs_hs_prospecting_agent_actively_enrolled_count?: number | null
          hs_hs_prospecting_agent_last_enrolled?: string | null
          hs_hs_prospecting_agent_total_enrolled_count?: number | null
          hs_hs_quarantined_emails?: string | null
          hs_hs_read_only?: boolean | null
          hs_hs_recent_closed_order_date?: string | null
          hs_hs_registered_member?: number | null
          hs_hs_registration_method?: string | null
          hs_hs_returning_to_office_detected_date?: string | null
          hs_hs_role?: string | null
          hs_hs_sa_first_engagement_date?: string | null
          hs_hs_sa_first_engagement_descr?: string | null
          hs_hs_sa_first_engagement_object_type?: string | null
          hs_hs_sales_email_last_clicked?: string | null
          hs_hs_sales_email_last_opened?: string | null
          hs_hs_sales_email_last_replied?: string | null
          hs_hs_searchable_calculated_international_mobile_number?:
            | string
            | null
          hs_hs_searchable_calculated_international_phone_number?: string | null
          hs_hs_searchable_calculated_mobile_number?: string | null
          hs_hs_searchable_calculated_phone_number?: string | null
          hs_hs_seniority?: string | null
          hs_hs_sequences_actively_enrolled_count?: number | null
          hs_hs_sequences_enrolled_count?: number | null
          hs_hs_sequences_is_enrolled?: boolean | null
          hs_hs_shared_team_ids?: string | null
          hs_hs_shared_user_ids?: string | null
          hs_hs_social_facebook_clicks?: number | null
          hs_hs_social_google_plus_clicks?: number | null
          hs_hs_social_last_engagement?: string | null
          hs_hs_social_linkedin_clicks?: number | null
          hs_hs_social_num_broadcast_clicks?: number | null
          hs_hs_social_twitter_clicks?: number | null
          hs_hs_source_object_id?: number | null
          hs_hs_source_portal_id?: number | null
          hs_hs_state_code?: string | null
          hs_hs_sub_role?: string | null
          hs_hs_testpurge?: string | null
          hs_hs_testrollback?: string | null
          hs_hs_tiktok_ad_clicked?: boolean | null
          hs_hs_tiktok_click_id?: string | null
          hs_hs_time_between_contact_creation_and_deal_close?: number | null
          hs_hs_time_between_contact_creation_and_deal_creation?: number | null
          hs_hs_time_to_first_engagement?: number | null
          hs_hs_time_to_move_from_lead_to_customer?: number | null
          hs_hs_time_to_move_from_marketingqualifiedlead_to_customer?:
            | number
            | null
          hs_hs_time_to_move_from_opportunity_to_customer?: number | null
          hs_hs_time_to_move_from_salesqualifiedlead_to_customer?: number | null
          hs_hs_time_to_move_from_subscriber_to_customer?: number | null
          hs_hs_twitterid?: string | null
          hs_hs_unique_creation_key?: string | null
          hs_hs_updated_by_user_id?: number | null
          hs_hs_user_ids_of_all_notification_followers?: string | null
          hs_hs_user_ids_of_all_notification_unfollowers?: string | null
          hs_hs_user_ids_of_all_owners?: string | null
          hs_hs_v2_cumulative_time_in_customer?: number | null
          hs_hs_v2_cumulative_time_in_evangelist?: number | null
          hs_hs_v2_cumulative_time_in_lead?: number | null
          hs_hs_v2_cumulative_time_in_marketingqualifiedlead?: number | null
          hs_hs_v2_cumulative_time_in_opportunity?: number | null
          hs_hs_v2_cumulative_time_in_other?: number | null
          hs_hs_v2_cumulative_time_in_salesqualifiedlead?: number | null
          hs_hs_v2_cumulative_time_in_subscriber?: number | null
          hs_hs_v2_date_entered_current_stage?: string | null
          hs_hs_v2_date_entered_customer?: string | null
          hs_hs_v2_date_entered_evangelist?: string | null
          hs_hs_v2_date_entered_lead?: string | null
          hs_hs_v2_date_entered_marketingqualifiedlead?: string | null
          hs_hs_v2_date_entered_opportunity?: string | null
          hs_hs_v2_date_entered_other?: string | null
          hs_hs_v2_date_entered_salesqualifiedlead?: string | null
          hs_hs_v2_date_entered_subscriber?: string | null
          hs_hs_v2_date_exited_customer?: string | null
          hs_hs_v2_date_exited_evangelist?: string | null
          hs_hs_v2_date_exited_lead?: string | null
          hs_hs_v2_date_exited_marketingqualifiedlead?: string | null
          hs_hs_v2_date_exited_opportunity?: string | null
          hs_hs_v2_date_exited_other?: string | null
          hs_hs_v2_date_exited_salesqualifiedlead?: string | null
          hs_hs_v2_date_exited_subscriber?: string | null
          hs_hs_v2_latest_time_in_customer?: number | null
          hs_hs_v2_latest_time_in_evangelist?: number | null
          hs_hs_v2_latest_time_in_lead?: number | null
          hs_hs_v2_latest_time_in_marketingqualifiedlead?: number | null
          hs_hs_v2_latest_time_in_opportunity?: number | null
          hs_hs_v2_latest_time_in_other?: number | null
          hs_hs_v2_latest_time_in_salesqualifiedlead?: number | null
          hs_hs_v2_latest_time_in_subscriber?: number | null
          hs_hs_v2_time_in_current_stage?: string | null
          hs_hs_was_imported?: boolean | null
          hs_hs_whatsapp_phone_number?: string | null
          hs_hubspot_owner_assigneddate?: string | null
          hs_hubspot_owner_id?: string | null
          hs_hubspot_team_id?: string | null
          hs_hubspotscore?: number | null
          hs_industry?: string | null
          hs_industry_or_sector_date_picker?: string | null
          hs_initial_zoom_webinar_attendance_average_duration?: number | null
          hs_ip_city?: string | null
          hs_ip_country?: string | null
          hs_ip_country_code?: string | null
          hs_ip_latlon?: string | null
          hs_ip_state?: string | null
          hs_ip_state_code?: string | null
          hs_ip_zipcode?: string | null
          hs_job_function?: string | null
          hs_kloutscoregeneral?: number | null
          hs_lender_form_completed?: string | null
          hs_lgm_linkedinbio?: string | null
          hs_lgm_linkedinurl?: string | null
          hs_linkedin?: string | null
          hs_linkedin_profile_link?: string | null
          hs_linkedinbio?: string | null
          hs_linkedinconnections?: number | null
          hs_low_gross_margins_date_picker?: string | null
          hs_mail_pending?: number | null
          hs_mail_received_count?: number | null
          hs_mail_sent_count?: number | null
          hs_marital_status?: string | null
          hs_message?: string | null
          hs_metric_issues_date_picker?: string | null
          hs_military_status?: string | null
          hs_no_clear_path_to_profitability_breakeven_date_picker?:
            | string
            | null
          hs_notes_last_contacted?: string | null
          hs_notes_last_updated?: string | null
          hs_notes_next_activity_date?: string | null
          hs_num_associated_deals?: number | null
          hs_num_contacted_notes?: number | null
          hs_num_conversion_events?: number | null
          hs_num_notes?: number | null
          hs_num_unique_conversion_events?: number | null
          hs_numemployees?: string | null
          hs_operational_concerns_date_picker?: string | null
          hs_overleveraged_balance_sheet_date_picker?: string | null
          hs_owneremail?: string | null
          hs_ownername?: string | null
          hs_photo?: string | null
          hs_pipeline_challenges_date_picker?: string | null
          hs_pipeline_used?: string | null
          hs_professional_experience_summary?: string | null
          hs_prospect_status?: string | null
          hs_reasons_lenders_say_no?: string | null
          hs_recent_conversion_date?: string | null
          hs_recent_conversion_event_name?: string | null
          hs_recent_deal_amount?: number | null
          hs_recent_deal_close_date?: string | null
          hs_refinancing_too_muchdate_picker?: string | null
          hs_relationship_status?: string | null
          hs_response_approved?: number | null
          hs_response_modified?: number | null
          hs_response_regenerated?: number | null
          hs_rsvp?: string | null
          hs_rsvp_m_a_socal?: string | null
          hs_runway_liquidity_challenges_date_picker?: string | null
          hs_salutation?: string | null
          hs_school?: string | null
          hs_service_interest?: string | null
          hs_start_date?: string | null
          hs_state?: string | null
          hs_surveymonkeyeventlastupdated?: number | null
          hs_total_revenue?: number | null
          hs_twitterbio?: string | null
          hs_twitterhandle?: string | null
          hs_twitterprofilephoto?: string | null
          hs_typeform_response_type?: string | null
          hs_utm_campaign?: string | null
          hs_utm_content?: string | null
          hs_utm_medium?: string | null
          hs_utm_source?: string | null
          hs_utm_term?: string | null
          hs_webinareventlastupdated?: number | null
          hs_what_do_you_hope_to_get_out_of_this_event?: string | null
          hs_work_email?: string | null
          hs_zip?: string | null
          hs_zoom_webinar_attendance_average_duration?: number | null
          hs_zoom_webinar_attendance_count?: number | null
          hs_zoom_webinar_joinlink?: string | null
          hs_zoom_webinar_registration_count?: number | null
          hubspot_contact_id?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_activity_date?: string | null
          last_contact_at?: string | null
          last_contacted_date?: string | null
          last_inbound_activity_date?: string | null
          last_match_run_at?: string | null
          last_modified_by?: string | null
          last_name?: string | null
          last_outbound_touch_date?: string | null
          lead_source?: string | null
          lead_source_latest?: string | null
          lead_source_original?: string | null
          lead_status?: string | null
          lender_referred_pct?: string | null
          lifecycle_stage?: string | null
          linkedin_url?: string | null
          locale?: string | null
          match_confidence?: number | null
          match_source?: string | null
          match_status?: string
          migrated_from_hubspot?: boolean | null
          next_activity_date?: string | null
          opted_out_one_to_one?: boolean | null
          org_company_id?: string | null
          owner_user_id?: string | null
          phone_mobile?: string | null
          phone_opt_in?: boolean | null
          phone_other?: string | null
          phone_work?: string | null
          preferred_channel?: string | null
          primary_company_id?: string | null
          referral_agreement_on_file?: boolean
          referral_fee?: string | null
          sdr_owner_id?: string | null
          seniority?: string | null
          sms_opt_in?: boolean | null
          source_system?: string | null
          state_region?: string | null
          status?: string | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          w9_on_file?: boolean
          website_url?: string | null
        }
        Update: {
          additional_emails?: string[] | null
          ae_owner_id?: string | null
          behavioral_score?: number | null
          buying_role?: string | null
          campaign?: string | null
          city?: string | null
          company_id?: string | null
          contact_score?: number | null
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          custom_fields?: Json | null
          department?: string | null
          description?: string | null
          email?: string | null
          email_domain_normalized?: string | null
          email_opt_in?: boolean | null
          external_ids?: Json | null
          first_name?: string | null
          fit_score?: number | null
          full_name?: string | null
          hs_additional_emails_raw?: string | null
          hs_address?: string | null
          hs_annualrevenue?: string | null
          hs_associatedcompanyid?: number | null
          hs_associatedcompanylastupdated?: number | null
          hs_behavioral_lead_scoring_2025?: number | null
          hs_behavioral_lead_scoring_2025_threshold?: string | null
          hs_business_revenue_modeldate_picker?: string | null
          hs_capital_ask?: string | null
          hs_city?: string | null
          hs_closedate?: string | null
          hs_company_name?: string | null
          hs_company_size?: string | null
          hs_contact_source?: string | null
          hs_contact_status?: string | null
          hs_contact_type?: string | null
          hs_conversion_source_at_time_of_mql?: string | null
          hs_conversion_source_at_time_of_paid_lead?: string | null
          hs_country?: string | null
          hs_created_or_updated_by_amplemarket?: string | null
          hs_csat_expectations_met?: string | null
          hs_csat_future_openness?: string | null
          hs_csat_score?: string | null
          hs_csat_score_reason?: string | null
          hs_currentlyinworkflow?: string | null
          hs_customer_concentration_date_picker?: string | null
          hs_date_of_birth?: string | null
          hs_days_to_close?: number | null
          hs_degree?: string | null
          hs_disqualification_reason?: string | null
          hs_email_verification_status?: string | null
          hs_engagements_last_meeting_booked?: string | null
          hs_engagements_last_meeting_booked_campaign?: string | null
          hs_engagements_last_meeting_booked_medium?: string | null
          hs_engagements_last_meeting_booked_source?: string | null
          hs_fax?: string | null
          hs_field_of_study?: string | null
          hs_first_conversion_date?: string | null
          hs_first_conversion_event_name?: string | null
          hs_first_deal_created_date?: string | null
          hs_fit_lead_scoring_2025?: number | null
          hs_fit_lead_scoring_2025_threshold?: string | null
          hs_flat_or_declining_revenue_growth_date_picker?: string | null
          hs_focus_description?: string | null
          hs_followercount?: number | null
          hs_gender?: string | null
          hs_graduation_date?: string | null
          hs_high_burn_rate_date_picker?: string | null
          hs_hs_all_accessible_team_ids?: string | null
          hs_hs_all_assigned_business_unit_ids?: string | null
          hs_hs_all_contact_vids?: string | null
          hs_hs_all_owner_ids?: string | null
          hs_hs_all_team_ids?: string | null
          hs_hs_analytics_average_page_views?: number | null
          hs_hs_analytics_first_referrer?: string | null
          hs_hs_analytics_first_timestamp?: string | null
          hs_hs_analytics_first_touch_converting_campaign?: string | null
          hs_hs_analytics_first_url?: string | null
          hs_hs_analytics_first_visit_timestamp?: string | null
          hs_hs_analytics_last_referrer?: string | null
          hs_hs_analytics_last_timestamp?: string | null
          hs_hs_analytics_last_touch_converting_campaign?: string | null
          hs_hs_analytics_last_url?: string | null
          hs_hs_analytics_last_visit_timestamp?: string | null
          hs_hs_analytics_num_event_completions?: number | null
          hs_hs_analytics_num_page_views?: number | null
          hs_hs_analytics_num_visits?: number | null
          hs_hs_analytics_revenue?: number | null
          hs_hs_analytics_source?: string | null
          hs_hs_analytics_source_composite_data?: string | null
          hs_hs_analytics_source_data_1?: string | null
          hs_hs_analytics_source_data_2?: string | null
          hs_hs_associated_target_accounts?: number | null
          hs_hs_avatar_filemanager_key?: string | null
          hs_hs_bing_ad_clicked?: boolean | null
          hs_hs_bing_click_id?: string | null
          hs_hs_calculated_form_submissions?: string | null
          hs_hs_calculated_merged_vids?: string | null
          hs_hs_calculated_mobile_number?: string | null
          hs_hs_calculated_phone_number?: string | null
          hs_hs_calculated_phone_number_area_code?: string | null
          hs_hs_calculated_phone_number_country_code?: string | null
          hs_hs_calculated_phone_number_region_code?: string | null
          hs_hs_chat_assistant_iql_date?: string | null
          hs_hs_chat_assistant_source?: string | null
          hs_hs_chat_assistant_summary?: string | null
          hs_hs_clicked_linkedin_ad?: string | null
          hs_hs_contact_creation_legal_basis_source_instance_id?: string | null
          hs_hs_contact_enrichment_opt_out?: boolean | null
          hs_hs_contact_enrichment_opt_out_timestamp?: string | null
          hs_hs_content_membership_email?: string | null
          hs_hs_content_membership_email_confirmed?: boolean | null
          hs_hs_content_membership_follow_up_enqueued_at?: string | null
          hs_hs_content_membership_registered_at?: string | null
          hs_hs_content_membership_registration_domain_sent_to?: string | null
          hs_hs_content_membership_registration_email_sent_at?: string | null
          hs_hs_content_membership_status?: string | null
          hs_hs_conversations_visitor_email?: string | null
          hs_hs_count_is_unworked?: number | null
          hs_hs_count_is_worked?: number | null
          hs_hs_country_region_code?: string | null
          hs_hs_created_by_conversations?: boolean | null
          hs_hs_created_by_user_id?: number | null
          hs_hs_cross_account_note?: string | null
          hs_hs_cross_sell_opportunity?: boolean | null
          hs_hs_current_customer?: string | null
          hs_hs_currently_enrolled_in_prospecting_agent?: boolean | null
          hs_hs_customer_agent_lead_status?: string | null
          hs_hs_data_privacy_ads_consent?: boolean | null
          hs_hs_document_last_revisited?: string | null
          hs_hs_email_bad_address?: boolean | null
          hs_hs_email_bounce?: number | null
          hs_hs_email_click?: number | null
          hs_hs_email_customer_quarantined_reason?: string | null
          hs_hs_email_delivered?: number | null
          hs_hs_email_domain?: string | null
          hs_hs_email_first_click_date?: string | null
          hs_hs_email_first_open_date?: string | null
          hs_hs_email_first_reply_date?: string | null
          hs_hs_email_first_send_date?: string | null
          hs_hs_email_hard_bounce_reason?: string | null
          hs_hs_email_hard_bounce_reason_enum?: string | null
          hs_hs_email_is_ineligible?: boolean | null
          hs_hs_email_last_click_date?: string | null
          hs_hs_email_last_email_name?: string | null
          hs_hs_email_last_open_date?: string | null
          hs_hs_email_last_reply_date?: string | null
          hs_hs_email_last_send_date?: string | null
          hs_hs_email_live_sourcing_restricted?: boolean | null
          hs_hs_email_open?: number | null
          hs_hs_email_optimal_send_day_of_week?: string | null
          hs_hs_email_optimal_send_time_of_day?: string | null
          hs_hs_email_optout?: boolean | null
          hs_hs_email_optout_46655910?: string | null
          hs_hs_email_optout_6226421?: string | null
          hs_hs_email_optout_6226462?: string | null
          hs_hs_email_optout_64393452?: string | null
          hs_hs_email_quarantined?: boolean | null
          hs_hs_email_quarantined_reason?: string | null
          hs_hs_email_recipient_fatigue_recovery_time?: string | null
          hs_hs_email_replied?: number | null
          hs_hs_email_sends_since_last_engagement?: number | null
          hs_hs_email_type?: string | null
          hs_hs_emailconfirmationstatus?: string | null
          hs_hs_employment_change_detected_date?: string | null
          hs_hs_enriched_email_bounce_detected?: boolean | null
          hs_hs_facebook_ad_clicked?: boolean | null
          hs_hs_facebook_click_id?: string | null
          hs_hs_facebookid?: string | null
          hs_hs_feedback_last_csat_survey_date?: string | null
          hs_hs_feedback_last_csat_survey_follow_up?: string | null
          hs_hs_feedback_last_csat_survey_rating?: number | null
          hs_hs_feedback_last_nps_follow_up?: string | null
          hs_hs_feedback_last_nps_rating?: string | null
          hs_hs_feedback_last_nps_rating_number?: number | null
          hs_hs_feedback_last_survey_date?: string | null
          hs_hs_feedback_show_nps_web_survey?: boolean | null
          hs_hs_first_closed_order_id?: number | null
          hs_hs_first_engagement_object_id?: number | null
          hs_hs_first_order_closed_date?: string | null
          hs_hs_first_outreach_date?: string | null
          hs_hs_first_subscription_create_date?: string | null
          hs_hs_full_name_or_email?: string | null
          hs_hs_google_click_id?: string | null
          hs_hs_googleplusid?: string | null
          hs_hs_gps_error?: string | null
          hs_hs_gps_latitude?: string | null
          hs_hs_gps_longitude?: string | null
          hs_hs_has_active_subscription?: number | null
          hs_hs_inferred_language_codes?: string | null
          hs_hs_intent_paid_up_to_date?: string | null
          hs_hs_intent_signals_enabled?: boolean | null
          hs_hs_ip_timezone?: string | null
          hs_hs_is_contact?: boolean | null
          hs_hs_is_enriched?: boolean | null
          hs_hs_is_merge_revertible?: boolean | null
          hs_hs_is_unworked?: boolean | null
          hs_hs_job_change_detected_date?: string | null
          hs_hs_journey_stage?: string | null
          hs_hs_last_metered_enrichment_timestamp?: string | null
          hs_hs_last_sales_activity_date?: string | null
          hs_hs_last_sales_activity_timestamp?: string | null
          hs_hs_last_sales_activity_type?: string | null
          hs_hs_last_sms_send_date?: string | null
          hs_hs_last_sms_send_name?: string | null
          hs_hs_latest_disqualified_lead_date?: string | null
          hs_hs_latest_meeting_activity?: string | null
          hs_hs_latest_open_lead_date?: string | null
          hs_hs_latest_qualified_lead_date?: string | null
          hs_hs_latest_sequence_ended_date?: string | null
          hs_hs_latest_sequence_enrolled?: number | null
          hs_hs_latest_sequence_enrolled_date?: string | null
          hs_hs_latest_sequence_finished_date?: string | null
          hs_hs_latest_sequence_unenrolled_date?: string | null
          hs_hs_latest_source?: string | null
          hs_hs_latest_source_composite_data?: string | null
          hs_hs_latest_source_data_1?: string | null
          hs_hs_latest_source_data_2?: string | null
          hs_hs_latest_source_timestamp?: string | null
          hs_hs_latest_subscription_create_date?: string | null
          hs_hs_latitude?: number | null
          hs_hs_legal_basis?: string | null
          hs_hs_linkedin_ad_clicked?: string | null
          hs_hs_linkedin_click_id?: string | null
          hs_hs_linkedin_url?: string | null
          hs_hs_linkedinid?: string | null
          hs_hs_live_enrichment_deadline?: string | null
          hs_hs_longitude?: number | null
          hs_hs_manual_campaign_ids?: number | null
          hs_hs_marketable_reason_id?: string | null
          hs_hs_marketable_reason_type?: string | null
          hs_hs_marketable_status?: string | null
          hs_hs_marketable_until_renewal?: string | null
          hs_hs_membership_has_accessed_private_content?: number | null
          hs_hs_membership_last_private_content_access_date?: string | null
          hs_hs_merged_object_ids?: string | null
          hs_hs_messaging_engagement_score?: number | null
          hs_hs_mobile_sdk_push_tokens?: string | null
          hs_hs_notes_last_activity?: string | null
          hs_hs_notes_next_activity?: string | null
          hs_hs_notes_next_activity_type?: string | null
          hs_hs_object_source?: string | null
          hs_hs_object_source_detail_1?: string | null
          hs_hs_object_source_detail_2?: string | null
          hs_hs_object_source_detail_3?: string | null
          hs_hs_object_source_id?: string | null
          hs_hs_object_source_label?: string | null
          hs_hs_object_source_user_id?: number | null
          hs_hs_owning_teams?: string | null
          hs_hs_persona?: string | null
          hs_hs_pinned_engagement_id?: number | null
          hs_hs_pipeline?: string | null
          hs_hs_predictivecontactscore?: number | null
          hs_hs_predictivecontactscore_v2?: number | null
          hs_hs_predictivecontactscorebucket?: string | null
          hs_hs_predictivescoringtier?: string | null
          hs_hs_prospecting_agent_actively_enrolled_count?: number | null
          hs_hs_prospecting_agent_last_enrolled?: string | null
          hs_hs_prospecting_agent_total_enrolled_count?: number | null
          hs_hs_quarantined_emails?: string | null
          hs_hs_read_only?: boolean | null
          hs_hs_recent_closed_order_date?: string | null
          hs_hs_registered_member?: number | null
          hs_hs_registration_method?: string | null
          hs_hs_returning_to_office_detected_date?: string | null
          hs_hs_role?: string | null
          hs_hs_sa_first_engagement_date?: string | null
          hs_hs_sa_first_engagement_descr?: string | null
          hs_hs_sa_first_engagement_object_type?: string | null
          hs_hs_sales_email_last_clicked?: string | null
          hs_hs_sales_email_last_opened?: string | null
          hs_hs_sales_email_last_replied?: string | null
          hs_hs_searchable_calculated_international_mobile_number?:
            | string
            | null
          hs_hs_searchable_calculated_international_phone_number?: string | null
          hs_hs_searchable_calculated_mobile_number?: string | null
          hs_hs_searchable_calculated_phone_number?: string | null
          hs_hs_seniority?: string | null
          hs_hs_sequences_actively_enrolled_count?: number | null
          hs_hs_sequences_enrolled_count?: number | null
          hs_hs_sequences_is_enrolled?: boolean | null
          hs_hs_shared_team_ids?: string | null
          hs_hs_shared_user_ids?: string | null
          hs_hs_social_facebook_clicks?: number | null
          hs_hs_social_google_plus_clicks?: number | null
          hs_hs_social_last_engagement?: string | null
          hs_hs_social_linkedin_clicks?: number | null
          hs_hs_social_num_broadcast_clicks?: number | null
          hs_hs_social_twitter_clicks?: number | null
          hs_hs_source_object_id?: number | null
          hs_hs_source_portal_id?: number | null
          hs_hs_state_code?: string | null
          hs_hs_sub_role?: string | null
          hs_hs_testpurge?: string | null
          hs_hs_testrollback?: string | null
          hs_hs_tiktok_ad_clicked?: boolean | null
          hs_hs_tiktok_click_id?: string | null
          hs_hs_time_between_contact_creation_and_deal_close?: number | null
          hs_hs_time_between_contact_creation_and_deal_creation?: number | null
          hs_hs_time_to_first_engagement?: number | null
          hs_hs_time_to_move_from_lead_to_customer?: number | null
          hs_hs_time_to_move_from_marketingqualifiedlead_to_customer?:
            | number
            | null
          hs_hs_time_to_move_from_opportunity_to_customer?: number | null
          hs_hs_time_to_move_from_salesqualifiedlead_to_customer?: number | null
          hs_hs_time_to_move_from_subscriber_to_customer?: number | null
          hs_hs_twitterid?: string | null
          hs_hs_unique_creation_key?: string | null
          hs_hs_updated_by_user_id?: number | null
          hs_hs_user_ids_of_all_notification_followers?: string | null
          hs_hs_user_ids_of_all_notification_unfollowers?: string | null
          hs_hs_user_ids_of_all_owners?: string | null
          hs_hs_v2_cumulative_time_in_customer?: number | null
          hs_hs_v2_cumulative_time_in_evangelist?: number | null
          hs_hs_v2_cumulative_time_in_lead?: number | null
          hs_hs_v2_cumulative_time_in_marketingqualifiedlead?: number | null
          hs_hs_v2_cumulative_time_in_opportunity?: number | null
          hs_hs_v2_cumulative_time_in_other?: number | null
          hs_hs_v2_cumulative_time_in_salesqualifiedlead?: number | null
          hs_hs_v2_cumulative_time_in_subscriber?: number | null
          hs_hs_v2_date_entered_current_stage?: string | null
          hs_hs_v2_date_entered_customer?: string | null
          hs_hs_v2_date_entered_evangelist?: string | null
          hs_hs_v2_date_entered_lead?: string | null
          hs_hs_v2_date_entered_marketingqualifiedlead?: string | null
          hs_hs_v2_date_entered_opportunity?: string | null
          hs_hs_v2_date_entered_other?: string | null
          hs_hs_v2_date_entered_salesqualifiedlead?: string | null
          hs_hs_v2_date_entered_subscriber?: string | null
          hs_hs_v2_date_exited_customer?: string | null
          hs_hs_v2_date_exited_evangelist?: string | null
          hs_hs_v2_date_exited_lead?: string | null
          hs_hs_v2_date_exited_marketingqualifiedlead?: string | null
          hs_hs_v2_date_exited_opportunity?: string | null
          hs_hs_v2_date_exited_other?: string | null
          hs_hs_v2_date_exited_salesqualifiedlead?: string | null
          hs_hs_v2_date_exited_subscriber?: string | null
          hs_hs_v2_latest_time_in_customer?: number | null
          hs_hs_v2_latest_time_in_evangelist?: number | null
          hs_hs_v2_latest_time_in_lead?: number | null
          hs_hs_v2_latest_time_in_marketingqualifiedlead?: number | null
          hs_hs_v2_latest_time_in_opportunity?: number | null
          hs_hs_v2_latest_time_in_other?: number | null
          hs_hs_v2_latest_time_in_salesqualifiedlead?: number | null
          hs_hs_v2_latest_time_in_subscriber?: number | null
          hs_hs_v2_time_in_current_stage?: string | null
          hs_hs_was_imported?: boolean | null
          hs_hs_whatsapp_phone_number?: string | null
          hs_hubspot_owner_assigneddate?: string | null
          hs_hubspot_owner_id?: string | null
          hs_hubspot_team_id?: string | null
          hs_hubspotscore?: number | null
          hs_industry?: string | null
          hs_industry_or_sector_date_picker?: string | null
          hs_initial_zoom_webinar_attendance_average_duration?: number | null
          hs_ip_city?: string | null
          hs_ip_country?: string | null
          hs_ip_country_code?: string | null
          hs_ip_latlon?: string | null
          hs_ip_state?: string | null
          hs_ip_state_code?: string | null
          hs_ip_zipcode?: string | null
          hs_job_function?: string | null
          hs_kloutscoregeneral?: number | null
          hs_lender_form_completed?: string | null
          hs_lgm_linkedinbio?: string | null
          hs_lgm_linkedinurl?: string | null
          hs_linkedin?: string | null
          hs_linkedin_profile_link?: string | null
          hs_linkedinbio?: string | null
          hs_linkedinconnections?: number | null
          hs_low_gross_margins_date_picker?: string | null
          hs_mail_pending?: number | null
          hs_mail_received_count?: number | null
          hs_mail_sent_count?: number | null
          hs_marital_status?: string | null
          hs_message?: string | null
          hs_metric_issues_date_picker?: string | null
          hs_military_status?: string | null
          hs_no_clear_path_to_profitability_breakeven_date_picker?:
            | string
            | null
          hs_notes_last_contacted?: string | null
          hs_notes_last_updated?: string | null
          hs_notes_next_activity_date?: string | null
          hs_num_associated_deals?: number | null
          hs_num_contacted_notes?: number | null
          hs_num_conversion_events?: number | null
          hs_num_notes?: number | null
          hs_num_unique_conversion_events?: number | null
          hs_numemployees?: string | null
          hs_operational_concerns_date_picker?: string | null
          hs_overleveraged_balance_sheet_date_picker?: string | null
          hs_owneremail?: string | null
          hs_ownername?: string | null
          hs_photo?: string | null
          hs_pipeline_challenges_date_picker?: string | null
          hs_pipeline_used?: string | null
          hs_professional_experience_summary?: string | null
          hs_prospect_status?: string | null
          hs_reasons_lenders_say_no?: string | null
          hs_recent_conversion_date?: string | null
          hs_recent_conversion_event_name?: string | null
          hs_recent_deal_amount?: number | null
          hs_recent_deal_close_date?: string | null
          hs_refinancing_too_muchdate_picker?: string | null
          hs_relationship_status?: string | null
          hs_response_approved?: number | null
          hs_response_modified?: number | null
          hs_response_regenerated?: number | null
          hs_rsvp?: string | null
          hs_rsvp_m_a_socal?: string | null
          hs_runway_liquidity_challenges_date_picker?: string | null
          hs_salutation?: string | null
          hs_school?: string | null
          hs_service_interest?: string | null
          hs_start_date?: string | null
          hs_state?: string | null
          hs_surveymonkeyeventlastupdated?: number | null
          hs_total_revenue?: number | null
          hs_twitterbio?: string | null
          hs_twitterhandle?: string | null
          hs_twitterprofilephoto?: string | null
          hs_typeform_response_type?: string | null
          hs_utm_campaign?: string | null
          hs_utm_content?: string | null
          hs_utm_medium?: string | null
          hs_utm_source?: string | null
          hs_utm_term?: string | null
          hs_webinareventlastupdated?: number | null
          hs_what_do_you_hope_to_get_out_of_this_event?: string | null
          hs_work_email?: string | null
          hs_zip?: string | null
          hs_zoom_webinar_attendance_average_duration?: number | null
          hs_zoom_webinar_attendance_count?: number | null
          hs_zoom_webinar_joinlink?: string | null
          hs_zoom_webinar_registration_count?: number | null
          hubspot_contact_id?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          last_activity_date?: string | null
          last_contact_at?: string | null
          last_contacted_date?: string | null
          last_inbound_activity_date?: string | null
          last_match_run_at?: string | null
          last_modified_by?: string | null
          last_name?: string | null
          last_outbound_touch_date?: string | null
          lead_source?: string | null
          lead_source_latest?: string | null
          lead_source_original?: string | null
          lead_status?: string | null
          lender_referred_pct?: string | null
          lifecycle_stage?: string | null
          linkedin_url?: string | null
          locale?: string | null
          match_confidence?: number | null
          match_source?: string | null
          match_status?: string
          migrated_from_hubspot?: boolean | null
          next_activity_date?: string | null
          opted_out_one_to_one?: boolean | null
          org_company_id?: string | null
          owner_user_id?: string | null
          phone_mobile?: string | null
          phone_opt_in?: boolean | null
          phone_other?: string | null
          phone_work?: string | null
          preferred_channel?: string | null
          primary_company_id?: string | null
          referral_agreement_on_file?: boolean
          referral_fee?: string | null
          sdr_owner_id?: string | null
          seniority?: string | null
          sms_opt_in?: boolean | null
          source_system?: string | null
          state_region?: string | null
          status?: string | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          timezone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          w9_on_file?: boolean
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
      copilot_deal_messages: {
        Row: {
          cleared_at: string | null
          content: string
          created_at: string
          deal_id: string
          id: string
          metadata: Json
          role: string
          user_id: string
        }
        Insert: {
          cleared_at?: string | null
          content: string
          created_at?: string
          deal_id: string
          id?: string
          metadata?: Json
          role: string
          user_id: string
        }
        Update: {
          cleared_at?: string | null
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          metadata?: Json
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_deal_messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copilot_deal_messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          address: string | null
          annual_revenue: number | null
          arr: number | null
          company_type: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json | null
          customer_tier: string | null
          description: string | null
          domain: string | null
          domain_normalized: string | null
          employee_count: number | null
          employee_range: string | null
          external_ids: Json | null
          financing_status: string | null
          hq_address: string | null
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
          lifecycle_stage: string | null
          linkedin_url: string | null
          logo_url: string | null
          main_contact_email: string | null
          migrated_from_hubspot: boolean | null
          mrr: number | null
          name: string
          next_activity_date: string | null
          notes: string | null
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
          status: string | null
          sub_industry: string | null
          synced_with_hubspot: boolean | null
          tags: string[] | null
          total_contract_value: number | null
          twitter_url: string | null
          updated_at: string
          website_url: string | null
          year_founded: number | null
        }
        Insert: {
          additional_domains?: string[] | null
          address?: string | null
          annual_revenue?: number | null
          arr?: number | null
          company_type?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          customer_tier?: string | null
          description?: string | null
          domain?: string | null
          domain_normalized?: string | null
          employee_count?: number | null
          employee_range?: string | null
          external_ids?: Json | null
          financing_status?: string | null
          hq_address?: string | null
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
          lifecycle_stage?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          main_contact_email?: string | null
          migrated_from_hubspot?: boolean | null
          mrr?: number | null
          name: string
          next_activity_date?: string | null
          notes?: string | null
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
          status?: string | null
          sub_industry?: string | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          total_contract_value?: number | null
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
          year_founded?: number | null
        }
        Update: {
          additional_domains?: string[] | null
          address?: string | null
          annual_revenue?: number | null
          arr?: number | null
          company_type?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json | null
          customer_tier?: string | null
          description?: string | null
          domain?: string | null
          domain_normalized?: string | null
          employee_count?: number | null
          employee_range?: string | null
          external_ids?: Json | null
          financing_status?: string | null
          hq_address?: string | null
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
          lifecycle_stage?: string | null
          linkedin_url?: string | null
          logo_url?: string | null
          main_contact_email?: string | null
          migrated_from_hubspot?: boolean | null
          mrr?: number | null
          name?: string
          next_activity_date?: string | null
          notes?: string | null
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
          status?: string | null
          sub_industry?: string | null
          synced_with_hubspot?: boolean | null
          tags?: string[] | null
          total_contract_value?: number | null
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
          year_founded?: number | null
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
          {
            foreignKeyName: "crm_company_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      crm_company_attachments: {
        Row: {
          category: string
          content_type: string | null
          created_at: string
          crm_company_id: string
          file_path: string
          id: string
          name: string
          size_bytes: number
          user_id: string
        }
        Insert: {
          category?: string
          content_type?: string | null
          created_at?: string
          crm_company_id: string
          file_path: string
          id?: string
          name: string
          size_bytes?: number
          user_id: string
        }
        Update: {
          category?: string
          content_type?: string | null
          created_at?: string
          crm_company_id?: string
          file_path?: string
          id?: string
          name?: string
          size_bytes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_company_attachments_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
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
      crm_contact_attachments: {
        Row: {
          category: string
          contact_id: string
          content_type: string | null
          created_at: string
          file_path: string
          id: string
          name: string
          size_bytes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          contact_id: string
          content_type?: string | null
          created_at?: string
          file_path: string
          id?: string
          name: string
          size_bytes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          contact_id?: string
          content_type?: string | null
          created_at?: string
          file_path?: string
          id?: string
          name?: string
          size_bytes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_attachments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
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
      dashboard_kpi_plans: {
        Row: {
          comparison_mode: string
          format_type: string
          label: string
          metric_key: string
          plan_value: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          comparison_mode?: string
          format_type?: string
          label: string
          metric_key: string
          plan_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          comparison_mode?: string
          format_type?: string
          label?: string
          metric_key?: string
          plan_value?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      data_quality_issues: {
        Row: {
          deal_id: string | null
          details: Json
          detected_at: string
          id: string
          issue_type: string
          resolved_at: string | null
          source_row_id: string | null
          source_table: string
        }
        Insert: {
          deal_id?: string | null
          details?: Json
          detected_at?: string
          id?: string
          issue_type: string
          resolved_at?: string | null
          source_row_id?: string | null
          source_table: string
        }
        Update: {
          deal_id?: string | null
          details?: Json
          detected_at?: string
          id?: string
          issue_type?: string
          resolved_at?: string | null
          source_row_id?: string | null
          source_table?: string
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
          {
            foreignKeyName: "data_room_audit_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          phase: number | null
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
          phase?: number | null
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
          phase?: number | null
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
            foreignKeyName: "data_room_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      data_room_exports: {
        Row: {
          data_room_type: string
          deal_id: string
          exported_at: string
          file_count: number
          id: string
          user_id: string
        }
        Insert: {
          data_room_type: string
          deal_id: string
          exported_at?: string
          file_count?: number
          id?: string
          user_id: string
        }
        Update: {
          data_room_type?: string
          deal_id?: string
          exported_at?: string
          file_count?: number
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_room_exports_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_room_exports_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "data_room_file_permissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "data_room_share_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_access_requests: {
        Row: {
          created_at: string
          deal_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          message: string | null
          requested_at: string
          requester_email: string
          requester_name: string | null
          requester_user_id: string | null
          status: Database["public"]["Enums"]["deal_access_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          message?: string | null
          requested_at?: string
          requester_email: string
          requester_name?: string | null
          requester_user_id?: string | null
          status?: Database["public"]["Enums"]["deal_access_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          message?: string | null
          requested_at?: string
          requester_email?: string
          requester_name?: string | null
          requester_user_id?: string | null
          status?: Database["public"]["Enums"]["deal_access_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_access_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_access_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_activity: {
        Row: {
          action_type: string
          after: Json
          before: Json
          created_at: string
          deal_id: string
          id: string
          source: string
          user_id: string | null
        }
        Insert: {
          action_type: string
          after?: Json
          before?: Json
          created_at?: string
          deal_id: string
          id?: string
          source?: string
          user_id?: string | null
        }
        Update: {
          action_type?: string
          after?: Json
          before?: Json
          created_at?: string
          deal_id?: string
          id?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_advance_reasons: {
        Row: {
          created_at: string
          created_by: string
          deal_id: string
          id: string
          reason_category: Database["public"]["Enums"]["advance_reason_category"]
          reason_notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          deal_id: string
          id?: string
          reason_category: Database["public"]["Enums"]["advance_reason_category"]
          reason_notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          deal_id?: string
          id?: string
          reason_category?: Database["public"]["Enums"]["advance_reason_category"]
          reason_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_advance_reasons_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_advance_reasons_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_ai_settings: {
        Row: {
          created_at: string
          data_room_context_enabled: boolean
          deal_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          data_room_context_enabled?: boolean
          deal_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          data_room_context_enabled?: boolean
          deal_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_ai_settings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_ai_settings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_ai_status_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          deal_id: string
          derived_status: string | null
          header_status: string | null
          id: string
          mismatch: boolean
          rationale: string | null
          signals: Json
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_id: string
          derived_status?: string | null
          header_status?: string | null
          id?: string
          mismatch?: boolean
          rationale?: string | null
          signals?: Json
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_id?: string
          derived_status?: string | null
          header_status?: string | null
          id?: string
          mismatch?: boolean
          rationale?: string | null
          signals?: Json
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_ai_status_snapshots_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_ai_status_snapshots_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_aliases: {
        Row: {
          alias: string
          alias_normalized: string
          created_at: string
          created_by: string | null
          deal_id: string
          id: string
        }
        Insert: {
          alias: string
          alias_normalized: string
          created_at?: string
          created_by?: string | null
          deal_id: string
          id?: string
        }
        Update: {
          alias?: string
          alias_normalized?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_aliases_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_aliases_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_attachments: {
        Row: {
          category: string
          content_type: string | null
          created_at: string
          deal_id: string
          extracted_at: string | null
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: string | null
          file_path: string
          id: string
          name: string
          position: number
          size_bytes: number
          source: string
          source_email_id: string | null
          source_sender: string | null
          source_subject: string | null
          source_thread_id: string | null
          upload_job_id: string | null
          user_id: string | null
        }
        Insert: {
          category: string
          content_type?: string | null
          created_at?: string
          deal_id: string
          extracted_at?: string | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          file_path: string
          id?: string
          name: string
          position?: number
          size_bytes?: number
          source?: string
          source_email_id?: string | null
          source_sender?: string | null
          source_subject?: string | null
          source_thread_id?: string | null
          upload_job_id?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string
          content_type?: string | null
          created_at?: string
          deal_id?: string
          extracted_at?: string | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
          file_path?: string
          id?: string
          name?: string
          position?: number
          size_bytes?: number
          source?: string
          source_email_id?: string | null
          source_sender?: string | null
          source_subject?: string | null
          source_thread_id?: string | null
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
      deal_audit_log: {
        Row: {
          action_type: string
          created_at: string
          deal_id: string
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          metadata: Json | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          deal_id: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          deal_id?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_audit_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_audit_log_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_calendar_items: {
        Row: {
          created_at: string
          created_by: string
          date: string
          deal_id: string
          id: string
          notes: string | null
          time: string | null
          title: string
          type: Database["public"]["Enums"]["deal_calendar_item_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date: string
          deal_id: string
          id?: string
          notes?: string | null
          time?: string | null
          title: string
          type?: Database["public"]["Enums"]["deal_calendar_item_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          deal_id?: string
          id?: string
          notes?: string | null
          time?: string | null
          title?: string
          type?: Database["public"]["Enums"]["deal_calendar_item_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_calendar_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_calendar_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_call_transcripts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_checklist_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_checklist_status_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_claap_recordings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_computed_metrics: {
        Row: {
          category: string
          company_id: string | null
          computed_at: string
          confidence: number | null
          created_at: string
          deal_id: string
          fiscal_year: number | null
          id: string
          is_actual: boolean | null
          is_missing: boolean | null
          is_outlier: boolean | null
          is_projection: boolean | null
          metric_key: string
          metric_label: string
          period_end: string | null
          period_label: string
          period_start: string | null
          period_type: string
          source_file_id: string | null
          subcategory: string | null
          trend_direction: string | null
          trend_magnitude: string | null
          unit_type: string
          updated_at: string
          value: number | null
        }
        Insert: {
          category?: string
          company_id?: string | null
          computed_at?: string
          confidence?: number | null
          created_at?: string
          deal_id: string
          fiscal_year?: number | null
          id?: string
          is_actual?: boolean | null
          is_missing?: boolean | null
          is_outlier?: boolean | null
          is_projection?: boolean | null
          metric_key: string
          metric_label: string
          period_end?: string | null
          period_label: string
          period_start?: string | null
          period_type?: string
          source_file_id?: string | null
          subcategory?: string | null
          trend_direction?: string | null
          trend_magnitude?: string | null
          unit_type?: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          category?: string
          company_id?: string | null
          computed_at?: string
          confidence?: number | null
          created_at?: string
          deal_id?: string
          fiscal_year?: number | null
          id?: string
          is_actual?: boolean | null
          is_missing?: boolean | null
          is_outlier?: boolean | null
          is_projection?: boolean | null
          metric_key?: string
          metric_label?: string
          period_end?: string | null
          period_label?: string
          period_start?: string | null
          period_type?: string
          source_file_id?: string | null
          subcategory?: string | null
          trend_direction?: string | null
          trend_magnitude?: string | null
          unit_type?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_computed_metrics_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_computed_metrics_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_computed_metrics_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_computed_metrics_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "deal_financial_files"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_data_room_custom_folders: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          deal_id: string
          icon: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          deal_id: string
          icon?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string
          icon?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_data_room_custom_folders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_data_room_custom_folders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_document_exclusions: {
        Row: {
          created_at: string
          deal_id: string
          document_id: string
          document_source: string
          excluded_by: string | null
          id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          document_id: string
          document_source: string
          excluded_by?: string | null
          id?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          document_id?: string
          document_source?: string
          excluded_by?: string | null
          id?: string
        }
        Relationships: []
      }
      deal_email_prompts: {
        Row: {
          cc_json: Json
          company_id: string
          created_at: string
          deal_id: string
          dismissed_at: string | null
          dismissed_by: string | null
          email_template_number: number
          id: string
          merged_body_html: string
          merged_subject: string
          metadata: Json | null
          recipients_json: Json
          sent_at: string | null
          sent_by: string | null
          status: string
          trigger_reason: string
          triggered_at: string
          updated_at: string
          workflow_key: string
          workflow_name: string
        }
        Insert: {
          cc_json?: Json
          company_id: string
          created_at?: string
          deal_id: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          email_template_number: number
          id?: string
          merged_body_html?: string
          merged_subject?: string
          metadata?: Json | null
          recipients_json?: Json
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          trigger_reason: string
          triggered_at?: string
          updated_at?: string
          workflow_key: string
          workflow_name: string
        }
        Update: {
          cc_json?: Json
          company_id?: string
          created_at?: string
          deal_id?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          email_template_number?: number
          id?: string
          merged_body_html?: string
          merged_subject?: string
          metadata?: Json | null
          recipients_json?: Json
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          trigger_reason?: string
          triggered_at?: string
          updated_at?: string
          workflow_key?: string
          workflow_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_email_prompts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_email_prompts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_email_prompts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_emails: {
        Row: {
          deal_id: string
          gmail_message_id: string
          id: string
          link_source: string
          linked_at: string
          locked: boolean
          notes: string | null
          user_id: string
        }
        Insert: {
          deal_id: string
          gmail_message_id: string
          id?: string
          link_source?: string
          linked_at?: string
          locked?: boolean
          notes?: string | null
          user_id: string
        }
        Update: {
          deal_id?: string
          gmail_message_id?: string
          id?: string
          link_source?: string
          linked_at?: string
          locked?: boolean
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
          {
            foreignKeyName: "deal_emails_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "deal_financial_data_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_financial_files_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_financial_insights: {
        Row: {
          company_id: string | null
          created_at: string
          deal_id: string
          generated_at: string
          id: string
          input_hash: string | null
          insight_type: string
          is_stale: boolean | null
          model_used: string | null
          prompt_version: string | null
          schema_version: string | null
          structured_output: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deal_id: string
          generated_at?: string
          id?: string
          input_hash?: string | null
          insight_type: string
          is_stale?: boolean | null
          model_used?: string | null
          prompt_version?: string | null
          schema_version?: string | null
          structured_output?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deal_id?: string
          generated_at?: string
          id?: string
          input_hash?: string | null
          insight_type?: string
          is_stale?: boolean | null
          model_used?: string | null
          prompt_version?: string | null
          schema_version?: string | null
          structured_output?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_financial_insights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financial_insights_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_financial_insights_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_fit_profiles: {
        Row: {
          created_at: string
          deal_id: string
          embedding: string | null
          exclusions: Json
          extracted_at: string | null
          id: string
          model: string | null
          negative_signals: Json
          nuanced_preferences: Json
          positive_signals: Json
          risk_flags: Json
          source_hash: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          embedding?: string | null
          exclusions?: Json
          extracted_at?: string | null
          id?: string
          model?: string | null
          negative_signals?: Json
          nuanced_preferences?: Json
          positive_signals?: Json
          risk_flags?: Json
          source_hash?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          embedding?: string | null
          exclusions?: Json
          extracted_at?: string | null
          id?: string
          model?: string | null
          negative_signals?: Json
          nuanced_preferences?: Json
          positive_signals?: Json
          risk_flags?: Json
          source_hash?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
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
          source: string | null
          source_created_at: string | null
          source_ref: string | null
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
          source?: string | null
          source_created_at?: string | null
          source_ref?: string | null
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
          source?: string | null
          source_created_at?: string | null
          source_ref?: string | null
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
          {
            foreignKeyName: "deal_flag_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      deal_kpi_links: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          kpi_event_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          kpi_event_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          kpi_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_kpi_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_kpi_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_kpi_links_kpi_event_id_fkey"
            columns: ["kpi_event_id"]
            isOneToOne: false
            referencedRelation: "pilot_kpi_events"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_lender_recommendation_exclusions: {
        Row: {
          created_at: string
          deal_id: string
          excluded_by: string
          id: string
          lender_id: string | null
          lender_name: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          excluded_by: string
          id?: string
          lender_id?: string | null
          lender_name: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          excluded_by?: string
          id?: string
          lender_id?: string | null
          lender_name?: string
        }
        Relationships: []
      }
      deal_lenders: {
        Row: {
          approved_at: string | null
          created_at: string
          deal_id: string
          declined_at: string | null
          excluded_at: string | null
          id: string
          last_contact_at: string | null
          last_status_change_at: string | null
          master_lender_id: string | null
          name: string
          notes: string | null
          on_deck_at: string | null
          on_hold_at: string | null
          pass_reason: string | null
          passed_at: string | null
          quote_amount: number | null
          quote_rate: number | null
          quote_term: string | null
          score: number | null
          selected_contact_id: string | null
          stage: string
          submitted_at: string | null
          substage: string | null
          tags: string[]
          tracking_status: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          deal_id: string
          declined_at?: string | null
          excluded_at?: string | null
          id?: string
          last_contact_at?: string | null
          last_status_change_at?: string | null
          master_lender_id?: string | null
          name: string
          notes?: string | null
          on_deck_at?: string | null
          on_hold_at?: string | null
          pass_reason?: string | null
          passed_at?: string | null
          quote_amount?: number | null
          quote_rate?: number | null
          quote_term?: string | null
          score?: number | null
          selected_contact_id?: string | null
          stage?: string
          submitted_at?: string | null
          substage?: string | null
          tags?: string[]
          tracking_status?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          deal_id?: string
          declined_at?: string | null
          excluded_at?: string | null
          id?: string
          last_contact_at?: string | null
          last_status_change_at?: string | null
          master_lender_id?: string | null
          name?: string
          notes?: string | null
          on_deck_at?: string | null
          on_hold_at?: string | null
          pass_reason?: string | null
          passed_at?: string | null
          quote_amount?: number | null
          quote_rate?: number | null
          quote_term?: string | null
          score?: number | null
          selected_contact_id?: string | null
          stage?: string
          submitted_at?: string | null
          substage?: string | null
          tags?: string[]
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
          {
            foreignKeyName: "deal_lenders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_lenders_master_lender_id_fkey"
            columns: ["master_lender_id"]
            isOneToOne: false
            referencedRelation: "master_lenders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_lenders_selected_contact_id_fkey"
            columns: ["selected_contact_id"]
            isOneToOne: false
            referencedRelation: "lender_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_meeting_history: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          meeting_date: string
          source: string | null
          title: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          meeting_date: string
          source?: string | null
          title: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          meeting_date?: string
          source?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_meeting_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_meeting_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "deal_memo_approvals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_memo_audit_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
            foreignKeyName: "deal_memo_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_memo_views_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_memos_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_ownership_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_pipeline_configs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_pipelines: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          is_qa: boolean
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
          is_qa?: boolean
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
          is_qa?: boolean
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
          {
            foreignKeyName: "deal_research_cache_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_saas_lenders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_saas_mappings: {
        Row: {
          analysis_result: Json | null
          deal_id: string
          detected_date_cols: number[] | null
          enabled_fields: Json | null
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
          enabled_fields?: Json | null
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
          enabled_fields?: Json | null
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
          {
            foreignKeyName: "deal_saas_mappings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_saas_model_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_saas_sensitivity_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_saved_views: {
        Row: {
          company_id: string
          config: Json
          created_at: string
          created_by: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          config?: Json
          created_at?: string
          created_by: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          config?: Json
          created_at?: string
          created_by?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_saved_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          {
            foreignKeyName: "deal_space_conversations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          extracted_at: string | null
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: string | null
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
          extracted_at?: string | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
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
          extracted_at?: string | null
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
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
          {
            foreignKeyName: "deal_space_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "deal_space_financials_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          parent_comment_id: string | null
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
          parent_comment_id?: string | null
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
          parent_comment_id?: string | null
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
          {
            foreignKeyName: "deal_space_note_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "deal_space_note_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_space_note_templates: {
        Row: {
          company_id: string | null
          content: string
          created_at: string
          created_by: string
          icon: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          content?: string
          created_at?: string
          created_by: string
          icon?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          content?: string
          created_at?: string
          created_by?: string
          icon?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "deal_space_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      deal_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          company_id: string | null
          deal_id: string
          event_type: string | null
          exited_at: string | null
          from_stage: string | null
          from_stage_id: string | null
          from_stage_label_raw: string | null
          id: string
          pipeline_id: string | null
          source: string | null
          to_stage: string
          to_stage_id: string | null
          to_stage_label_raw: string | null
          unresolved_stage_label: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string | null
          deal_id: string
          event_type?: string | null
          exited_at?: string | null
          from_stage?: string | null
          from_stage_id?: string | null
          from_stage_label_raw?: string | null
          id?: string
          pipeline_id?: string | null
          source?: string | null
          to_stage: string
          to_stage_id?: string | null
          to_stage_label_raw?: string | null
          unresolved_stage_label?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          company_id?: string | null
          deal_id?: string
          event_type?: string | null
          exited_at?: string | null
          from_stage?: string | null
          from_stage_id?: string | null
          from_stage_label_raw?: string | null
          id?: string
          pipeline_id?: string | null
          source?: string | null
          to_stage?: string
          to_stage_id?: string | null
          to_stage_label_raw?: string | null
          unresolved_stage_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_stage_history_notes: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          note: string
          stage_history_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          note: string
          stage_history_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          note?: string
          stage_history_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_notes_stage_history_id_fkey"
            columns: ["stage_history_id"]
            isOneToOne: true
            referencedRelation: "deal_stage_durations"
            referencedColumns: ["enter_event_id"]
          },
          {
            foreignKeyName: "deal_stage_history_notes_stage_history_id_fkey"
            columns: ["stage_history_id"]
            isOneToOne: true
            referencedRelation: "deal_stage_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_notes_stage_history_id_fkey"
            columns: ["stage_history_id"]
            isOneToOne: true
            referencedRelation: "deal_stage_transitions"
            referencedColumns: ["from_enter_event_id"]
          },
          {
            foreignKeyName: "deal_stage_history_notes_stage_history_id_fkey"
            columns: ["stage_history_id"]
            isOneToOne: true
            referencedRelation: "deal_stage_transitions"
            referencedColumns: ["to_enter_event_id"]
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
          {
            foreignKeyName: "deal_status_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          existing_debt_items: Json
          existing_debt_legacy_dismissed: boolean
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
          narrative_embedded_at: string | null
          narrative_embedding: string | null
          narrative_source_hash: string | null
          narrative_summary: string | null
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
          existing_debt_items?: Json
          existing_debt_legacy_dismissed?: boolean
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
          narrative_embedded_at?: string | null
          narrative_embedding?: string | null
          narrative_source_hash?: string | null
          narrative_summary?: string | null
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
          existing_debt_items?: Json
          existing_debt_legacy_dismissed?: boolean
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
          narrative_embedded_at?: string | null
          narrative_embedding?: string | null
          narrative_source_hash?: string | null
          narrative_summary?: string | null
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
          {
            foreignKeyName: "deal_writeups_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deals: {
        Row: {
          agreement_sent: boolean
          ai_custom_instructions: string | null
          ai_status_snapshot: Json | null
          analyst: string | null
          business_model: string | null
          closed_at: string | null
          closing_date: string | null
          company: string
          company_id: string | null
          company_url: string | null
          competitors_mentioned: string | null
          contact: string | null
          contact_email: string | null
          contact_info: string | null
          contact_title: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string
          crm_company_id: string | null
          dashboard_closing_date: string | null
          deal_class: string
          deal_owner: string | null
          deal_owner_user_id: string | null
          deal_type: string | null
          dm_name: string | null
          dm_present: string | null
          engagement_type: string | null
          exclusivity: string | null
          fee_type: string | null
          flag_notes: string | null
          flex_visibility_override: string | null
          hubspot_deal_id: string | null
          hubspot_last_synced_at: string | null
          hubspot_sync_error: string | null
          hubspot_sync_status: string | null
          icp_category: string | null
          id: string
          is_flagged: boolean
          key_signal: string | null
          lead_source: string | null
          lost_at: string | null
          lost_reason: string | null
          manager: string | null
          manager_move_forward_decision: boolean
          materials_added_to_naitive: boolean
          merged_hubspot_ids: string[] | null
          merged_into: string | null
          migrated_from_personal: boolean
          milestone_fee: number | null
          mrr: number | null
          mrr_mode: string
          narrative: string | null
          next_follow_up_at: string | null
          next_step: string | null
          next_step_date: string | null
          notes: string | null
          notes_updated_at: string | null
          objections_raised: string | null
          on_hold: boolean
          one_time_revenue: number | null
          opportunity_type: string | null
          outcome: string | null
          owned_by: string | null
          pain_points_confirmed: string | null
          pipeline_id: string | null
          post_signing_hours: number | null
          pre_signing_hours: number | null
          pricing: string | null
          product_gap_flagged: string | null
          projected_close_date: string | null
          proposal_issued_at: string | null
          prospect_type: string | null
          referral_source: string | null
          referral_source_contact_id: string | null
          referral_source_id: string | null
          referred_by: string | null
          retainer_fee: number | null
          services_offered: string[] | null
          sourced_via: string | null
          stage: string
          status: string | null
          success_fee_percent: number | null
          tags: string[]
          terms_issued_at: string | null
          terms_signed_at: string | null
          total_fee: number | null
          updated_at: string
          user_id: string
          value: number
          why_not_moving_forward: string[] | null
        }
        Insert: {
          agreement_sent?: boolean
          ai_custom_instructions?: string | null
          ai_status_snapshot?: Json | null
          analyst?: string | null
          business_model?: string | null
          closed_at?: string | null
          closing_date?: string | null
          company: string
          company_id?: string | null
          company_url?: string | null
          competitors_mentioned?: string | null
          contact?: string | null
          contact_email?: string | null
          contact_info?: string | null
          contact_title?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          crm_company_id?: string | null
          dashboard_closing_date?: string | null
          deal_class?: string
          deal_owner?: string | null
          deal_owner_user_id?: string | null
          deal_type?: string | null
          dm_name?: string | null
          dm_present?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          fee_type?: string | null
          flag_notes?: string | null
          flex_visibility_override?: string | null
          hubspot_deal_id?: string | null
          hubspot_last_synced_at?: string | null
          hubspot_sync_error?: string | null
          hubspot_sync_status?: string | null
          icp_category?: string | null
          id?: string
          is_flagged?: boolean
          key_signal?: string | null
          lead_source?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          manager?: string | null
          manager_move_forward_decision?: boolean
          materials_added_to_naitive?: boolean
          merged_hubspot_ids?: string[] | null
          merged_into?: string | null
          migrated_from_personal?: boolean
          milestone_fee?: number | null
          mrr?: number | null
          mrr_mode?: string
          narrative?: string | null
          next_follow_up_at?: string | null
          next_step?: string | null
          next_step_date?: string | null
          notes?: string | null
          notes_updated_at?: string | null
          objections_raised?: string | null
          on_hold?: boolean
          one_time_revenue?: number | null
          opportunity_type?: string | null
          outcome?: string | null
          owned_by?: string | null
          pain_points_confirmed?: string | null
          pipeline_id?: string | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          pricing?: string | null
          product_gap_flagged?: string | null
          projected_close_date?: string | null
          proposal_issued_at?: string | null
          prospect_type?: string | null
          referral_source?: string | null
          referral_source_contact_id?: string | null
          referral_source_id?: string | null
          referred_by?: string | null
          retainer_fee?: number | null
          services_offered?: string[] | null
          sourced_via?: string | null
          stage?: string
          status?: string | null
          success_fee_percent?: number | null
          tags?: string[]
          terms_issued_at?: string | null
          terms_signed_at?: string | null
          total_fee?: number | null
          updated_at?: string
          user_id: string
          value?: number
          why_not_moving_forward?: string[] | null
        }
        Update: {
          agreement_sent?: boolean
          ai_custom_instructions?: string | null
          ai_status_snapshot?: Json | null
          analyst?: string | null
          business_model?: string | null
          closed_at?: string | null
          closing_date?: string | null
          company?: string
          company_id?: string | null
          company_url?: string | null
          competitors_mentioned?: string | null
          contact?: string | null
          contact_email?: string | null
          contact_info?: string | null
          contact_title?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string
          crm_company_id?: string | null
          dashboard_closing_date?: string | null
          deal_class?: string
          deal_owner?: string | null
          deal_owner_user_id?: string | null
          deal_type?: string | null
          dm_name?: string | null
          dm_present?: string | null
          engagement_type?: string | null
          exclusivity?: string | null
          fee_type?: string | null
          flag_notes?: string | null
          flex_visibility_override?: string | null
          hubspot_deal_id?: string | null
          hubspot_last_synced_at?: string | null
          hubspot_sync_error?: string | null
          hubspot_sync_status?: string | null
          icp_category?: string | null
          id?: string
          is_flagged?: boolean
          key_signal?: string | null
          lead_source?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          manager?: string | null
          manager_move_forward_decision?: boolean
          materials_added_to_naitive?: boolean
          merged_hubspot_ids?: string[] | null
          merged_into?: string | null
          migrated_from_personal?: boolean
          milestone_fee?: number | null
          mrr?: number | null
          mrr_mode?: string
          narrative?: string | null
          next_follow_up_at?: string | null
          next_step?: string | null
          next_step_date?: string | null
          notes?: string | null
          notes_updated_at?: string | null
          objections_raised?: string | null
          on_hold?: boolean
          one_time_revenue?: number | null
          opportunity_type?: string | null
          outcome?: string | null
          owned_by?: string | null
          pain_points_confirmed?: string | null
          pipeline_id?: string | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          pricing?: string | null
          product_gap_flagged?: string | null
          projected_close_date?: string | null
          proposal_issued_at?: string | null
          prospect_type?: string | null
          referral_source?: string | null
          referral_source_contact_id?: string | null
          referral_source_id?: string | null
          referred_by?: string | null
          retainer_fee?: number | null
          services_offered?: string[] | null
          sourced_via?: string | null
          stage?: string
          status?: string | null
          success_fee_percent?: number | null
          tags?: string[]
          terms_issued_at?: string | null
          terms_signed_at?: string | null
          total_fee?: number | null
          updated_at?: string
          user_id?: string
          value?: number
          why_not_moving_forward?: string[] | null
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
            foreignKeyName: "deals_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "deal_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_referral_source_contact_id_fkey"
            columns: ["referral_source_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_referral_source_id_fkey"
            columns: ["referral_source_id"]
            isOneToOne: false
            referencedRelation: "referral_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      default_milestones: {
        Row: {
          company_id: string
          created_at: string
          days_from_creation: number | null
          days_from_stage: number | null
          id: string
          position: number
          timing_type: string
          title: string
          trigger_stage: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          days_from_creation?: number | null
          days_from_stage?: number | null
          id?: string
          position?: number
          timing_type?: string
          title: string
          trigger_stage?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          days_from_creation?: number | null
          days_from_stage?: number | null
          id?: string
          position?: number
          timing_type?: string
          title?: string
          trigger_stage?: string | null
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
            foreignKeyName: "diligence_report_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      domain_match_settings: {
        Row: {
          auto_apply: boolean
          extra_freemail_domains: string[]
          ignored_domains: string[]
          org_company_id: string
          subdomain_matching: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_apply?: boolean
          extra_freemail_domains?: string[]
          ignored_domains?: string[]
          org_company_id: string
          subdomain_matching?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_apply?: boolean
          extra_freemail_domains?: string[]
          ignored_domains?: string[]
          org_company_id?: string
          subdomain_matching?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      duplicate_deal_suppressions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          deal_ids: string[]
          id: string
          suppression_key: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          deal_ids: string[]
          id?: string
          suppression_key: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          deal_ids?: string[]
          id?: string
          suppression_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_deal_suppressions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_analysis: {
        Row: {
          analyzed_at: string
          category: string
          created_at: string
          deal_id: string | null
          deal_name: string | null
          email_cache_id: string
          extracted_data: Json | null
          follow_up_by: string | null
          follow_up_needed: boolean | null
          id: string
          priority: string
          sentiment: string
          signals: string[] | null
          suggested_action: string | null
          summary: string | null
          user_id: string
        }
        Insert: {
          analyzed_at?: string
          category?: string
          created_at?: string
          deal_id?: string | null
          deal_name?: string | null
          email_cache_id: string
          extracted_data?: Json | null
          follow_up_by?: string | null
          follow_up_needed?: boolean | null
          id?: string
          priority?: string
          sentiment?: string
          signals?: string[] | null
          suggested_action?: string | null
          summary?: string | null
          user_id: string
        }
        Update: {
          analyzed_at?: string
          category?: string
          created_at?: string
          deal_id?: string | null
          deal_name?: string | null
          email_cache_id?: string
          extracted_data?: Json | null
          follow_up_by?: string | null
          follow_up_needed?: boolean | null
          id?: string
          priority?: string
          sentiment?: string
          signals?: string[] | null
          suggested_action?: string | null
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_analysis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_analysis_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "email_analysis_email_cache_id_fkey"
            columns: ["email_cache_id"]
            isOneToOne: true
            referencedRelation: "email_cache"
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
      email_cache: {
        Row: {
          attachments: Json
          body_fetched_at: string | null
          body_html: string | null
          body_text: string | null
          cc_emails: string[] | null
          created_at: string
          fetched_at: string
          from_email: string | null
          from_name: string | null
          gmail_message_id: string
          id: string
          inline_attachments: Json
          is_read: boolean | null
          is_starred: boolean | null
          labels: string[] | null
          provider: string
          received_at: string | null
          snippet: string | null
          subject: string | null
          thread_id: string | null
          to_emails: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          fetched_at?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id: string
          id?: string
          inline_attachments?: Json
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          provider?: string
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          body_fetched_at?: string | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          created_at?: string
          fetched_at?: string
          from_email?: string | null
          from_name?: string | null
          gmail_message_id?: string
          id?: string
          inline_attachments?: Json
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          provider?: string
          received_at?: string | null
          snippet?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_cadence_jobs: {
        Row: {
          contacts_processed: number
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          messages_scanned: number
          scope: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contacts_processed?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          messages_scanned?: number
          scope?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contacts_processed?: number
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          messages_scanned?: number
          scope?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_cadence_profiles: {
        Row: {
          avg_followup_interval_days: number | null
          avg_response_time_hours: number | null
          computed_at: string
          contact_email: string
          contact_name: string | null
          created_at: string
          first_contact_at: string | null
          id: string
          inbound_count: number
          last_contact_at: string | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          median_followup_interval_days: number | null
          outbound_count: number
          relationship_type: string | null
          sample_size: number
          tone: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_followup_interval_days?: number | null
          avg_response_time_hours?: number | null
          computed_at?: string
          contact_email: string
          contact_name?: string | null
          created_at?: string
          first_contact_at?: string | null
          id?: string
          inbound_count?: number
          last_contact_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          median_followup_interval_days?: number | null
          outbound_count?: number
          relationship_type?: string | null
          sample_size?: number
          tone?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_followup_interval_days?: number | null
          avg_response_time_hours?: number | null
          computed_at?: string
          contact_email?: string
          contact_name?: string | null
          created_at?: string
          first_contact_at?: string | null
          id?: string
          inbound_count?: number
          last_contact_at?: string | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          median_followup_interval_days?: number | null
          outbound_count?: number
          relationship_type?: string | null
          sample_size?: number
          tone?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      email_drafts: {
        Row: {
          attachments: string[]
          auto_link_deal: boolean
          bcc_emails: string[]
          body: string | null
          cc_emails: string[]
          created_at: string
          deal_id: string | null
          id: string
          subject: string | null
          thread_id: string
          to_emails: string[]
          to_name: string | null
          track_opens: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: string[]
          auto_link_deal?: boolean
          bcc_emails?: string[]
          body?: string | null
          cc_emails?: string[]
          created_at?: string
          deal_id?: string | null
          id?: string
          subject?: string | null
          thread_id: string
          to_emails?: string[]
          to_name?: string | null
          track_opens?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: string[]
          auto_link_deal?: boolean
          bcc_emails?: string[]
          body?: string | null
          cc_emails?: string[]
          created_at?: string
          deal_id?: string | null
          id?: string
          subject?: string | null
          thread_id?: string
          to_emails?: string[]
          to_name?: string | null
          track_opens?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_intelligence_settings: {
        Row: {
          auto_extract: boolean | null
          auto_tagging: boolean | null
          created_at: string
          follow_up_reminders: boolean | null
          id: string
          last_sync_at: string | null
          sentiment_analysis: boolean | null
          signal_detection: boolean | null
          tag_rules: Json | null
          thread_summaries: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_extract?: boolean | null
          auto_tagging?: boolean | null
          created_at?: string
          follow_up_reminders?: boolean | null
          id?: string
          last_sync_at?: string | null
          sentiment_analysis?: boolean | null
          signal_detection?: boolean | null
          tag_rules?: Json | null
          thread_summaries?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_extract?: boolean | null
          auto_tagging?: boolean | null
          created_at?: string
          follow_up_reminders?: boolean | null
          id?: string
          last_sync_at?: string | null
          sentiment_analysis?: boolean | null
          signal_detection?: boolean | null
          tag_rules?: Json | null
          thread_summaries?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_label_assignments: {
        Row: {
          applied_at: string
          applied_by: string
          id: string
          label_id: string
          message_id: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          applied_by: string
          id?: string
          label_id: string
          message_id?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          applied_at?: string
          applied_by?: string
          id?: string
          label_id?: string
          message_id?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_label_assignments_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "email_labels"
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
          icon: string | null
          id: string
          is_default: boolean | null
          is_shared: boolean
          name: string
          position: number | null
          scope: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean
          name: string
          position?: number | null
          scope?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string
          company_id?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean
          name?: string
          position?: number | null
          scope?: string
          sort_order?: number
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
      email_priority_signal_log: {
        Row: {
          deal_id: string | null
          detected_at: string
          detected_by: string | null
          id: string
          lender_name: string | null
          message_id: string
          signal_type: string
        }
        Insert: {
          deal_id?: string | null
          detected_at?: string
          detected_by?: string | null
          id?: string
          lender_name?: string | null
          message_id: string
          signal_type: string
        }
        Update: {
          deal_id?: string | null
          detected_at?: string
          detected_by?: string | null
          id?: string
          lender_name?: string | null
          message_id?: string
          signal_type?: string
        }
        Relationships: []
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
      email_suppression_log: {
        Row: {
          created_at: string
          deal_id: string | null
          function_name: string | null
          id: string
          intended_recipient: string
          metadata: Json
          reason: string
          subject: string | null
          template: string | null
        }
        Insert: {
          created_at?: string
          deal_id?: string | null
          function_name?: string | null
          id?: string
          intended_recipient: string
          metadata?: Json
          reason: string
          subject?: string | null
          template?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string | null
          function_name?: string | null
          id?: string
          intended_recipient?: string
          metadata?: Json
          reason?: string
          subject?: string | null
          template?: string | null
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
      email_threads: {
        Row: {
          created_at: string
          id: string
          is_clients_deals: boolean
          is_demo_seed: boolean
          last_classified_at: string | null
          latest_message_at: string | null
          match_confidence: number
          match_signals: Json
          matched_deal_id: string | null
          needs_reclassify: boolean
          seed_key: string | null
          subject: string | null
          thread_id: string
          updated_at: string
          user_id: string
          user_override_clients_deals: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_clients_deals?: boolean
          is_demo_seed?: boolean
          last_classified_at?: string | null
          latest_message_at?: string | null
          match_confidence?: number
          match_signals?: Json
          matched_deal_id?: string | null
          needs_reclassify?: boolean
          seed_key?: string | null
          subject?: string | null
          thread_id: string
          updated_at?: string
          user_id: string
          user_override_clients_deals?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          is_clients_deals?: boolean
          is_demo_seed?: boolean
          last_classified_at?: string | null
          latest_message_at?: string | null
          match_confidence?: number
          match_signals?: Json
          matched_deal_id?: string | null
          needs_reclassify?: boolean
          seed_key?: string | null
          subject?: string | null
          thread_id?: string
          updated_at?: string
          user_id?: string
          user_override_clients_deals?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_matched_deal_id_fkey"
            columns: ["matched_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_matched_deal_id_fkey"
            columns: ["matched_deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      email_workflow_events: {
        Row: {
          approved_at: string | null
          company_id: string
          created_at: string
          deal_id: string
          deferred_at: string | null
          dismissed_at: string | null
          email_template_id: string | null
          id: string
          prompt_id: string | null
          prompt_shown_at: string | null
          sent_at: string | null
          sent_by_user_id: string | null
          status: string
          triggered_at: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          approved_at?: string | null
          company_id: string
          created_at?: string
          deal_id: string
          deferred_at?: string | null
          dismissed_at?: string | null
          email_template_id?: string | null
          id?: string
          prompt_id?: string | null
          prompt_shown_at?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          triggered_at?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          approved_at?: string | null
          company_id?: string
          created_at?: string
          deal_id?: string
          deferred_at?: string | null
          dismissed_at?: string | null
          email_template_id?: string | null
          id?: string
          prompt_id?: string | null
          prompt_shown_at?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          status?: string
          triggered_at?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_workflow_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_workflow_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_workflow_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "email_workflow_events_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "deal_email_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_workflow_events_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "email_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      email_workflows: {
        Row: {
          action_type: string
          audience: string | null
          auto_recommend_cc: boolean
          comm_type: string | null
          company_id: string
          created_at: string
          default_subject: string | null
          email_template_id: string | null
          email_template_number: number | null
          email_template_title: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          pipeline_name: string | null
          prevent_duplicate_send: boolean
          requires_approval: boolean
          send_timing: string | null
          sequence_type: string
          show_in_deal_prompt: boolean
          stage_name: string | null
          trigger_event: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_type?: string
          audience?: string | null
          auto_recommend_cc?: boolean
          comm_type?: string | null
          company_id: string
          created_at?: string
          default_subject?: string | null
          email_template_id?: string | null
          email_template_number?: number | null
          email_template_title?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          pipeline_name?: string | null
          prevent_duplicate_send?: boolean
          requires_approval?: boolean
          send_timing?: string | null
          sequence_type?: string
          show_in_deal_prompt?: boolean
          stage_name?: string | null
          trigger_event: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          audience?: string | null
          auto_recommend_cc?: boolean
          comm_type?: string | null
          company_id?: string
          created_at?: string
          default_subject?: string | null
          email_template_id?: string | null
          email_template_number?: number | null
          email_template_title?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          pipeline_name?: string | null
          prevent_duplicate_send?: boolean
          requires_approval?: boolean
          send_timing?: string | null
          sequence_type?: string
          show_in_deal_prompt?: boolean
          stage_name?: string | null
          trigger_event?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_workflows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          created_at: string
          from_email: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          is_read: boolean
          message_id: string
          preview: string | null
          provider: string
          raw: Json | null
          received_at: string | null
          subject: string | null
          thread_id: string | null
          to_emails: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_read?: boolean
          message_id: string
          preview?: string | null
          provider: string
          raw?: Json | null
          received_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_read?: boolean
          message_id?: string
          preview?: string | null
          provider?: string
          raw?: Json | null
          received_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_emails?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      end_of_day_clears: {
        Row: {
          cleared_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          cleared_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          cleared_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          error_message: string
          error_type: string
          feature: string | null
          id: string
          metadata: Json | null
          page_url: string | null
          resolved_at: string | null
          resolved_by: string | null
          stack_trace: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          error_type: string
          feature?: string | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stack_trace?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          error_type?: string
          feature?: string | null
          id?: string
          metadata?: Json | null
          page_url?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stack_trace?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      event_claap_match_cache: {
        Row: {
          created_at: string
          duration_seconds: number | null
          event_id: string
          generated_at: string
          generated_by: string | null
          id: string
          locked: boolean
          org_company_id: string
          reasons: Json
          recorded_at: string | null
          recorder_email: string | null
          recorder_name: string | null
          recording_id: string | null
          recording_title: string | null
          recording_url: string | null
          score: number | null
          status: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          event_id: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          locked?: boolean
          org_company_id: string
          reasons?: Json
          recorded_at?: string | null
          recorder_email?: string | null
          recorder_name?: string | null
          recording_id?: string | null
          recording_title?: string | null
          recording_url?: string | null
          score?: number | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          event_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          locked?: boolean
          org_company_id?: string
          reasons?: Json
          recorded_at?: string | null
          recorder_email?: string | null
          recorder_name?: string | null
          recording_id?: string | null
          recording_title?: string | null
          recording_url?: string | null
          score?: number | null
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_claap_recordings: {
        Row: {
          company_ids: string[]
          contact_ids: string[]
          created_at: string
          deal_ids: string[]
          duration_seconds: number | null
          event_id: string
          id: string
          linked_at: string
          linked_by: string | null
          notes: string | null
          org_company_id: string
          recorded_at: string | null
          recorder_email: string | null
          recorder_name: string | null
          recording_id: string
          recording_title: string | null
          recording_url: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          company_ids?: string[]
          contact_ids?: string[]
          created_at?: string
          deal_ids?: string[]
          duration_seconds?: number | null
          event_id: string
          id?: string
          linked_at?: string
          linked_by?: string | null
          notes?: string | null
          org_company_id: string
          recorded_at?: string | null
          recorder_email?: string | null
          recorder_name?: string | null
          recording_id: string
          recording_title?: string | null
          recording_url?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          company_ids?: string[]
          contact_ids?: string[]
          created_at?: string
          deal_ids?: string[]
          duration_seconds?: number | null
          event_id?: string
          id?: string
          linked_at?: string
          linked_by?: string | null
          notes?: string | null
          org_company_id?: string
          recorded_at?: string | null
          recorder_email?: string | null
          recorder_name?: string | null
          recording_id?: string
          recording_title?: string | null
          recording_url?: string | null
          thumbnail_url?: string | null
          updated_at?: string
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
          category: string | null
          company_id: string | null
          created_at: string
          id: string
          message: string
          page_url: string | null
          rating: number | null
          screenshot_url: string | null
          status: string
          title: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          message: string
          page_url?: string | null
          rating?: number | null
          screenshot_url?: string | null
          status?: string
          title?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          message?: string
          page_url?: string | null
          rating?: number | null
          screenshot_url?: string | null
          status?: string
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
      file_ai_classifications: {
        Row: {
          alternate_targets: Json
          attempts: number
          category: string | null
          checklist_target: string | null
          company_id: string | null
          confidence: number | null
          created_at: string
          deal_id: string
          detected_document_type: string | null
          document_id: string
          entities: Json
          error_message: string | null
          external_share_recommended: boolean | null
          filename: string
          flags: Json
          human_reviewed: boolean
          id: string
          model: string | null
          override_category: string | null
          override_checklist_target: string | null
          override_external_share: boolean | null
          raw_response: Json | null
          reasoning_short: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sensitivity: string | null
          status: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          alternate_targets?: Json
          attempts?: number
          category?: string | null
          checklist_target?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          deal_id: string
          detected_document_type?: string | null
          document_id: string
          entities?: Json
          error_message?: string | null
          external_share_recommended?: boolean | null
          filename: string
          flags?: Json
          human_reviewed?: boolean
          id?: string
          model?: string | null
          override_category?: string | null
          override_checklist_target?: string | null
          override_external_share?: boolean | null
          raw_response?: Json | null
          reasoning_short?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sensitivity?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          alternate_targets?: Json
          attempts?: number
          category?: string | null
          checklist_target?: string | null
          company_id?: string | null
          confidence?: number | null
          created_at?: string
          deal_id?: string
          detected_document_type?: string | null
          document_id?: string
          entities?: Json
          error_message?: string | null
          external_share_recommended?: boolean | null
          filename?: string
          flags?: Json
          human_reviewed?: boolean
          id?: string
          model?: string | null
          override_category?: string | null
          override_checklist_target?: string | null
          override_external_share?: boolean | null
          raw_response?: Json | null
          reasoning_short?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sensitivity?: string | null
          status?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_ai_classifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_ai_classifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_ai_classifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "file_ai_classifications_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "vdr_documents"
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
            foreignKeyName: "file_checklist_map_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      financial_column_settings: {
        Row: {
          column_key: string
          column_type: Database["public"]["Enums"]["financial_column_type"]
          company_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          column_key: string
          column_type?: Database["public"]["Enums"]["financial_column_type"]
          company_id: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          column_key?: string
          column_type?: Database["public"]["Enums"]["financial_column_type"]
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_column_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_comments: {
        Row: {
          anchor_key: string
          anchor_type: string
          comment_text: string
          company_id: string | null
          created_at: string
          created_by_name: string | null
          created_by_user_id: string | null
          deal_id: string
          id: string
          line_item_key: string | null
          line_item_label: string | null
          period_key: string | null
          period_label: string | null
          statement_type: string
          target_label: string | null
          updated_at: string
        }
        Insert: {
          anchor_key: string
          anchor_type: string
          comment_text: string
          company_id?: string | null
          created_at?: string
          created_by_name?: string | null
          created_by_user_id?: string | null
          deal_id: string
          id?: string
          line_item_key?: string | null
          line_item_label?: string | null
          period_key?: string | null
          period_label?: string | null
          statement_type: string
          target_label?: string | null
          updated_at?: string
        }
        Update: {
          anchor_key?: string
          anchor_type?: string
          comment_text?: string
          company_id?: string | null
          created_at?: string
          created_by_name?: string | null
          created_by_user_id?: string | null
          deal_id?: string
          id?: string
          line_item_key?: string | null
          line_item_label?: string | null
          period_key?: string | null
          period_label?: string | null
          statement_type?: string
          target_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_comments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      finserv_deal_projects: {
        Row: {
          completion_date: string | null
          created_at: string
          created_by: string | null
          deal_id: string
          description: string | null
          id: string
          name: string
          position: number
          start_date: string | null
          updated_at: string
          value: number
        }
        Insert: {
          completion_date?: string | null
          created_at?: string
          created_by?: string | null
          deal_id: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          start_date?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          completion_date?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          start_date?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "finserv_deal_projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finserv_deal_projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      finserv_mrr_components: {
        Row: {
          created_at: string
          created_by: string | null
          deal_id: string
          estimated_hours: number
          hourly_rate: number
          id: string
          label: string | null
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_id: string
          estimated_hours?: number
          hourly_rate?: number
          id?: string
          label?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_id?: string
          estimated_hours?: number
          hourly_rate?: number
          id?: string
          label?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finserv_mrr_components_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finserv_mrr_components_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      flex_auto_removal_audit: {
        Row: {
          company_id: string | null
          created_at: string
          deal_id: string
          error_message: string | null
          flex_deal_id: string | null
          id: string
          metadata: Json | null
          new_stage: string | null
          new_status: string | null
          previous_stage: string | null
          previous_status: string | null
          removal_status: string
          trigger_rule: string
          triggered_by: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deal_id: string
          error_message?: string | null
          flex_deal_id?: string | null
          id?: string
          metadata?: Json | null
          new_stage?: string | null
          new_status?: string | null
          previous_stage?: string | null
          previous_status?: string | null
          removal_status?: string
          trigger_rule: string
          triggered_by?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deal_id?: string
          error_message?: string | null
          flex_deal_id?: string | null
          id?: string
          metadata?: Json | null
          new_stage?: string | null
          new_status?: string | null
          previous_stage?: string | null
          previous_status?: string | null
          removal_status?: string
          trigger_rule?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flex_auto_removal_audit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flex_auto_removal_audit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flex_auto_removal_audit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "flex_info_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "flex_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "flex_sync_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      flex_sync_settings: {
        Row: {
          company_id: string
          created_at: string
          id: string
          remove_on_archived: boolean
          remove_on_closed_lost: boolean
          remove_on_closed_won: boolean
          remove_on_due_diligence: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          remove_on_archived?: boolean
          remove_on_closed_lost?: boolean
          remove_on_closed_won?: boolean
          remove_on_due_diligence?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          remove_on_archived?: boolean
          remove_on_closed_lost?: boolean
          remove_on_closed_won?: boolean
          remove_on_due_diligence?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flex_sync_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
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
      funding_source_acquisition_plans: {
        Row: {
          cadence: string
          created_at: string
          id: string
          period: number
          target_count: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          cadence: string
          created_at?: string
          id?: string
          period: number
          target_count?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          cadence?: string
          created_at?: string
          id?: string
          period?: number
          target_count?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: []
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
            foreignKeyName: "gamma_analytics_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "gamma_generations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          is_demo_seed: boolean
          is_read: boolean | null
          is_starred: boolean | null
          labels: string[] | null
          received_at: string | null
          seed_key: string | null
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
          is_demo_seed?: boolean
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          received_at?: string | null
          seed_key?: string | null
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
          is_demo_seed?: boolean
          is_read?: boolean | null
          is_starred?: boolean | null
          labels?: string[] | null
          received_at?: string | null
          seed_key?: string | null
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
          is_demo_seed: boolean
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
          is_demo_seed?: boolean
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
          is_demo_seed?: boolean
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
      hubspot_field_metadata: {
        Row: {
          company_id: string | null
          created_at: string
          group_name: string | null
          hubspot_field_type: string | null
          hubspot_type: string | null
          id: string
          internal_name: string
          is_mapped: boolean
          is_read_only: boolean
          is_system: boolean
          label: string
          mapped_column_name: string | null
          mapped_column_type: string | null
          object_type: string
          options: Json | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          group_name?: string | null
          hubspot_field_type?: string | null
          hubspot_type?: string | null
          id?: string
          internal_name: string
          is_mapped?: boolean
          is_read_only?: boolean
          is_system?: boolean
          label: string
          mapped_column_name?: string | null
          mapped_column_type?: string | null
          object_type: string
          options?: Json | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          group_name?: string | null
          hubspot_field_type?: string | null
          hubspot_type?: string | null
          id?: string
          internal_name?: string
          is_mapped?: boolean
          is_read_only?: boolean
          is_system?: boolean
          label?: string
          mapped_column_name?: string | null
          mapped_column_type?: string | null
          object_type?: string
          options?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_field_metadata_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      hubspot_layout_configs: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          object_type: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          object_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          object_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_layout_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_layout_section_fields: {
        Row: {
          column_span: number
          created_at: string
          display_order: number
          field_metadata_id: string
          id: string
          is_required: boolean
          is_visible: boolean
          section_id: string
          updated_at: string
        }
        Insert: {
          column_span?: number
          created_at?: string
          display_order?: number
          field_metadata_id: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          section_id: string
          updated_at?: string
        }
        Update: {
          column_span?: number
          created_at?: string
          display_order?: number
          field_metadata_id?: string
          id?: string
          is_required?: boolean
          is_visible?: boolean
          section_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_layout_section_fields_field_metadata_id_fkey"
            columns: ["field_metadata_id"]
            isOneToOne: false
            referencedRelation: "hubspot_field_metadata"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubspot_layout_section_fields_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "hubspot_layout_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_layout_sections: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_collapsed_default: boolean
          layout_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_collapsed_default?: boolean
          layout_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_collapsed_default?: boolean
          layout_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_layout_sections_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "hubspot_layout_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_pipeline_stage_map: {
        Row: {
          company_id: string
          created_at: string
          hubspot_dealstage_id: string
          hubspot_pipeline_id: string
          id: string
          naitive_pipeline_id: string
          naitive_stage_name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          hubspot_dealstage_id: string
          hubspot_pipeline_id: string
          id?: string
          naitive_pipeline_id: string
          naitive_stage_name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          hubspot_dealstage_id?: string
          hubspot_pipeline_id?: string
          id?: string
          naitive_pipeline_id?: string
          naitive_stage_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_pipeline_stage_map_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubspot_pipeline_stage_map_naitive_pipeline_id_fkey"
            columns: ["naitive_pipeline_id"]
            isOneToOne: false
            referencedRelation: "deal_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_sync_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          deal_id: string | null
          direction: string
          error_message: string | null
          hubspot_deal_id: string | null
          id: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
        }
        Insert: {
          action: string
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          direction?: string
          error_message?: string | null
          hubspot_deal_id?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          direction?: string
          error_message?: string | null
          hubspot_deal_id?: string | null
          id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_sync_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubspot_sync_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubspot_sync_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      insights_agenda: {
        Row: {
          company_id: string
          content_json: Json
          created_at: string
          id: string
          period_key: string
          period_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          content_json?: Json
          created_at?: string
          id?: string
          period_key: string
          period_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          content_json?: Json
          created_at?: string
          id?: string
          period_key?: string
          period_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      insights_agenda_footnote_refs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          footnote_id: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          footnote_id: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          footnote_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_agenda_footnote_refs_footnote_id_fkey"
            columns: ["footnote_id"]
            isOneToOne: false
            referencedRelation: "insights_agenda_footnotes"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_agenda_footnotes: {
        Row: {
          agenda_period_key: string
          agenda_period_type: string
          company_id: string
          created_at: string
          created_by: string
          footnote_type: string
          id: string
          link_url: string | null
          source_anchor: string | null
          source_current_text: string | null
          source_id: string | null
          source_snapshot_text: string
          source_type: string
          source_updated_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agenda_period_key: string
          agenda_period_type: string
          company_id: string
          created_at?: string
          created_by: string
          footnote_type: string
          id?: string
          link_url?: string | null
          source_anchor?: string | null
          source_current_text?: string | null
          source_id?: string | null
          source_snapshot_text?: string
          source_type: string
          source_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agenda_period_key?: string
          agenda_period_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          footnote_type?: string
          id?: string
          link_url?: string | null
          source_anchor?: string | null
          source_current_text?: string | null
          source_id?: string | null
          source_snapshot_text?: string
          source_type?: string
          source_updated_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      insights_anomaly_history: {
        Row: {
          abs_change: number | null
          company_id: string | null
          created_at: string
          dismissed_at: string | null
          first_seen_at: string
          id: string
          last_seen_at: string
          level: string
          message: string
          metric_key: string
          metric_label: string
          notes: string | null
          occurrence_count: number
          owner_user_id: string
          pct_change: number | null
          period_key: string
          period_label: string
          resolved_at: string | null
          signature: string
          snoozed_until: string | null
          updated_at: string
        }
        Insert: {
          abs_change?: number | null
          company_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          level: string
          message: string
          metric_key: string
          metric_label: string
          notes?: string | null
          occurrence_count?: number
          owner_user_id: string
          pct_change?: number | null
          period_key: string
          period_label: string
          resolved_at?: string | null
          signature: string
          snoozed_until?: string | null
          updated_at?: string
        }
        Update: {
          abs_change?: number | null
          company_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          level?: string
          message?: string
          metric_key?: string
          metric_label?: string
          notes?: string | null
          occurrence_count?: number
          owner_user_id?: string
          pct_change?: number | null
          period_key?: string
          period_label?: string
          resolved_at?: string | null
          signature?: string
          snoozed_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_anomaly_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      insights_metric_targets: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          metric_key: string
          metric_label: string
          notes: string | null
          owner_user_id: string
          period_month: string | null
          target_value: number
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          metric_key: string
          metric_label: string
          notes?: string | null
          owner_user_id: string
          period_month?: string | null
          target_value: number
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          metric_key?: string
          metric_label?: string
          notes?: string | null
          owner_user_id?: string
          period_month?: string | null
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_metric_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_report_submissions: {
        Row: {
          audit: Json
          company_id: string
          content_snapshot: Json | null
          created_at: string
          id: string
          period_key: string
          report_key: string
          status: string
          submit_count: number
          submitted_at: string | null
          submitted_by: string | null
          submitted_by_name: string | null
          unsubmitted_at: string | null
          unsubmitted_by: string | null
          unsubmitted_by_name: string | null
          updated_at: string
        }
        Insert: {
          audit?: Json
          company_id: string
          content_snapshot?: Json | null
          created_at?: string
          id?: string
          period_key: string
          report_key: string
          status?: string
          submit_count?: number
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_name?: string | null
          unsubmitted_at?: string | null
          unsubmitted_by?: string | null
          unsubmitted_by_name?: string | null
          updated_at?: string
        }
        Update: {
          audit?: Json
          company_id?: string
          content_snapshot?: Json | null
          created_at?: string
          id?: string
          period_key?: string
          report_key?: string
          status?: string
          submit_count?: number
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_name?: string | null
          unsubmitted_at?: string | null
          unsubmitted_by?: string | null
          unsubmitted_by_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_report_submissions_company_id_fkey"
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
          contact_id: string | null
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
          contact_id?: string | null
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
          contact_id?: string | null
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
            foreignKeyName: "lender_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "lender_disqualifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      lender_fit_attributes: {
        Row: {
          company_id: string | null
          created_at: string
          embedding: string | null
          exclusions: Json
          extracted_at: string
          id: string
          lender_name: string
          master_lender_id: string | null
          model_version: string | null
          negative_signals: Json
          nuanced_preferences: Json
          positive_signals: Json
          source_hash: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          embedding?: string | null
          exclusions?: Json
          extracted_at?: string
          id?: string
          lender_name: string
          master_lender_id?: string | null
          model_version?: string | null
          negative_signals?: Json
          nuanced_preferences?: Json
          positive_signals?: Json
          source_hash?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          embedding?: string | null
          exclusions?: Json
          extracted_at?: string
          id?: string
          lender_name?: string
          master_lender_id?: string | null
          model_version?: string | null
          negative_signals?: Json
          nuanced_preferences?: Json
          positive_signals?: Json
          source_hash?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_fit_attributes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_fit_attributes_master_lender_id_fkey"
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
          {
            foreignKeyName: "lender_history_warning_dismissals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      lender_match_rules: {
        Row: {
          active: boolean
          applies_when: Json | null
          created_at: string
          created_by: string
          delta: number | null
          id: string
          lender_id: string | null
          lender_name: string | null
          reason: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_when?: Json | null
          created_at?: string
          created_by: string
          delta?: number | null
          id?: string
          lender_id?: string | null
          lender_name?: string | null
          reason: string
          rule_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_when?: Json | null
          created_at?: string
          created_by?: string
          delta?: number | null
          id?: string
          lender_id?: string | null
          lender_name?: string | null
          reason?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: []
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
      lender_pass_detections: {
        Row: {
          confidence: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          deal_id: string
          deal_lender_id: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          edited_reason: string | null
          gmail_message_id: string
          id: string
          is_pass: boolean
          lender_name: string
          raw_classification: Json | null
          reason_summary: string | null
          sender_email: string | null
          sender_name: string | null
          source_quote: string | null
          status: string
          thread_id: string | null
          updated_at: string
        }
        Insert: {
          confidence: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deal_id: string
          deal_lender_id?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          edited_reason?: string | null
          gmail_message_id: string
          id?: string
          is_pass?: boolean
          lender_name: string
          raw_classification?: Json | null
          reason_summary?: string | null
          sender_email?: string | null
          sender_name?: string | null
          source_quote?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          deal_id?: string
          deal_lender_id?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          edited_reason?: string | null
          gmail_message_id?: string
          id?: string
          is_pass?: boolean
          lender_name?: string
          raw_classification?: Json | null
          reason_summary?: string | null
          sender_email?: string | null
          sender_name?: string | null
          source_quote?: string | null
          status?: string
          thread_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_pass_detections_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_pass_detections_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "lender_pass_detections_deal_lender_id_fkey"
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
      lender_qa_regression_tests: {
        Row: {
          created_at: string
          created_by: string
          criteria_override: Json | null
          deal_id: string
          description: string | null
          id: string
          must_exclude_lenders: string[]
          must_include_lenders: string[]
          name: string
          top_n: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          criteria_override?: Json | null
          deal_id: string
          description?: string | null
          id?: string
          must_exclude_lenders?: string[]
          must_include_lenders?: string[]
          name: string
          top_n?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          criteria_override?: Json | null
          deal_id?: string
          description?: string | null
          id?: string
          must_exclude_lenders?: string[]
          must_include_lenders?: string[]
          name?: string
          top_n?: number
          updated_at?: string
        }
        Relationships: []
      }
      lender_recommendation_outcomes: {
        Row: {
          deal_id: string
          decline_reason: string | null
          fit_quality: number | null
          id: string
          lender_id: string | null
          lender_name: string
          notes: string | null
          reported_at: string
          reported_by: string
          run_id: string | null
          status: Database["public"]["Enums"]["lender_recommendation_outcome_status"]
        }
        Insert: {
          deal_id: string
          decline_reason?: string | null
          fit_quality?: number | null
          id?: string
          lender_id?: string | null
          lender_name: string
          notes?: string | null
          reported_at?: string
          reported_by: string
          run_id?: string | null
          status: Database["public"]["Enums"]["lender_recommendation_outcome_status"]
        }
        Update: {
          deal_id?: string
          decline_reason?: string | null
          fit_quality?: number | null
          id?: string
          lender_id?: string | null
          lender_name?: string
          notes?: string | null
          reported_at?: string
          reported_by?: string
          run_id?: string | null
          status?: Database["public"]["Enums"]["lender_recommendation_outcome_status"]
        }
        Relationships: [
          {
            foreignKeyName: "lender_recommendation_outcomes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "lender_recommendation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_recommendation_run_items: {
        Row: {
          ai_adjustment: number | null
          boost_total: number | null
          components: Json | null
          confidence: number | null
          dominant_driver: string | null
          failed_check: string | null
          failed_reason: string | null
          hard_filtered: boolean
          id: string
          lender_id: string | null
          lender_name: string
          match_score: number | null
          penalty_total: number | null
          rank_position: number | null
          rationale: string | null
          run_id: string
          structured_score: number | null
          unstructured_score: number | null
        }
        Insert: {
          ai_adjustment?: number | null
          boost_total?: number | null
          components?: Json | null
          confidence?: number | null
          dominant_driver?: string | null
          failed_check?: string | null
          failed_reason?: string | null
          hard_filtered?: boolean
          id?: string
          lender_id?: string | null
          lender_name: string
          match_score?: number | null
          penalty_total?: number | null
          rank_position?: number | null
          rationale?: string | null
          run_id: string
          structured_score?: number | null
          unstructured_score?: number | null
        }
        Update: {
          ai_adjustment?: number | null
          boost_total?: number | null
          components?: Json | null
          confidence?: number | null
          dominant_driver?: string | null
          failed_check?: string | null
          failed_reason?: string | null
          hard_filtered?: boolean
          id?: string
          lender_id?: string | null
          lender_name?: string
          match_score?: number | null
          penalty_total?: number | null
          rank_position?: number | null
          rationale?: string | null
          run_id?: string
          structured_score?: number | null
          unstructured_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_recommendation_run_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "lender_recommendation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_recommendation_runs: {
        Row: {
          criteria_override: Json | null
          deal_id: string
          evaluated_count: number
          generated_at: string
          hard_filtered_count: number
          id: string
          meta: Json | null
          model_used: string | null
          qa_mode: boolean
          scored_count: number
          triggered_by: string | null
          weights: Json | null
        }
        Insert: {
          criteria_override?: Json | null
          deal_id: string
          evaluated_count?: number
          generated_at?: string
          hard_filtered_count?: number
          id?: string
          meta?: Json | null
          model_used?: string | null
          qa_mode?: boolean
          scored_count?: number
          triggered_by?: string | null
          weights?: Json | null
        }
        Update: {
          criteria_override?: Json | null
          deal_id?: string
          evaluated_count?: number
          generated_at?: string
          hard_filtered_count?: number
          id?: string
          meta?: Json | null
          model_used?: string | null
          qa_mode?: boolean
          scored_count?: number
          triggered_by?: string | null
          weights?: Json | null
        }
        Relationships: []
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
      lender_sync_request_decisions: {
        Row: {
          action: string
          decided_at: string
          decided_by: string | null
          existing_value: Json | null
          field_name: string
          id: string
          incoming_value: Json | null
          notes: string | null
          request_id: string
          scope: string
        }
        Insert: {
          action: string
          decided_at?: string
          decided_by?: string | null
          existing_value?: Json | null
          field_name: string
          id?: string
          incoming_value?: Json | null
          notes?: string | null
          request_id: string
          scope: string
        }
        Update: {
          action?: string
          decided_at?: string
          decided_by?: string | null
          existing_value?: Json | null
          field_name?: string
          id?: string
          incoming_value?: Json | null
          notes?: string | null
          request_id?: string
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_sync_request_decisions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "lender_sync_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_sync_requests: {
        Row: {
          assigned_reviewer_id: string | null
          changes_diff: Json | null
          confidence: string | null
          conflict_count: number
          contact_change_count: number
          created_at: string
          existing_lender_id: string | null
          existing_lender_name: string | null
          id: string
          incoming_data: Json
          match_candidates: Json
          match_reason: string | null
          processed_at: string | null
          processed_by: string | null
          processing_notes: string | null
          request_type: string
          source_lender_id: string | null
          source_system: string
          status: string
          suggested_action: string | null
          updated_at: string
        }
        Insert: {
          assigned_reviewer_id?: string | null
          changes_diff?: Json | null
          confidence?: string | null
          conflict_count?: number
          contact_change_count?: number
          created_at?: string
          existing_lender_id?: string | null
          existing_lender_name?: string | null
          id?: string
          incoming_data: Json
          match_candidates?: Json
          match_reason?: string | null
          processed_at?: string | null
          processed_by?: string | null
          processing_notes?: string | null
          request_type: string
          source_lender_id?: string | null
          source_system?: string
          status?: string
          suggested_action?: string | null
          updated_at?: string
        }
        Update: {
          assigned_reviewer_id?: string | null
          changes_diff?: Json | null
          confidence?: string | null
          conflict_count?: number
          contact_change_count?: number
          created_at?: string
          existing_lender_id?: string | null
          existing_lender_name?: string | null
          id?: string
          incoming_data?: Json
          match_candidates?: Json
          match_reason?: string | null
          processed_at?: string | null
          processed_by?: string | null
          processing_notes?: string | null
          request_type?: string
          source_lender_id?: string | null
          source_system?: string
          status?: string
          suggested_action?: string | null
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
      lender_sync_settings: {
        Row: {
          auto_approve_deterministic: boolean
          company_id: string
          created_at: string
          likely_match_threshold: number
          possible_match_threshold: number
          updated_at: string
        }
        Insert: {
          auto_approve_deterministic?: boolean
          company_id: string
          created_at?: string
          likely_match_threshold?: number
          possible_match_threshold?: number
          updated_at?: string
        }
        Update: {
          auto_approve_deterministic?: boolean
          company_id?: string
          created_at?: string
          likely_match_threshold?: number
          possible_match_threshold?: number
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "mapping_patterns_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      master_lenders: {
        Row: {
          about_notes: string | null
          active: boolean | null
          address: string | null
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
          funding_source_notes: string | null
          geo: string | null
          gift_address: string | null
          id: string
          industries: string[] | null
          industries_to_avoid: string[] | null
          last_synced_from_flex: string | null
          lender_one_pager_url: string | null
          lender_type: string | null
          linkedin_url: string | null
          loan_types: string[] | null
          max_deal: number | null
          min_deal: number | null
          min_revenue: number | null
          name: string
          nda: string | null
          onboarded_to_flex: string | null
          phone: string | null
          post_term_sheet_checklist: string | null
          referral_agreement: string | null
          referral_fee_offered: string | null
          referral_lender: string | null
          refinancing: string | null
          relationship_owners: string | null
          sponsorship: string | null
          sub_debt: string | null
          sync_source: string | null
          tags: string[]
          tier: string | null
          updated_at: string
          upfront_checklist: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          about_notes?: string | null
          active?: boolean | null
          address?: string | null
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
          funding_source_notes?: string | null
          geo?: string | null
          gift_address?: string | null
          id?: string
          industries?: string[] | null
          industries_to_avoid?: string[] | null
          last_synced_from_flex?: string | null
          lender_one_pager_url?: string | null
          lender_type?: string | null
          linkedin_url?: string | null
          loan_types?: string[] | null
          max_deal?: number | null
          min_deal?: number | null
          min_revenue?: number | null
          name: string
          nda?: string | null
          onboarded_to_flex?: string | null
          phone?: string | null
          post_term_sheet_checklist?: string | null
          referral_agreement?: string | null
          referral_fee_offered?: string | null
          referral_lender?: string | null
          refinancing?: string | null
          relationship_owners?: string | null
          sponsorship?: string | null
          sub_debt?: string | null
          sync_source?: string | null
          tags?: string[]
          tier?: string | null
          updated_at?: string
          upfront_checklist?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          about_notes?: string | null
          active?: boolean | null
          address?: string | null
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
          funding_source_notes?: string | null
          geo?: string | null
          gift_address?: string | null
          id?: string
          industries?: string[] | null
          industries_to_avoid?: string[] | null
          last_synced_from_flex?: string | null
          lender_one_pager_url?: string | null
          lender_type?: string | null
          linkedin_url?: string | null
          loan_types?: string[] | null
          max_deal?: number | null
          min_deal?: number | null
          min_revenue?: number | null
          name?: string
          nda?: string | null
          onboarded_to_flex?: string | null
          phone?: string | null
          post_term_sheet_checklist?: string | null
          referral_agreement?: string | null
          referral_fee_offered?: string | null
          referral_lender?: string | null
          refinancing?: string | null
          relationship_owners?: string | null
          sponsorship?: string | null
          sub_debt?: string | null
          sync_source?: string | null
          tags?: string[]
          tier?: string | null
          updated_at?: string
          upfront_checklist?: string | null
          user_id?: string
          website?: string | null
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
      mat_view_refresh_log: {
        Row: {
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          view_name: string
        }
        Insert: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          view_name: string
        }
        Update: {
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          view_name?: string
        }
        Relationships: []
      }
      meeting_claap_resolution: {
        Row: {
          created_at: string
          event_id: string
          id: string
          org_company_id: string
          resolution_status: Database["public"]["Enums"]["meeting_claap_resolution_status"]
          resolved_at: string
          run_id: string | null
          top_candidate_external_id: string | null
          top_candidate_recording_id: string | null
          top_candidate_score: number | null
          top_candidate_title: string | null
          top_candidate_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          org_company_id: string
          resolution_status: Database["public"]["Enums"]["meeting_claap_resolution_status"]
          resolved_at?: string
          run_id?: string | null
          top_candidate_external_id?: string | null
          top_candidate_recording_id?: string | null
          top_candidate_score?: number | null
          top_candidate_title?: string | null
          top_candidate_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          org_company_id?: string
          resolution_status?: Database["public"]["Enums"]["meeting_claap_resolution_status"]
          resolved_at?: string
          run_id?: string | null
          top_candidate_external_id?: string | null
          top_candidate_recording_id?: string | null
          top_candidate_score?: number | null
          top_candidate_title?: string | null
          top_candidate_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      meeting_deal_links: {
        Row: {
          created_at: string
          deal_id: string
          deleted_at: string | null
          id: string
          linked_at: string
          linked_by_user_id: string
          meeting_external_id: string
          org_company_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deal_id: string
          deleted_at?: string | null
          id?: string
          linked_at?: string
          linked_by_user_id: string
          meeting_external_id: string
          org_company_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deal_id?: string
          deleted_at?: string | null
          id?: string
          linked_at?: string
          linked_by_user_id?: string
          meeting_external_id?: string
          org_company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_deal_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_deal_links_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "meeting_deal_links_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_holds: {
        Row: {
          attendees: Json
          calendar_id: string | null
          created_at: string
          deal_id: string | null
          email_message_id: string | null
          expires_at: string
          google_event_id: string | null
          hold_group_id: string
          id: string
          org_company_id: string | null
          released_at: string | null
          slot_end_at: string
          slot_start_at: string
          state: Database["public"]["Enums"]["meeting_hold_state"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json
          calendar_id?: string | null
          created_at?: string
          deal_id?: string | null
          email_message_id?: string | null
          expires_at: string
          google_event_id?: string | null
          hold_group_id: string
          id?: string
          org_company_id?: string | null
          released_at?: string | null
          slot_end_at: string
          slot_start_at: string
          state?: Database["public"]["Enums"]["meeting_hold_state"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json
          calendar_id?: string | null
          created_at?: string
          deal_id?: string | null
          email_message_id?: string | null
          expires_at?: string
          google_event_id?: string | null
          hold_group_id?: string
          id?: string
          org_company_id?: string | null
          released_at?: string | null
          slot_end_at?: string
          slot_start_at?: string
          state?: Database["public"]["Enums"]["meeting_hold_state"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meeting_synthesized_notes: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          meeting_id: string
          model: string | null
          org_company_id: string
          source: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          meeting_id: string
          model?: string | null
          org_company_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          meeting_id?: string
          model?: string | null
          org_company_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      meeting_task_suggestions: {
        Row: {
          assignee_email: string | null
          created_at: string
          created_task_id: string | null
          decided_at: string | null
          decided_by: string | null
          due_date: string | null
          event_id: string | null
          external_mention: string | null
          id: string
          meeting_id: string | null
          org_company_id: string
          recording_id: string | null
          scope_key: string
          source: string
          status: string
          suggestion_id: string
          text: string
        }
        Insert: {
          assignee_email?: string | null
          created_at?: string
          created_task_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          due_date?: string | null
          event_id?: string | null
          external_mention?: string | null
          id?: string
          meeting_id?: string | null
          org_company_id: string
          recording_id?: string | null
          scope_key: string
          source?: string
          status?: string
          suggestion_id: string
          text: string
        }
        Update: {
          assignee_email?: string | null
          created_at?: string
          created_task_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          due_date?: string | null
          event_id?: string | null
          external_mention?: string | null
          id?: string
          meeting_id?: string | null
          org_company_id?: string
          recording_id?: string | null
          scope_key?: string
          source?: string
          status?: string
          suggestion_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_task_suggestions_created_task_id_fkey"
            columns: ["created_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_task_suggestions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "claap_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_task_suggestions_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "claap_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_title_templates: {
        Row: {
          created_at: string
          id: string
          org_company_id: string
          stage_id: string | null
          template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          org_company_id: string
          stage_id?: string | null
          template: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          org_company_id?: string
          stage_id?: string | null
          template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_title_templates_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_manual_inputs: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          metric_key: string
          month_key: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          metric_key: string
          month_key: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          metric_key?: string
          month_key?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: []
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
          initial_backfill_done: boolean
          last_calendar_sync_at: string | null
          last_email_sync_at: string | null
          last_email_sync_cursor: string | null
          refresh_token: string | null
          scopes: string | null
          status: string
          sync_calendar_enabled: boolean
          sync_email_enabled: boolean
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
          initial_backfill_done?: boolean
          last_calendar_sync_at?: string | null
          last_email_sync_at?: string | null
          last_email_sync_cursor?: string | null
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          sync_calendar_enabled?: boolean
          sync_email_enabled?: boolean
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
          initial_backfill_done?: boolean
          last_calendar_sync_at?: string | null
          last_email_sync_at?: string | null
          last_email_sync_cursor?: string | null
          refresh_token?: string | null
          scopes?: string | null
          status?: string
          sync_calendar_enabled?: boolean
          sync_email_enabled?: boolean
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
          {
            foreignKeyName: "model_annotations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      ms_synced_calendar_events: {
        Row: {
          attendees: Json
          body_preview: string | null
          created_at: string
          end_time: string | null
          event_id: string
          id: string
          is_all_day: boolean
          is_cancelled: boolean
          location: string | null
          organizer: Json | null
          provider: string
          raw: Json | null
          start_time: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json
          body_preview?: string | null
          created_at?: string
          end_time?: string | null
          event_id: string
          id?: string
          is_all_day?: boolean
          is_cancelled?: boolean
          location?: string | null
          organizer?: Json | null
          provider?: string
          raw?: Json | null
          start_time?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json
          body_preview?: string | null
          created_at?: string
          end_time?: string | null
          event_id?: string
          id?: string
          is_all_day?: boolean
          is_cancelled?: boolean
          location?: string | null
          organizer?: Json | null
          provider?: string
          raw?: Json | null
          start_time?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ms_synced_emails: {
        Row: {
          body_preview: string | null
          created_at: string
          from_email: string | null
          from_name: string | null
          has_attachments: boolean
          id: string
          is_read: boolean
          message_id: string
          provider: string
          raw: Json | null
          received_at: string | null
          subject: string | null
          thread_id: string | null
          to_recipients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          body_preview?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_read?: boolean
          message_id: string
          provider?: string
          raw?: Json | null
          received_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_recipients?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          body_preview?: string | null
          created_at?: string
          from_email?: string | null
          from_name?: string | null
          has_attachments?: boolean
          id?: string
          is_read?: boolean
          message_id?: string
          provider?: string
          raw?: Json | null
          received_at?: string | null
          subject?: string | null
          thread_id?: string | null
          to_recipients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      naitive_deal_stage_meta: {
        Row: {
          closed_lost_reason: string | null
          deal_id: string
          dormant_started_at: string | null
          hold_reason: string | null
          hold_tag: string | null
          revisit_date: string | null
          transition_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closed_lost_reason?: string | null
          deal_id: string
          dormant_started_at?: string | null
          hold_reason?: string | null
          hold_tag?: string | null
          revisit_date?: string | null
          transition_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closed_lost_reason?: string | null
          deal_id?: string
          dormant_started_at?: string | null
          hold_reason?: string | null
          hold_tag?: string | null
          revisit_date?: string | null
          transition_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "naitive_deal_stage_meta_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "naitive_deal_stage_meta_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      naitive_pipeline_agenda_items: {
        Row: {
          company_id: string
          completed: boolean
          created_at: string
          created_by: string | null
          id: string
          notes: string
          period_key: string
          period_type: string
          sort_index: number
          title: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          period_key: string
          period_type: string
          sort_index?: number
          title?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          period_key?: string
          period_type?: string
          sort_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      naitive_pipeline_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          context: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          context?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          context?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      naitive_pipeline_narrative_snapshots: {
        Row: {
          company_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          period_key: string
          period_type: string
        }
        Insert: {
          company_id: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_key: string
          period_type: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          period_key?: string
          period_type?: string
        }
        Relationships: []
      }
      naitive_pipeline_narratives: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          period_end: string | null
          period_key: string
          period_start: string | null
          period_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          content?: string
          created_at?: string
          id?: string
          period_end?: string | null
          period_key: string
          period_start?: string | null
          period_type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          period_end?: string | null
          period_key?: string
          period_start?: string | null
          period_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      naitive_pipeline_reports: {
        Row: {
          company_id: string
          created_at: string
          email_error: string | null
          email_sent: boolean
          filters: Json
          id: string
          period_key: string | null
          period_label: string | null
          period_type: string | null
          recipients: string[]
          snapshot: Json
          submitted_by: string
          submitter_email: string | null
          submitter_name: string | null
        }
        Insert: {
          company_id?: string
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          filters?: Json
          id?: string
          period_key?: string | null
          period_label?: string | null
          period_type?: string | null
          recipients?: string[]
          snapshot?: Json
          submitted_by: string
          submitter_email?: string | null
          submitter_name?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email_error?: string | null
          email_sent?: boolean
          filters?: Json
          id?: string
          period_key?: string | null
          period_label?: string | null
          period_type?: string | null
          recipients?: string[]
          snapshot?: Json
          submitted_by?: string
          submitter_email?: string | null
          submitter_name?: string | null
        }
        Relationships: []
      }
      naitive_proposed_slots: {
        Row: {
          conferencing_meeting_id: string | null
          conferencing_provider: string | null
          created_at: string
          deal_id: string | null
          id: string
          meeting_id: string | null
          metadata: Json
          recipient_email: string | null
          recipient_emails: string[] | null
          slot_end: string
          slot_start: string
          status: string
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conferencing_meeting_id?: string | null
          conferencing_provider?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          meeting_id?: string | null
          metadata?: Json
          recipient_email?: string | null
          recipient_emails?: string[] | null
          slot_end: string
          slot_start: string
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conferencing_meeting_id?: string | null
          conferencing_provider?: string | null
          created_at?: string
          deal_id?: string | null
          id?: string
          meeting_id?: string | null
          metadata?: Json
          recipient_email?: string | null
          recipient_emails?: string[] | null
          slot_end?: string
          slot_start?: string
          status?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      naitive_stage_milestones: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          deal_id: string
          id: string
          milestone_key: string
          stage: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deal_id: string
          id?: string
          milestone_key: string
          stage: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          deal_id?: string
          id?: string
          milestone_key?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "naitive_stage_milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "naitive_stage_milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      news_feed_cache: {
        Row: {
          cache_key: string
          fetched_at: string
          payload: Json
          updated_at: string
        }
        Insert: {
          cache_key: string
          fetched_at?: string
          payload: Json
          updated_at?: string
        }
        Update: {
          cache_key?: string
          fetched_at?: string
          payload?: Json
          updated_at?: string
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
      notification_audit: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          deal_id: string | null
          error_message: string | null
          id: string
          metadata: Json
          recipient_user_id: string | null
          status: string
          title: string | null
          trigger_key: string
        }
        Insert: {
          body?: string | null
          channel: string
          created_at?: string
          deal_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          recipient_user_id?: string | null
          status: string
          title?: string | null
          trigger_key: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          deal_id?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json
          recipient_user_id?: string | null
          status?: string
          title?: string | null
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_audit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_audit_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
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
      notification_log: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          id: string
          kind: string
          payload: Json | null
          provider_message_id: string | null
          ref_id: string
          status: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          payload?: Json | null
          provider_message_id?: string | null
          ref_id: string
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          provider_message_id?: string | null
          ref_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
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
      org_notification_defaults: {
        Row: {
          company_id: string
          created_at: string
          daily_deal_summary_enabled: boolean
          daily_deal_summary_time_et: string | null
          daily_deal_summary_weekdays_only: boolean
          id: string
          updated_at: string
          weekly_deal_summary_day_et: string | null
          weekly_deal_summary_enabled: boolean
          weekly_deal_summary_time_et: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          daily_deal_summary_enabled?: boolean
          daily_deal_summary_time_et?: string | null
          daily_deal_summary_weekdays_only?: boolean
          id?: string
          updated_at?: string
          weekly_deal_summary_day_et?: string | null
          weekly_deal_summary_enabled?: boolean
          weekly_deal_summary_time_et?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          daily_deal_summary_enabled?: boolean
          daily_deal_summary_time_et?: string | null
          daily_deal_summary_weekdays_only?: boolean
          id?: string
          updated_at?: string
          weekly_deal_summary_day_et?: string | null
          weekly_deal_summary_enabled?: boolean
          weekly_deal_summary_time_et?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_notification_defaults_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
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
      outbound_email_templates: {
        Row: {
          approval_required: boolean
          body_plain_text: string | null
          body_rich_text: string
          cadence: string | null
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          recipient: string | null
          sequence_group_id: string | null
          sequence_name: string | null
          sequence_step_key: string | null
          sequence_step_order: number | null
          sort_order: number | null
          subject_line: string
          template_number: number
          template_type: string
          title: string
          trigger_stage: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_required?: boolean
          body_plain_text?: string | null
          body_rich_text?: string
          cadence?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          recipient?: string | null
          sequence_group_id?: string | null
          sequence_name?: string | null
          sequence_step_key?: string | null
          sequence_step_order?: number | null
          sort_order?: number | null
          subject_line: string
          template_number: number
          template_type?: string
          title: string
          trigger_stage?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_required?: boolean
          body_plain_text?: string | null
          body_rich_text?: string
          cadence?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          recipient?: string | null
          sequence_group_id?: string | null
          sequence_name?: string | null
          sequence_step_key?: string | null
          sequence_step_order?: number | null
          sort_order?: number | null
          subject_line?: string
          template_number?: number
          template_type?: string
          title?: string
          trigger_stage?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_email_templates_company_id_fkey"
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
          is_archived: boolean
          lender_id: string | null
          notes: string | null
          position: number
          priority: string
          source_metadata: Json | null
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
          is_archived?: boolean
          lender_id?: string | null
          notes?: string | null
          position?: number
          priority?: string
          source_metadata?: Json | null
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
          is_archived?: boolean
          lender_id?: string | null
          notes?: string | null
          position?: number
          priority?: string
          source_metadata?: Json | null
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
            foreignKeyName: "outstanding_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      page_access_allowlist: {
        Row: {
          created_at: string
          email: string
          id: string
          page_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          page_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          page_key?: string
          updated_at?: string
        }
        Relationships: []
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
      partner_channel_types: {
        Row: {
          company_id: string
          created_at: string
          description: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      partner_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          partner_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          partner_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_companies_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          partner_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          partner_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_contacts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_memo_audit_log: {
        Row: {
          changed_at: string
          company_id: string
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
          partner_id: string
          user_id: string | null
        }
        Insert: {
          changed_at?: string
          company_id: string
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          partner_id: string
          user_id?: string | null
        }
        Update: {
          changed_at?: string
          company_id?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          partner_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_memo_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_memo_audit_log_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_memo_read_receipts: {
        Row: {
          company_id: string
          id: string
          last_seen_at: string
          last_seen_audit_id: string | null
          partner_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          last_seen_at?: string
          last_seen_audit_id?: string | null
          partner_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          last_seen_at?: string
          last_seen_audit_id?: string | null
          partner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_memo_read_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_memo_read_receipts_last_seen_audit_id_fkey"
            columns: ["last_seen_audit_id"]
            isOneToOne: false
            referencedRelation: "partner_memo_audit_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_memo_read_receipts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_memos: {
        Row: {
          benefit_from_them: string | null
          benefit_from_us: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          icp: string | null
          id: string
          memo_type: string
          notes: string | null
          partner_id: string
          updated_at: string | null
          who_are_they: string | null
        }
        Insert: {
          benefit_from_them?: string | null
          benefit_from_us?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          icp?: string | null
          id?: string
          memo_type?: string
          notes?: string | null
          partner_id: string
          updated_at?: string | null
          who_are_they?: string | null
        }
        Update: {
          benefit_from_them?: string | null
          benefit_from_us?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          icp?: string | null
          id?: string
          memo_type?: string
          notes?: string | null
          partner_id?: string
          updated_at?: string | null
          who_are_they?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_memos_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_memos_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_pipeline_rules: {
        Row: {
          company_id: string
          rules: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          rules?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          rules?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      partner_pipeline_rules_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          company_id: string
          id: string
          new_rules: Json | null
          prev_rules: Json | null
          summary: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          company_id: string
          id?: string
          new_rules?: Json | null
          prev_rules?: Json | null
          summary?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          company_id?: string
          id?: string
          new_rules?: Json | null
          prev_rules?: Json | null
          summary?: string | null
        }
        Relationships: []
      }
      partner_pipeline_stages: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          definition: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          definition?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          definition?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_pipeline_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_stage_notes: {
        Row: {
          company_id: string
          created_at: string
          from_stage: string | null
          id: string
          note: string
          partner_id: string
          to_stage: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          from_stage?: string | null
          id?: string
          note: string
          partner_id: string
          to_stage?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          from_stage?: string | null
          id?: string
          note?: string
          partner_id?: string
          to_stage?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_stage_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_stage_notes_from_stage_fkey"
            columns: ["from_stage"]
            isOneToOne: false
            referencedRelation: "partner_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_stage_notes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_stage_notes_to_stage_fkey"
            columns: ["to_stage"]
            isOneToOne: false
            referencedRelation: "partner_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          company_id: string
          created_at: string | null
          firm_type: string | null
          id: string
          metadata: Json | null
          name: string
          notes: string | null
          owner_id: string | null
          sort_order_in_stage: number | null
          stage_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          firm_type?: string | null
          id?: string
          metadata?: Json | null
          name: string
          notes?: string | null
          owner_id?: string | null
          sort_order_in_stage?: number | null
          stage_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          firm_type?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          sort_order_in_stage?: number | null
          stage_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partners_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "partner_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_deal_notifications: {
        Row: {
          change_summary: Json | null
          changed_by: string | null
          changed_by_name: string | null
          company_id: string
          created_at: string
          deal_id: string
          entity_id: string | null
          entity_name: string | null
          event_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          change_summary?: Json | null
          changed_by?: string | null
          changed_by_name?: string | null
          company_id: string
          created_at?: string
          deal_id: string
          entity_id?: string | null
          entity_name?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          change_summary?: Json | null
          changed_by?: string | null
          changed_by_name?: string | null
          company_id?: string
          created_at?: string
          deal_id?: string
          entity_id?: string | null
          entity_name?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_deal_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_deal_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_deal_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      pending_deal_suggestions: {
        Row: {
          company_id: string
          confirmed_at: string | null
          confirmed_note_id: string | null
          created_at: string
          deal_id: string
          dedup_key: string | null
          id: string
          payload: Json
          source_thread_id: string | null
          source_thread_subject: string | null
          status: string
          suggestion_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          confirmed_at?: string | null
          confirmed_note_id?: string | null
          created_at?: string
          deal_id: string
          dedup_key?: string | null
          id?: string
          payload?: Json
          source_thread_id?: string | null
          source_thread_subject?: string | null
          status?: string
          suggestion_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          confirmed_at?: string | null
          confirmed_note_id?: string | null
          created_at?: string
          deal_id?: string
          dedup_key?: string | null
          id?: string
          payload?: Json
          source_thread_id?: string | null
          source_thread_subject?: string | null
          status?: string
          suggestion_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_deal_suggestions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_deal_suggestions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      pending_lender_notifications: {
        Row: {
          change_summary: Json
          changed_by: string | null
          changed_by_name: string | null
          company_id: string
          created_at: string
          deal_id: string
          id: string
          lender_id: string | null
          lender_name: string
        }
        Insert: {
          change_summary?: Json
          changed_by?: string | null
          changed_by_name?: string | null
          company_id: string
          created_at?: string
          deal_id: string
          id?: string
          lender_id?: string | null
          lender_name: string
        }
        Update: {
          change_summary?: Json
          changed_by?: string | null
          changed_by_name?: string | null
          company_id?: string
          created_at?: string
          deal_id?: string
          id?: string
          lender_id?: string | null
          lender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_lender_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_lender_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_lender_notifications_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "pending_lender_notifications_lender_id_fkey"
            columns: ["lender_id"]
            isOneToOne: false
            referencedRelation: "deal_lenders"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_mention_emails: {
        Row: {
          attempts: number
          comment_id: string
          created_at: string
          id: string
          last_error: string | null
          recipient_user_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          comment_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          recipient_user_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          comment_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_mention_emails_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "agenda_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_audit_applies: {
        Row: {
          applied_at: string
          applied_by: string | null
          changes: Json
          id: string
          reversed_at: string | null
          reversed_by: string | null
          rows_affected: number
          run_id: string
          summary: Json
        }
        Insert: {
          applied_at?: string
          applied_by?: string | null
          changes?: Json
          id?: string
          reversed_at?: string | null
          reversed_by?: string | null
          rows_affected?: number
          run_id: string
          summary?: Json
        }
        Update: {
          applied_at?: string
          applied_by?: string | null
          changes?: Json
          id?: string
          reversed_at?: string | null
          reversed_by?: string | null
          rows_affected?: number
          run_id?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "performance_audit_applies_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "performance_audit_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_audit_runs: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          created_by: string | null
          id: string
          rep_user_id: string
          snapshot: Json
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rep_user_id: string
          snapshot: Json
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rep_user_id?: string
          snapshot?: Json
        }
        Relationships: []
      }
      pilot_kpi_events: {
        Row: {
          company_id: string
          created_at: string
          deal_id: string | null
          event_type: Database["public"]["Enums"]["pilot_kpi_event_type"]
          id: string
          metadata: Json
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          deal_id?: string | null
          event_type: Database["public"]["Enums"]["pilot_kpi_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          deal_id?: string | null
          event_type?: Database["public"]["Enums"]["pilot_kpi_event_type"]
          id?: string
          metadata?: Json
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pilot_kpi_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_kpi_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_kpi_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_requested_at: string | null
          approved_at: string | null
          approved_by: string | null
          asana_user_gid: string | null
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
          email_signature: string | null
          email_task_assigned: boolean | null
          first_name: string | null
          full_name: string | null
          id: string
          in_app_notifications: boolean
          is_active: boolean
          is_demo_user: boolean
          last_daily_rundown_notice_at: string | null
          last_eod_rundown_email_sent_at: string | null
          last_eod_rundown_notice_at: string | null
          last_name: string | null
          lender_updates_app: boolean
          lender_updates_email: boolean
          morning_digest_enabled: boolean
          morning_digest_time: string
          notifications_consent_shown: boolean
          notifications_opted_in: boolean
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
          onboarding_skipped: boolean
          phone: string | null
          stale_deal_threshold_days: number
          stale_lender_threshold_days: number
          suspended_at: string | null
          suspended_reason: string | null
          timezone: string
          tour_completed_at: string | null
          updated_at: string
          user_id: string
          weekly_summary_email: boolean
        }
        Insert: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asana_user_gid?: string | null
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
          email_signature?: string | null
          email_task_assigned?: boolean | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          in_app_notifications?: boolean
          is_active?: boolean
          is_demo_user?: boolean
          last_daily_rundown_notice_at?: string | null
          last_eod_rundown_email_sent_at?: string | null
          last_eod_rundown_notice_at?: string | null
          last_name?: string | null
          lender_updates_app?: boolean
          lender_updates_email?: boolean
          morning_digest_enabled?: boolean
          morning_digest_time?: string
          notifications_consent_shown?: boolean
          notifications_opted_in?: boolean
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
          onboarding_skipped?: boolean
          phone?: string | null
          stale_deal_threshold_days?: number
          stale_lender_threshold_days?: number
          suspended_at?: string | null
          suspended_reason?: string | null
          timezone?: string
          tour_completed_at?: string | null
          updated_at?: string
          user_id: string
          weekly_summary_email?: boolean
        }
        Update: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          asana_user_gid?: string | null
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
          email_signature?: string | null
          email_task_assigned?: boolean | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          in_app_notifications?: boolean
          is_active?: boolean
          is_demo_user?: boolean
          last_daily_rundown_notice_at?: string | null
          last_eod_rundown_email_sent_at?: string | null
          last_eod_rundown_notice_at?: string | null
          last_name?: string | null
          lender_updates_app?: boolean
          lender_updates_email?: boolean
          morning_digest_enabled?: boolean
          morning_digest_time?: string
          notifications_consent_shown?: boolean
          notifications_opted_in?: boolean
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
          onboarding_skipped?: boolean
          phone?: string | null
          stale_deal_threshold_days?: number
          stale_lender_threshold_days?: number
          suspended_at?: string | null
          suspended_reason?: string | null
          timezone?: string
          tour_completed_at?: string | null
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
      proposed_meeting_slots: {
        Row: {
          accepted_at: string | null
          accepted_by_email: string | null
          created_at: string
          deal_id: string | null
          duration_minutes: number | null
          expires_at: string
          google_event_id: string | null
          id: string
          recipient_email: string | null
          recipient_name: string | null
          slot_end: string
          slot_start: string
          status: Database["public"]["Enums"]["proposed_slot_status"]
          subject: string | null
          thread_id: string | null
          timezone: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_email?: string | null
          created_at?: string
          deal_id?: string | null
          duration_minutes?: number | null
          expires_at?: string
          google_event_id?: string | null
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          slot_end: string
          slot_start: string
          status?: Database["public"]["Enums"]["proposed_slot_status"]
          subject?: string | null
          thread_id?: string | null
          timezone?: string | null
          token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_email?: string | null
          created_at?: string
          deal_id?: string | null
          duration_minutes?: number | null
          expires_at?: string
          google_event_id?: string | null
          id?: string
          recipient_email?: string | null
          recipient_name?: string | null
          slot_end?: string
          slot_start?: string
          status?: Database["public"]["Enums"]["proposed_slot_status"]
          subject?: string | null
          thread_id?: string | null
          timezone?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qb_cashflow_mapping_rules: {
        Row: {
          categorized: boolean
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          match_field: string
          match_type: string
          notes: string | null
          pattern: string
          priority: number
          target_row: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          categorized?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          match_type?: string
          notes?: string | null
          pattern: string
          priority?: number
          target_row?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          categorized?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          match_field?: string
          match_type?: string
          notes?: string | null
          pattern?: string
          priority?: number
          target_row?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      qbo_cashflow_snapshots: {
        Row: {
          accounting_method: string
          bucket_end: string
          bucket_label: string
          bucket_start: string
          company_id: string
          created_at: string
          fetched_at: string
          id: string
          intercompany_adjustment: number
          net_cash_flow: number
          operating_activities: number | null
          period_end: string
          period_start: string
          raw_response: Json
          realm_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accounting_method?: string
          bucket_end: string
          bucket_label: string
          bucket_start: string
          company_id: string
          created_at?: string
          fetched_at?: string
          id?: string
          intercompany_adjustment?: number
          net_cash_flow?: number
          operating_activities?: number | null
          period_end: string
          period_start: string
          raw_response: Json
          realm_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accounting_method?: string
          bucket_end?: string
          bucket_label?: string
          bucket_start?: string
          company_id?: string
          created_at?: string
          fetched_at?: string
          id?: string
          intercompany_adjustment?: number
          net_cash_flow?: number
          operating_activities?: number | null
          period_end?: string
          period_start?: string
          raw_response?: Json
          realm_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qbo_pnl_snapshots: {
        Row: {
          accounting_method: string
          cogs_total: number
          company_id: string
          created_at: string
          fetched_at: string
          gross_profit: number
          id: string
          income_total: number
          net_operating_income: number | null
          operating_expenses: number
          period_end: string
          period_start: string
          raw_response: Json
          realm_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accounting_method?: string
          cogs_total?: number
          company_id: string
          created_at?: string
          fetched_at?: string
          gross_profit?: number
          id?: string
          income_total?: number
          net_operating_income?: number | null
          operating_expenses?: number
          period_end: string
          period_start: string
          raw_response: Json
          realm_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accounting_method?: string
          cogs_total?: number
          company_id?: string
          created_at?: string
          fetched_at?: string
          gross_profit?: number
          id?: string
          income_total?: number
          net_operating_income?: number | null
          operating_expenses?: number
          period_end?: string
          period_start?: string
          raw_response?: Json
          realm_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qir_comment_threads: {
        Row: {
          company_id: string
          created_at: string
          id: string
          report_key: string
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          report_key: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          report_key?: string
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      qir_comments: {
        Row: {
          author_name: string | null
          author_user_id: string
          body: string
          comment_type: string
          company_id: string
          created_at: string
          id: string
          mentioned_user_ids: string[]
          period_key: string | null
          period_type: string | null
          report_key: string
          section_label: string | null
          snippet_text: string | null
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          author_user_id: string
          body: string
          comment_type?: string
          company_id: string
          created_at?: string
          id?: string
          mentioned_user_ids?: string[]
          period_key?: string | null
          period_type?: string | null
          report_key: string
          section_label?: string | null
          snippet_text?: string | null
          target_id: string
          target_type: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          author_user_id?: string
          body?: string
          comment_type?: string
          company_id?: string
          created_at?: string
          id?: string
          mentioned_user_ids?: string[]
          period_key?: string | null
          period_type?: string | null
          report_key?: string
          section_label?: string | null
          snippet_text?: string | null
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      qir_report_versions: {
        Row: {
          company_id: string
          content: Json
          created_at: string
          id: string
          period_key: string
          report_key: string
          saved_by: string | null
          saved_by_name: string | null
          source: string
        }
        Insert: {
          company_id: string
          content: Json
          created_at?: string
          id?: string
          period_key: string
          report_key: string
          saved_by?: string | null
          saved_by_name?: string | null
          source?: string
        }
        Update: {
          company_id?: string
          content?: Json
          created_at?: string
          id?: string
          period_key?: string
          report_key?: string
          saved_by?: string | null
          saved_by_name?: string | null
          source?: string
        }
        Relationships: []
      }
      qir_section_notes: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          report_key: string
          section_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          company_id: string
          created_at?: string
          id?: string
          report_key: string
          section_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          report_key?: string
          section_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      qir_thread_events: {
        Row: {
          action: string
          actor_name: string | null
          actor_user_id: string
          company_id: string
          created_at: string
          id: string
          report_key: string
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_user_id: string
          company_id: string
          created_at?: string
          id?: string
          report_key: string
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_user_id?: string
          company_id?: string
          created_at?: string
          id?: string
          report_key?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
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
      recognition_log: {
        Row: {
          candidates: Json
          chosen_deal_id: string | null
          confidence: number | null
          created_at: string
          id: string
          inputs_hash: string | null
          message_id: string | null
          org_company_id: string | null
          outcome: string
          signals: Json
          thread_id: string | null
          user_id: string | null
        }
        Insert: {
          candidates?: Json
          chosen_deal_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          inputs_hash?: string | null
          message_id?: string | null
          org_company_id?: string | null
          outcome?: string
          signals?: Json
          thread_id?: string | null
          user_id?: string | null
        }
        Update: {
          candidates?: Json
          chosen_deal_id?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          inputs_hash?: string | null
          message_id?: string | null
          org_company_id?: string | null
          outcome?: string
          signals?: Json
          thread_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recognition_log_chosen_deal_id_fkey"
            columns: ["chosen_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_log_chosen_deal_id_fkey"
            columns: ["chosen_deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "recognition_log_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recognition_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          deal_id: string
          domain: string | null
          from_address: string | null
          id: string
          org_company_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_id: string
          domain?: string | null
          from_address?: string | null
          id?: string
          org_company_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_id?: string
          domain?: string | null
          from_address?: string | null
          id?: string
          org_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recognition_overrides_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_overrides_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "recognition_overrides_org_company_id_fkey"
            columns: ["org_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_report_runs: {
        Row: {
          ai_summary: Json | null
          created_at: string
          data_snapshot: Json | null
          error_message: string | null
          id: string
          period_end: string | null
          period_start: string | null
          recipient: string
          rendered_html: string | null
          rendered_text: string | null
          report_key: string
          status: string
          subject: string | null
          triggered_by: string
          triggered_by_user: string | null
        }
        Insert: {
          ai_summary?: Json | null
          created_at?: string
          data_snapshot?: Json | null
          error_message?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          recipient: string
          rendered_html?: string | null
          rendered_text?: string | null
          report_key: string
          status: string
          subject?: string | null
          triggered_by?: string
          triggered_by_user?: string | null
        }
        Update: {
          ai_summary?: Json | null
          created_at?: string
          data_snapshot?: Json | null
          error_message?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          recipient?: string
          rendered_html?: string | null
          rendered_text?: string | null
          report_key?: string
          status?: string
          subject?: string | null
          triggered_by?: string
          triggered_by_user?: string | null
        }
        Relationships: []
      }
      recurring_reports: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          frequency: string
          id: string
          last_error: string | null
          last_preview_html: string | null
          last_preview_text: string | null
          last_run_at: string | null
          last_status: string | null
          last_subject: string | null
          name: string
          next_run_at: string | null
          recipient: string
          report_key: string
          schedule_overrides: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          frequency: string
          id?: string
          last_error?: string | null
          last_preview_html?: string | null
          last_preview_text?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_subject?: string | null
          name: string
          next_run_at?: string | null
          recipient: string
          report_key: string
          schedule_overrides?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          frequency?: string
          id?: string
          last_error?: string | null
          last_preview_html?: string | null
          last_preview_text?: string | null
          last_run_at?: string | null
          last_status?: string | null
          last_subject?: string | null
          name?: string
          next_run_at?: string | null
          recipient?: string
          report_key?: string
          schedule_overrides?: Json
          updated_at?: string
        }
        Relationships: []
      }
      referral_sources: {
        Row: {
          channel: string | null
          company: string | null
          company_id: string | null
          contact_email: string | null
          contact_id: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          number_of_referrals: number
          phone: string | null
          promoted_to_partner_id: string | null
          relationship_owner_id: string | null
          source_type: string | null
          tier: string | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel?: string | null
          company?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          number_of_referrals?: number
          phone?: string | null
          promoted_to_partner_id?: string | null
          relationship_owner_id?: string | null
          source_type?: string | null
          tier?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel?: string | null
          company?: string | null
          company_id?: string | null
          contact_email?: string | null
          contact_id?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          number_of_referrals?: number
          phone?: string | null
          promoted_to_partner_id?: string | null
          relationship_owner_id?: string | null
          source_type?: string | null
          tier?: string | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_sources_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      report_agenda_queue: {
        Row: {
          agenda_insertion_mode: string | null
          comment_id: string | null
          comment_source: string
          comment_text_snapshot: string
          company_id: string
          created_at: string
          created_by: string
          created_by_name: string | null
          id: string
          linked_footnote_id: string | null
          linked_ref_id: string | null
          period_key: string
          period_type: string
          queue_status: string
          report_tab: string | null
          source_anchor: string | null
          source_id: string | null
          source_label: string | null
          source_snapshot_text: string | null
          source_type: string
          updated_at: string
        }
        Insert: {
          agenda_insertion_mode?: string | null
          comment_id?: string | null
          comment_source: string
          comment_text_snapshot: string
          company_id: string
          created_at?: string
          created_by: string
          created_by_name?: string | null
          id?: string
          linked_footnote_id?: string | null
          linked_ref_id?: string | null
          period_key: string
          period_type: string
          queue_status?: string
          report_tab?: string | null
          source_anchor?: string | null
          source_id?: string | null
          source_label?: string | null
          source_snapshot_text?: string | null
          source_type: string
          updated_at?: string
        }
        Update: {
          agenda_insertion_mode?: string | null
          comment_id?: string | null
          comment_source?: string
          comment_text_snapshot?: string
          company_id?: string
          created_at?: string
          created_by?: string
          created_by_name?: string | null
          id?: string
          linked_footnote_id?: string | null
          linked_ref_id?: string | null
          period_key?: string
          period_type?: string
          queue_status?: string
          report_tab?: string | null
          source_anchor?: string | null
          source_id?: string | null
          source_label?: string | null
          source_snapshot_text?: string | null
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_agenda_queue_linked_footnote_id_fkey"
            columns: ["linked_footnote_id"]
            isOneToOne: false
            referencedRelation: "insights_agenda_footnotes"
            referencedColumns: ["id"]
          },
        ]
      }
      report_ai_summaries: {
        Row: {
          alerts: Json
          company_id: string | null
          created_at: string
          deltas: Json
          id: string
          locked_at: string | null
          model: string | null
          narrative: string
          owner_user_id: string
          period_key: string
          period_label: string
          report_id: string | null
          updated_at: string
        }
        Insert: {
          alerts?: Json
          company_id?: string | null
          created_at?: string
          deltas?: Json
          id?: string
          locked_at?: string | null
          model?: string | null
          narrative: string
          owner_user_id: string
          period_key: string
          period_label: string
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          alerts?: Json
          company_id?: string | null
          created_at?: string
          deltas?: Json
          id?: string
          locked_at?: string | null
          model?: string | null
          narrative?: string
          owner_user_id?: string
          period_key?: string
          period_label?: string
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_ai_summaries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_ai_summaries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "report_definitions"
            referencedColumns: ["id"]
          },
        ]
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
          completed_at: string | null
          created_at: string
          delivery_response: Json | null
          delivery_status: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          report_data: Json | null
          scheduled_report_id: string
          started_at: string | null
          status: string
          summary_text: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          delivery_response?: Json | null
          delivery_status?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          report_data?: Json | null
          scheduled_report_id: string
          started_at?: string | null
          status?: string
          summary_text?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          delivery_response?: Json | null
          delivery_status?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          report_data?: Json | null
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
      sales_bd_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          entity: string
          field: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity?: string
          field?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      sales_bd_rules: {
        Row: {
          active_referral_to_proposal: number
          active_referral_trailing_months: number
          active_referred_revenue: number
          active_revenue_trailing_months: number
          active_signed_client: number
          active_signed_trailing_months: number
          id: string
          public_partnership_required: boolean
          qualified_deal_stages: string[]
          tier1_qualified_deals: number
          tier1_signed_clients: number
          tier1_trailing_months: number
          tier2_deals_on_board: number
          tier2_qualified_deals_max: number
          tier2_qualified_deals_min: number
          tier2_trailing_months: number
          tier3_deals_per_quarter: number
          tier4_months_before_removal: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_referral_to_proposal?: number
          active_referral_trailing_months?: number
          active_referred_revenue?: number
          active_revenue_trailing_months?: number
          active_signed_client?: number
          active_signed_trailing_months?: number
          id?: string
          public_partnership_required?: boolean
          qualified_deal_stages?: string[]
          tier1_qualified_deals?: number
          tier1_signed_clients?: number
          tier1_trailing_months?: number
          tier2_deals_on_board?: number
          tier2_qualified_deals_max?: number
          tier2_qualified_deals_min?: number
          tier2_trailing_months?: number
          tier3_deals_per_quarter?: number
          tier4_months_before_removal?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_referral_to_proposal?: number
          active_referral_trailing_months?: number
          active_referred_revenue?: number
          active_revenue_trailing_months?: number
          active_signed_client?: number
          active_signed_trailing_months?: number
          id?: string
          public_partnership_required?: boolean
          qualified_deal_stages?: string[]
          tier1_qualified_deals?: number
          tier1_signed_clients?: number
          tier1_trailing_months?: number
          tier2_deals_on_board?: number
          tier2_qualified_deals_max?: number
          tier2_qualified_deals_min?: number
          tier2_trailing_months?: number
          tier3_deals_per_quarter?: number
          tier4_months_before_removal?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sales_calls_cache: {
        Row: {
          company_id: string
          payload: Json
          refreshed_at: string
          year: number
        }
        Insert: {
          company_id: string
          payload: Json
          refreshed_at?: string
          year: number
        }
        Update: {
          company_id?: string
          payload?: Json
          refreshed_at?: string
          year?: number
        }
        Relationships: []
      }
      scheduled_actions: {
        Row: {
          action_config: Json
          action_id: string
          action_type: string
          created_at: string
          drift_seconds: number | null
          error_message: string | null
          error_stack: string | null
          executed_at: string | null
          fired_at: string | null
          id: string
          result: Json | null
          scheduled_for: string
          status: string
          step_log: Json
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
          drift_seconds?: number | null
          error_message?: string | null
          error_stack?: string | null
          executed_at?: string | null
          fired_at?: string | null
          id?: string
          result?: Json | null
          scheduled_for: string
          status?: string
          step_log?: Json
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
          drift_seconds?: number | null
          error_message?: string | null
          error_stack?: string | null
          executed_at?: string | null
          fired_at?: string | null
          id?: string
          result?: Json | null
          scheduled_for?: string
          status?: string
          step_log?: Json
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
            referencedRelation: "workflow_run_latest"
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
      scheduled_cash_flows: {
        Row: {
          account: string
          amount: number
          category: string
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          flow_type: string
          frequency_config: Json
          frequency_type: string
          id: string
          notes: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          account: string
          amount: number
          category: string
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          flow_type: string
          frequency_config?: Json
          frequency_type: string
          id?: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          account?: string
          amount?: number
          category?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          flow_type?: string
          frequency_config?: Json
          frequency_type?: string
          id?: string
          notes?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_cash_flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_emails: {
        Row: {
          attempts: number
          bcc_recipients: Json
          body_html: string
          body_text: string | null
          cc_recipients: Json
          created_at: string
          id: string
          last_error: string | null
          metadata: Json
          nylas_message_id: string | null
          reply_to_message_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string
          thread_id: string | null
          to_recipients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          bcc_recipients?: Json
          body_html?: string
          body_text?: string | null
          cc_recipients?: Json
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          nylas_message_id?: string | null
          reply_to_message_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          subject?: string
          thread_id?: string | null
          to_recipients?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          bcc_recipients?: Json
          body_html?: string
          body_text?: string | null
          cc_recipients?: Json
          created_at?: string
          id?: string
          last_error?: string | null
          metadata?: Json
          nylas_message_id?: string | null
          reply_to_message_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string
          thread_id?: string | null
          to_recipients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_followup_actions: {
        Row: {
          context: Json
          created_at: string
          deal_id: string
          error_message: string | null
          fired_at: string | null
          id: string
          scheduled_for: string
          status: string
          trigger_key: string
        }
        Insert: {
          context?: Json
          created_at?: string
          deal_id: string
          error_message?: string | null
          fired_at?: string | null
          id?: string
          scheduled_for: string
          status?: string
          trigger_key: string
        }
        Update: {
          context?: Json
          created_at?: string
          deal_id?: string
          error_message?: string | null
          fired_at?: string | null
          id?: string
          scheduled_for?: string
          status?: string
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_followup_actions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_followup_actions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      settings_audit_log: {
        Row: {
          action: Database["public"]["Enums"]["settings_audit_action"]
          actor_user_id: string
          applied_at: string | null
          company_id: string
          confidence: number | null
          created_at: string
          diff_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          source_prompt: string | null
          target_column: string | null
          target_table: string | null
          tool_key: string
          undo_token: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["settings_audit_action"]
          actor_user_id: string
          applied_at?: string | null
          company_id: string
          confidence?: number | null
          created_at?: string
          diff_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          source_prompt?: string | null
          target_column?: string | null
          target_table?: string | null
          tool_key: string
          undo_token?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["settings_audit_action"]
          actor_user_id?: string
          applied_at?: string | null
          company_id?: string
          confidence?: number | null
          created_at?: string
          diff_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          source_prompt?: string | null
          target_column?: string | null
          target_table?: string | null
          tool_key?: string
          undo_token?: string | null
        }
        Relationships: []
      }
      shared_pipeline_reports: {
        Row: {
          body_html: string
          body_text: string | null
          cc: string[]
          created_at: string
          id: string
          pipeline_name: string | null
          recipients: string[]
          sender_email: string | null
          sender_name: string | null
          sent_by: string
          subject: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          cc?: string[]
          created_at?: string
          id?: string
          pipeline_name?: string | null
          recipients?: string[]
          sender_email?: string | null
          sender_name?: string | null
          sent_by: string
          subject: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          cc?: string[]
          created_at?: string
          id?: string
          pipeline_name?: string | null
          recipients?: string[]
          sender_email?: string | null
          sender_name?: string | null
          sent_by?: string
          subject?: string
        }
        Relationships: []
      }
      sheet_cell_config: {
        Row: {
          cell_type: string
          col_key: string
          company_id: string
          created_at: string
          formula_string: string | null
          id: string
          metadata: Json | null
          qbo_account: string | null
          qbo_aggregation: string | null
          qbo_entity: string | null
          qbo_metric_id: string | null
          qbo_time_window: Json | null
          row_key: string
          sheet_id: string
          updated_at: string
        }
        Insert: {
          cell_type: string
          col_key: string
          company_id: string
          created_at?: string
          formula_string?: string | null
          id?: string
          metadata?: Json | null
          qbo_account?: string | null
          qbo_aggregation?: string | null
          qbo_entity?: string | null
          qbo_metric_id?: string | null
          qbo_time_window?: Json | null
          row_key: string
          sheet_id: string
          updated_at?: string
        }
        Update: {
          cell_type?: string
          col_key?: string
          company_id?: string
          created_at?: string
          formula_string?: string | null
          id?: string
          metadata?: Json | null
          qbo_account?: string | null
          qbo_aggregation?: string | null
          qbo_entity?: string | null
          qbo_metric_id?: string | null
          qbo_time_window?: Json | null
          row_key?: string
          sheet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sheet_cell_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      staged_email_drafts: {
        Row: {
          attachments: Json | null
          bcc_recipients: Json
          body_html: string | null
          body_text: string | null
          cancelled_at: string | null
          cc_recipients: Json
          created_at: string
          deal_id: string | null
          id: string
          sent_at: string | null
          source_action_id: string | null
          staged_at: string
          status: string
          subject: string | null
          thread_id: string | null
          to_recipients: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          bcc_recipients?: Json
          body_html?: string | null
          body_text?: string | null
          cancelled_at?: string | null
          cc_recipients?: Json
          created_at?: string
          deal_id?: string | null
          id?: string
          sent_at?: string | null
          source_action_id?: string | null
          staged_at?: string
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_recipients?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          bcc_recipients?: Json
          body_html?: string | null
          body_text?: string | null
          cancelled_at?: string | null
          cc_recipients?: Json
          created_at?: string
          deal_id?: string | null
          id?: string
          sent_at?: string | null
          source_action_id?: string | null
          staged_at?: string
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_recipients?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staged_email_drafts_source_action_id_fkey"
            columns: ["source_action_id"]
            isOneToOne: false
            referencedRelation: "ai_action_queue"
            referencedColumns: ["id"]
          },
        ]
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
          mentions: string[]
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
          mentions?: string[]
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
          mentions?: string[]
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
      task_duplicate_candidates: {
        Row: {
          candidate_task_id: string
          canonical_task_id: string | null
          company_id: string
          compared_task_ids: string[]
          confidence: number
          created_at: string
          id: string
          reasons: Json
          result: string
          review_action: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_flags: Json
          status: string
          suggested_action: string | null
          trigger_source: string
          updated_at: string
          user_explanation: string | null
        }
        Insert: {
          candidate_task_id: string
          canonical_task_id?: string | null
          company_id: string
          compared_task_ids?: string[]
          confidence?: number
          created_at?: string
          id?: string
          reasons?: Json
          result: string
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: Json
          status?: string
          suggested_action?: string | null
          trigger_source?: string
          updated_at?: string
          user_explanation?: string | null
        }
        Update: {
          candidate_task_id?: string
          canonical_task_id?: string | null
          company_id?: string
          compared_task_ids?: string[]
          confidence?: number
          created_at?: string
          id?: string
          reasons?: Json
          result?: string
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_flags?: Json
          status?: string
          suggested_action?: string | null
          trigger_source?: string
          updated_at?: string
          user_explanation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_duplicate_candidates_candidate_task_id_fkey"
            columns: ["candidate_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_duplicate_candidates_canonical_task_id_fkey"
            columns: ["canonical_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_duplicate_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          pinned_at: string | null
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
          pinned_at?: string | null
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
          pinned_at?: string | null
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
      task_view_tabs: {
        Row: {
          company_id: string | null
          created_at: string
          filter_config: Json
          icon: string | null
          id: string
          is_default: boolean
          name: string
          sort_order: number
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          filter_config?: Json
          icon?: string | null
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          filter_config?: Json
          icon?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_view_tabs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          asana_sync_attempts: number
          asana_sync_error: string | null
          asana_sync_status: string | null
          asana_synced_at: string | null
          asana_task_gid: string | null
          assigned_by: string
          assigned_to: string
          blocker_note: string | null
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          crm_company_id: string | null
          deal_id: string | null
          description: string | null
          due_at: string | null
          due_date: string | null
          id: string
          is_recurring: boolean
          is_starred: boolean
          lender_id: string | null
          nylas_event_id: string | null
          parent_task_id: string | null
          position: number
          priority: string | null
          project_id: string | null
          recurrence_end_date: string | null
          recurrence_parent_id: string | null
          recurrence_rule: string | null
          recurrence_source_id: string | null
          section_id: string | null
          source_calendar_event_id: string | null
          source_calendar_event_title: string | null
          source_email_from: string | null
          source_email_message_id: string | null
          source_email_received_at: string | null
          source_email_subject: string | null
          source_email_thread_id: string | null
          start_date: string | null
          status: string
          sync_source: string | null
          tags: string[]
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          asana_sync_attempts?: number
          asana_sync_error?: string | null
          asana_sync_status?: string | null
          asana_synced_at?: string | null
          asana_task_gid?: string | null
          assigned_by: string
          assigned_to: string
          blocker_note?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          is_starred?: boolean
          lender_id?: string | null
          nylas_event_id?: string | null
          parent_task_id?: string | null
          position?: number
          priority?: string | null
          project_id?: string | null
          recurrence_end_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          section_id?: string | null
          source_calendar_event_id?: string | null
          source_calendar_event_title?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_received_at?: string | null
          source_email_subject?: string | null
          source_email_thread_id?: string | null
          start_date?: string | null
          status?: string
          sync_source?: string | null
          tags?: string[]
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          asana_sync_attempts?: number
          asana_sync_error?: string | null
          asana_sync_status?: string | null
          asana_synced_at?: string | null
          asana_task_gid?: string | null
          assigned_by?: string
          assigned_to?: string
          blocker_note?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          crm_company_id?: string | null
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          due_date?: string | null
          id?: string
          is_recurring?: boolean
          is_starred?: boolean
          lender_id?: string | null
          nylas_event_id?: string | null
          parent_task_id?: string | null
          position?: number
          priority?: string | null
          project_id?: string | null
          recurrence_end_date?: string | null
          recurrence_parent_id?: string | null
          recurrence_rule?: string | null
          recurrence_source_id?: string | null
          section_id?: string | null
          source_calendar_event_id?: string | null
          source_calendar_event_title?: string | null
          source_email_from?: string | null
          source_email_message_id?: string | null
          source_email_received_at?: string | null
          source_email_subject?: string | null
          source_email_thread_id?: string | null
          start_date?: string | null
          status?: string
          sync_source?: string | null
          tags?: string[]
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
            foreignKeyName: "tasks_crm_company_id_fkey"
            columns: ["crm_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
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
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "upload_jobs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      uploaded_item_checklist_mapping: {
        Row: {
          checklist_item_id: string
          created_at: string
          created_by: string | null
          id: string
          uploaded_item_id: string
        }
        Insert: {
          checklist_item_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          uploaded_item_id: string
        }
        Update: {
          checklist_item_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          uploaded_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_item_checklist_mapping_uploaded_item_id_fkey"
            columns: ["uploaded_item_id"]
            isOneToOne: false
            referencedRelation: "uploaded_items"
            referencedColumns: ["id"]
          },
        ]
      }
      uploaded_items: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          mapping_status: string
          metadata: Json | null
          name: string
          updated_at: string
          upload_batch_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          mapping_status?: string
          metadata?: Json | null
          name: string
          updated_at?: string
          upload_batch_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          mapping_status?: string
          metadata?: Json | null
          name?: string
          updated_at?: string
          upload_batch_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uploaded_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploaded_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      usage_events: {
        Row: {
          company_id: string | null
          created_at: string
          deal_id: string | null
          duration_ms: number | null
          feature_subtype: string | null
          feature_type: string
          id: string
          metadata: Json
          session_id: string | null
          timestamp: string
          token_count: number | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_ms?: number | null
          feature_subtype?: string | null
          feature_type: string
          id?: string
          metadata?: Json
          session_id?: string | null
          timestamp?: string
          token_count?: number | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          deal_id?: string | null
          duration_ms?: number | null
          feature_subtype?: string | null
          feature_type?: string
          id?: string
          metadata?: Json
          session_id?: string | null
          timestamp?: string
          token_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_activity_log: {
        Row: {
          company_id: string | null
          created_at: string
          event_data: Json
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          event_data?: Json
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          event_data?: Json
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      user_dashboard_preferences: {
        Row: {
          company_id: string
          created_at: string
          id: string
          preference_key: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          preference_key: string
          preference_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          preference_key?: string
          preference_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_dashboard_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      user_deal_summary_preferences: {
        Row: {
          created_at: string
          daily_deal_summary_enabled: boolean | null
          daily_deal_summary_time_et: string | null
          id: string
          last_daily_deal_summary_sent_at: string | null
          last_weekly_deal_summary_sent_at: string | null
          updated_at: string
          user_id: string
          weekly_deal_summary_day_et: string | null
          weekly_deal_summary_enabled: boolean | null
          weekly_deal_summary_time_et: string | null
        }
        Insert: {
          created_at?: string
          daily_deal_summary_enabled?: boolean | null
          daily_deal_summary_time_et?: string | null
          id?: string
          last_daily_deal_summary_sent_at?: string | null
          last_weekly_deal_summary_sent_at?: string | null
          updated_at?: string
          user_id: string
          weekly_deal_summary_day_et?: string | null
          weekly_deal_summary_enabled?: boolean | null
          weekly_deal_summary_time_et?: string | null
        }
        Update: {
          created_at?: string
          daily_deal_summary_enabled?: boolean | null
          daily_deal_summary_time_et?: string | null
          id?: string
          last_daily_deal_summary_sent_at?: string | null
          last_weekly_deal_summary_sent_at?: string | null
          updated_at?: string
          user_id?: string
          weekly_deal_summary_day_et?: string | null
          weekly_deal_summary_enabled?: boolean | null
          weekly_deal_summary_time_et?: string | null
        }
        Relationships: []
      }
      user_email_ai_preferences: {
        Row: {
          auto_commit_high_confidence_pass: boolean
          calendar_tz: string | null
          created_at: string
          hold_expiration_hours: number
          min_required_slots: number
          place_soft_holds: boolean
          recent_tz: string[]
          updated_at: string
          user_id: string
          verify_on_send: boolean
          working_hours: Json
        }
        Insert: {
          auto_commit_high_confidence_pass?: boolean
          calendar_tz?: string | null
          created_at?: string
          hold_expiration_hours?: number
          min_required_slots?: number
          place_soft_holds?: boolean
          recent_tz?: string[]
          updated_at?: string
          user_id: string
          verify_on_send?: boolean
          working_hours?: Json
        }
        Update: {
          auto_commit_high_confidence_pass?: boolean
          calendar_tz?: string | null
          created_at?: string
          hold_expiration_hours?: number
          min_required_slots?: number
          place_soft_holds?: boolean
          recent_tz?: string[]
          updated_at?: string
          user_id?: string
          verify_on_send?: boolean
          working_hours?: Json
        }
        Relationships: []
      }
      user_email_preferences: {
        Row: {
          agenda_mention_emails: boolean
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agenda_mention_emails?: boolean
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agenda_mention_emails?: boolean
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_meeting_notes: {
        Row: {
          attendee_emails: string[] | null
          attendee_names: string[] | null
          created_at: string
          event_end: string | null
          event_id: string
          event_start: string | null
          event_title: string | null
          id: string
          linked_deal_id: string | null
          note_text: string
          organizer_email: string | null
          search_tsv: unknown
          updated_at: string
          user_id: string
        }
        Insert: {
          attendee_emails?: string[] | null
          attendee_names?: string[] | null
          created_at?: string
          event_end?: string | null
          event_id: string
          event_start?: string | null
          event_title?: string | null
          id?: string
          linked_deal_id?: string | null
          note_text: string
          organizer_email?: string | null
          search_tsv?: unknown
          updated_at?: string
          user_id: string
        }
        Update: {
          attendee_emails?: string[] | null
          attendee_names?: string[] | null
          created_at?: string
          event_end?: string | null
          event_id?: string
          event_start?: string | null
          event_title?: string | null
          id?: string
          linked_deal_id?: string | null
          note_text?: string
          organizer_email?: string | null
          search_tsv?: unknown
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          can_ai_sync: boolean
          can_build_writeup: boolean
          can_push_flex: boolean
          company_id: string | null
          created_at: string
          id: string
          permissions: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          can_ai_sync?: boolean
          can_build_writeup?: boolean
          can_push_flex?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          permissions?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          can_ai_sync?: boolean
          can_build_writeup?: boolean
          can_push_flex?: boolean
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
      user_ui_preferences: {
        Row: {
          created_at: string
          id: string
          preference_key: string
          preference_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preference_key: string
          preference_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preference_key?: string
          preference_value?: Json
          updated_at?: string
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
          dataroom_folder_path: string | null
          deal_id: string
          deleted_at: string | null
          deleted_by: string | null
          entity_count: number | null
          file_path: string | null
          file_size: number | null
          file_type: string | null
          filename: string
          folder_path: string
          id: string
          ingestion_status: string | null
          is_folder: boolean
          metadata: Json
          shared_to_dataroom: boolean
          sort_order: number | null
          source: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          chunk_count?: number | null
          company_id?: string | null
          created_at?: string
          dataroom_folder_path?: string | null
          deal_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          entity_count?: number | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          filename: string
          folder_path?: string
          id?: string
          ingestion_status?: string | null
          is_folder?: boolean
          metadata?: Json
          shared_to_dataroom?: boolean
          sort_order?: number | null
          source?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          chunk_count?: number | null
          company_id?: string | null
          created_at?: string
          dataroom_folder_path?: string | null
          deal_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          entity_count?: number | null
          file_path?: string | null
          file_size?: number | null
          file_type?: string | null
          filename?: string
          folder_path?: string
          id?: string
          ingestion_status?: string | null
          is_folder?: boolean
          metadata?: Json
          shared_to_dataroom?: boolean
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
          {
            foreignKeyName: "vdr_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "vdr_irl_requests_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          {
            foreignKeyName: "vdr_tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
      weekly_rundown_recipients: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      weekly_time_entries: {
        Row: {
          created_at: string
          deal_id: string
          hours: number
          id: string
          phase: string
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
          phase?: string
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
          phase?: string
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
          {
            foreignKeyName: "weekly_time_entries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
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
          agreement_sent: boolean
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
          manager_move_forward_decision: boolean
          materials_added_to_naitive: boolean
          name: string
          next_follow_up_at: string | null
          ops_id: string | null
          org_company_id: string | null
          proposal_status: string | null
          stage: Database["public"]["Enums"]["wf_deal_stage"]
          updated_at: string
        }
        Insert: {
          agreement_sent?: boolean
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
          manager_move_forward_decision?: boolean
          materials_added_to_naitive?: boolean
          name: string
          next_follow_up_at?: string | null
          ops_id?: string | null
          org_company_id?: string | null
          proposal_status?: string | null
          stage?: Database["public"]["Enums"]["wf_deal_stage"]
          updated_at?: string
        }
        Update: {
          agreement_sent?: boolean
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
          manager_move_forward_decision?: boolean
          materials_added_to_naitive?: boolean
          name?: string
          next_follow_up_at?: string | null
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
          recurrence_stop_conditions: Json | null
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
          recurrence_stop_conditions?: Json | null
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
          recurrence_stop_conditions?: Json | null
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
      widget_preferences: {
        Row: {
          created_at: string
          special_widgets: Json
          updated_at: string
          user_id: string
          widgets: Json
        }
        Insert: {
          created_at?: string
          special_widgets?: Json
          updated_at?: string
          user_id: string
          widgets?: Json
        }
        Update: {
          created_at?: string
          special_widgets?: Json
          updated_at?: string
          user_id?: string
          widgets?: Json
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          error_message: string | null
          error_stack: string | null
          error_step: string | null
          id: string
          results: Json
          started_at: string
          status: string
          step: string | null
          step_log: Json
          trigger_data: Json
          trigger_source: string | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_step?: string | null
          id?: string
          results?: Json
          started_at?: string
          status?: string
          step?: string | null
          step_log?: Json
          trigger_data?: Json
          trigger_source?: string | null
          user_id: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          error_stack?: string | null
          error_step?: string | null
          id?: string
          results?: Json
          started_at?: string
          status?: string
          step?: string | null
          step_log?: Json
          trigger_data?: Json
          trigger_source?: string | null
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
      deal_stage_durations: {
        Row: {
          company_id: string | null
          deal_id: string | null
          duration_seconds: number | null
          enter_actor: string | null
          enter_event_id: string | null
          enter_precision: string | null
          enter_source: string | null
          entered_at: string | null
          exit_actor: string | null
          exit_precision: string | null
          exit_source: string | null
          exited_at: string | null
          is_open: boolean | null
          pipeline_id: string | null
          quality_flag: string | null
          stage_id: string | null
          stage_slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      deal_stage_transitions: {
        Row: {
          company_id: string | null
          deal_id: string | null
          from_enter_event_id: string | null
          from_entered_at: string | null
          from_stage_slug: string | null
          is_consecutive: boolean | null
          to_enter_event_id: string | null
          to_entered_at: string | null
          to_stage_slug: string | null
          transit_seconds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
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
      v_deal_owner_resolution: {
        Row: {
          candidate_user_id: string | null
          company_id: string | null
          confidence: number | null
          current_owner_user_id: string | null
          deal_id: string | null
          deal_name: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          raw_owner_text: string | null
          stage: string | null
          status: string | null
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
      v_deal_stage_transitions: {
        Row: {
          deal_id: string | null
          duration: string | null
          entered_at: string | null
          exited_at: string | null
          pipeline_id: string | null
          stage_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "v_deal_owner_resolution"
            referencedColumns: ["deal_id"]
          },
        ]
      }
      v_weekly_advance_reasons: {
        Row: {
          last_week_count: number | null
          reason_category:
            | Database["public"]["Enums"]["advance_reason_category"]
            | null
          this_week_count: number | null
        }
        Relationships: []
      }
      workflow_run_latest: {
        Row: {
          completed_at: string | null
          duration_seconds: number | null
          error_message: string | null
          error_step: string | null
          id: string | null
          started_at: string | null
          status: string | null
          step: string | null
          trigger_source: string | null
          user_id: string | null
          workflow_id: string | null
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
    }
    Functions: {
      _deal_lender_status_bucket: {
        Args: { _stage: string; _substage: string; _tracking: string }
        Returns: string
      }
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
      backfill_claap_recordings_from_meetings: { Args: never; Returns: Json }
      bulk_contact_company_match: {
        Args: {
          p_limit?: number
          p_only_unmatched?: boolean
          p_org_company_id: string
        }
        Returns: Json
      }
      bump_contact_last_contact: {
        Args: { _at: string; _emails: string[] }
        Returns: undefined
      }
      bump_contact_last_contact_by_id: {
        Args: { _at: string; _contact_id: string }
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
      can_access_task: { Args: { _task_id: string }; Returns: boolean }
      can_delete_lenders: { Args: { _user_id: string }; Returns: boolean }
      can_use_approval_queue: { Args: { _user_id: string }; Returns: boolean }
      can_user_use_agent: {
        Args: { p_agent_key: string; p_company_id: string; p_user_id: string }
        Returns: boolean
      }
      can_view_company_insights: {
        Args: { _company_id: string }
        Returns: boolean
      }
      claap_accept_suggestion: {
        Args: { p_candidate_id: string; p_link_role: string }
        Returns: {
          candidate_id: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          link_role: string
          recording_id: string
          source: string
        }
        SetofOptions: {
          from: "*"
          to: "claap_recording_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claap_assert_prefill_examples: { Args: never; Returns: undefined }
      claap_assert_tenant_isolation: { Args: never; Returns: Json }
      claap_link_orphan_recordings: { Args: never; Returns: Json }
      claap_mark_rate_limited: { Args: never; Returns: undefined }
      claap_mark_unrelated: {
        Args: { p_entity_type: string; p_recording_id: string }
        Returns: undefined
      }
      claap_quota_status: {
        Args: never
        Returns: {
          calls_made: number
          daily_limit: number
          first_429_at: string
          out_of_quota: boolean
          protect_mode: boolean
          reset_at: string
          usage_date: string
        }[]
      }
      claap_record_api_call: {
        Args: { _count?: number }
        Returns: {
          calls_made: number
          daily_limit: number
          protect_mode: boolean
        }[]
      }
      claap_reject_suggestion: {
        Args: { p_candidate_id: string; p_reason?: string }
        Returns: undefined
      }
      claap_request_rescore: {
        Args: { p_recording_id: string }
        Returns: boolean
      }
      claap_run_smoke_test: { Args: never; Returns: Json }
      claap_seed_demo: { Args: { p_tenant_id: string }; Returns: Json }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      clone_demo_tenant: {
        Args: {
          p_owner_user_id: string
          p_source_company_id: string
          p_target_company_id: string
        }
        Returns: Json
      }
      create_task_inapp_notification: {
        Args: {
          _body: string
          _context?: Json
          _recipient_user_id: string
          _task_id: string
          _title: string
          _trigger_key: string
        }
        Returns: string
      }
      deal_fiscal_bucket: {
        Args: { ts: string }
        Returns: {
          fiscal_quarter: number
          fiscal_year: number
        }[]
      }
      debug_claap_prefill_source: {
        Args: { p_meeting_id: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
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
      exec_sql: { Args: { sql: string }; Returns: undefined }
      exec_sql_readonly: { Args: { sql: string }; Returns: Json[] }
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
      find_entity: {
        Args: { _limit?: number; _query: string; _type: string }
        Returns: {
          confidence: number
          display_name: string
          id: string
          subtitle: string
        }[]
      }
      get_avg_time_between_stages: {
        Args: {
          p_consecutive_only?: boolean
          p_date_from?: string
          p_date_to?: string
          p_from_stage: string
          p_to_stage: string
        }
        Returns: {
          avg_seconds: number
          from_stage_slug: string
          median_seconds: number
          n_transitions: number
          p90_seconds: number
          to_stage_slug: string
        }[]
      }
      get_avg_time_in_stage: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_include_open?: boolean
          p_stage_slug: string
        }
        Returns: {
          avg_seconds: number
          median_seconds: number
          n_instances: number
          p90_seconds: number
          stage_slug: string
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
      get_deal_stage_durations: {
        Args: { p_deal_id: string }
        Returns: {
          duration_seconds: number
          enter_event_id: string
          enter_precision: string
          enter_source: string
          entered_at: string
          exit_precision: string
          exit_source: string
          exited_at: string
          is_open: boolean
          quality_flag: string
          stage_slug: string
        }[]
      }
      get_event_claap_prefill_context: {
        Args: {
          p_event_id: string
          p_event_start?: string
          p_event_title?: string
          p_organizer_email?: string
        }
        Returns: Json
      }
      get_funding_source_qualified_actuals: {
        Args: { p_cadence?: string; p_tenant_id: string; p_year: number }
        Returns: {
          lender_ids: string[]
          period: number
          qualified_count: number
        }[]
      }
      get_funding_source_qualified_actuals_detail: {
        Args: {
          p_cadence?: string
          p_period?: number
          p_tenant_id: string
          p_year: number
        }
        Returns: {
          deal_company: string
          deal_id: string
          deal_submitted_at: string
          delta_seconds: number
          lender_id: string
          lender_name: string
          period: number
          relationship_owners: string
          trigger_at: string
          trigger_kind: string
        }[]
      }
      get_funnel_velocity: {
        Args: { p_consecutive_only?: boolean; p_stage_path: string[] }
        Returns: {
          avg_seconds: number
          from_stage_slug: string
          median_seconds: number
          n_transitions: number
          p90_seconds: number
          segment_index: number
          to_stage_slug: string
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
      get_or_create_synthesized_note: {
        Args: { p_meeting_id: string }
        Returns: {
          content: Json
          created_at: string
          created_by: string | null
          meeting_id: string
          model: string | null
          org_company_id: string
          source: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "meeting_synthesized_notes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_stage_transit_monthly: {
        Args: {
          p_anchor?: string
          p_from_variants: string[]
          p_to_variants: string[]
          p_window_months?: number
        }
        Returns: {
          avg_months: number
          bucket_month: string
          deal_count: number
          median_months: number
        }[]
      }
      get_stage_transit_open: {
        Args: {
          p_anchor?: string
          p_from_variants: string[]
          p_to_variants: string[]
          p_window_months?: number
        }
        Returns: {
          avg_open_months: number
          open_count: number
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
      get_user_capability: {
        Args: { _capability: string; _user_id: string }
        Returns: boolean
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
      get_visible_ai_action_queue: {
        Args: never
        Returns: {
          action_type: string
          approved_at: string | null
          assigned_to: string | null
          created_at: string
          deal_id: string | null
          deal_name: string | null
          description: string | null
          dismissed_at: string | null
          edited_before_approval: boolean | null
          evidence: Json | null
          executed_at: string | null
          executed_by: string | null
          execution_error: string | null
          execution_result: Json | null
          expires_at: string
          id: string
          more_context_notes: string | null
          more_context_requested_at: string | null
          new_values: Json | null
          old_values: Json | null
          on_approve_execution_type: string | null
          payload: Json
          priority: string | null
          rationale: string | null
          reassigned_from: string | null
          rejection_reason: string | null
          reminder_sent_at: string | null
          risk_level: string | null
          source: Json
          status: string
          target_object_id: string | null
          target_object_type: string | null
          title: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_action_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      hard_delete_deal: { Args: { _deal_id: string }; Returns: undefined }
      has_active_admin_impersonation: {
        Args: { _user_id: string }
        Returns: boolean
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
      is_admin_agent_activated: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: boolean
      }
      is_agent_enabled_for_company: {
        Args: { p_agent_key: string; p_company_id: string }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_seeding: { Args: { _company_id: string }; Returns: boolean }
      is_deal_notification_suppressed: {
        Args: { _deal_id: string }
        Returns: boolean
      }
      is_demo_user: { Args: { _user_id: string }; Returns: boolean }
      is_email_allowed_for_page: {
        Args: { _email: string; _page_key: string }
        Returns: boolean
      }
      is_fifth_line_internal_admin: { Args: never; Returns: boolean }
      is_flex_hidden_stage: { Args: { p_stage: string }; Returns: boolean }
      is_freemail_domain: { Args: { d: string }; Returns: boolean }
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
      log_inverted_pi_fci_pairs: {
        Args: { p_from_variants: string[]; p_to_variants: string[] }
        Returns: number
      }
      mark_email_thread_dirty: {
        Args: {
          _latest_message_at?: string
          _subject?: string
          _thread_id: string
          _user_id: string
        }
        Returns: undefined
      }
      match_admin_agent_knowledge: {
        Args: {
          p_agent_key: string
          p_company_id: string
          p_match_count?: number
          p_query: string
          p_tag_filter?: string[]
        }
        Returns: {
          chunk_id: string
          content: string
          doc_id: string
          similarity: number
          tags: string[]
          title: string
        }[]
      }
      match_lenders_by_narrative: {
        Args: {
          caller_company_id?: string
          match_count?: number
          query_embedding: string
        }
        Returns: {
          lender_name: string
          master_lender_id: string
          similarity: number
        }[]
      }
      merge_master_lenders: {
        Args: { _keep_id: string; _merge_ids: string[] }
        Returns: undefined
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
      normalize_email_domain: { Args: { em: string }; Returns: string }
      normalize_stage: { Args: { stage_text: string }; Returns: string }
      normalize_stage_label: { Args: { t: string }; Returns: string }
      normalize_website_domain: { Args: { url: string }; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      refresh_deal_stage_metrics: { Args: never; Returns: undefined }
      reject_join_request: {
        Args: { _rejection_note?: string; _request_id: string }
        Returns: undefined
      }
      rep_audit_apply: { Args: { p_run_id: string }; Returns: Json }
      rep_audit_dry_run: { Args: { rep_user_id: string }; Returns: Json }
      rep_audit_undo: { Args: { p_apply_id?: string }; Returns: Json }
      reset_dashboard_grid_layout: {
        Args: { _company_id: string; _dashboard_id: string }
        Returns: undefined
      }
      reset_demo_ai_chats: { Args: never; Returns: number }
      run_contact_company_match: {
        Args: { p_contact_id: string; p_force?: boolean; p_source?: string }
        Returns: Json
      }
      save_dashboard_grid_layout: {
        Args: { _company_id: string; _dashboard_id: string; _layout: Json }
        Returns: undefined
      }
      save_fpa_dashboard_config: {
        Args: { _company_id: string; _config_key: string; _config_value: Json }
        Returns: undefined
      }
      search_contacts_fast: {
        Args: { _limit?: number; _offset?: number; _search: string }
        Returns: {
          contact_score: number
          contact_type: string
          created_at: string
          crm_company_id: string
          crm_company_name: string
          email: string
          email_domain_normalized: string
          first_name: string
          full_name: string
          hs_city: string
          hs_company_name: string
          hs_contact_status: string
          hs_contact_type: string
          hs_hs_email_optout: boolean
          hs_industry: string
          hs_notes_last_contacted: string
          hs_state: string
          hubspot_contact_id: string
          id: string
          job_title: string
          last_activity_date: string
          last_contact_at: string
          last_name: string
          lead_source: string
          lifecycle_stage: string
          linkedin_url: string
          owner_user_id: string
          phone_mobile: string
          phone_work: string
          primary_company_id: string
          status: string
          synced_with_hubspot: boolean
          updated_at: string
        }[]
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_has_deal_access: {
        Args: { _deal_id: string; _user_id: string }
        Returns: boolean
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
      advance_reason_category:
        | "budget_confirmed"
        | "champion_identified"
        | "timeline_locked"
        | "technical_fit"
        | "executive_sponsor"
        | "competitive_win"
        | "other"
      app_role: "admin" | "moderator" | "user" | "support_admin"
      blog_post_status: "draft" | "published" | "disabled"
      channel_type:
        | "Banks"
        | "M&A and Investment Bankers"
        | "Service Providers"
        | "Investors"
        | "Advisors"
        | "Other"
        | "Lenders"
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
      copilot_preference_category:
        | "formatting"
        | "terminology"
        | "behavior"
        | "domain_knowledge"
      copilot_preference_source: "manual" | "thumbs_down" | "chat_command"
      data_access_scope: "all" | "team" | "own" | "none"
      deal_access_request_status: "pending" | "approved" | "declined"
      deal_calendar_item_type: "meeting" | "deadline" | "reminder" | "note"
      feature_status: "disabled" | "staging" | "deployed" | "james_only"
      financial_column_type: "actual" | "projection"
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
      lender_recommendation_outcome_status:
        | "recommended"
        | "dismissed"
        | "contacted"
        | "engaged"
        | "declined"
        | "terms_issued"
        | "diligence"
        | "closed_won"
        | "closed_lost"
      meeting_claap_resolution_status:
        | "auto_linked"
        | "suggested"
        | "no_match"
        | "manual_linked"
        | "manually_changed"
      meeting_hold_state: "held" | "confirmed" | "released" | "expired"
      notification_category:
        | "deals"
        | "tasks"
        | "lenders"
        | "milestones"
        | "reporting"
        | "system"
      notification_channel_type: "in_app" | "email" | "slack" | "sms" | "push"
      notification_instance_status: "pending" | "sent" | "failed" | "skipped"
      pilot_kpi_event_type:
        | "deal_created"
        | "initial_login"
        | "session_heartbeat"
        | "visit"
        | "feedback_given"
        | "feedback_call_attended"
        | "demo_converted"
        | "pilot_converted"
      proposed_slot_status: "proposed" | "accepted" | "expired" | "cancelled"
      settings_audit_action: "dry_run" | "apply" | "undo" | "deny"
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
      advance_reason_category: [
        "budget_confirmed",
        "champion_identified",
        "timeline_locked",
        "technical_fit",
        "executive_sponsor",
        "competitive_win",
        "other",
      ],
      app_role: ["admin", "moderator", "user", "support_admin"],
      blog_post_status: ["draft", "published", "disabled"],
      channel_type: [
        "Banks",
        "M&A and Investment Bankers",
        "Service Providers",
        "Investors",
        "Advisors",
        "Other",
        "Lenders",
      ],
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
      copilot_preference_category: [
        "formatting",
        "terminology",
        "behavior",
        "domain_knowledge",
      ],
      copilot_preference_source: ["manual", "thumbs_down", "chat_command"],
      data_access_scope: ["all", "team", "own", "none"],
      deal_access_request_status: ["pending", "approved", "declined"],
      deal_calendar_item_type: ["meeting", "deadline", "reminder", "note"],
      feature_status: ["disabled", "staging", "deployed", "james_only"],
      financial_column_type: ["actual", "projection"],
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
      lender_recommendation_outcome_status: [
        "recommended",
        "dismissed",
        "contacted",
        "engaged",
        "declined",
        "terms_issued",
        "diligence",
        "closed_won",
        "closed_lost",
      ],
      meeting_claap_resolution_status: [
        "auto_linked",
        "suggested",
        "no_match",
        "manual_linked",
        "manually_changed",
      ],
      meeting_hold_state: ["held", "confirmed", "released", "expired"],
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
      pilot_kpi_event_type: [
        "deal_created",
        "initial_login",
        "session_heartbeat",
        "visit",
        "feedback_given",
        "feedback_call_attended",
        "demo_converted",
        "pilot_converted",
      ],
      proposed_slot_status: ["proposed", "accepted", "expired", "cancelled"],
      settings_audit_action: ["dry_run", "apply", "undo", "deny"],
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
