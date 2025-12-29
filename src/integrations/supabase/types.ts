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
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          deal_id: string
          description: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          deal_id?: string
          description?: string
          id?: string
          metadata?: Json | null
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
      companies: {
        Row: {
          address: string | null
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
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
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
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
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
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
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
      deal_attachments: {
        Row: {
          category: string
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
          category: string
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
          category?: string
          content_type?: string | null
          created_at?: string
          deal_id?: string
          file_path?: string
          id?: string
          name?: string
          size_bytes?: number
          user_id?: string | null
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
      deals: {
        Row: {
          company: string
          created_at: string
          deal_type: string | null
          engagement_type: string | null
          id: string
          manager: string | null
          milestone_fee: number | null
          post_signing_hours: number | null
          pre_signing_hours: number | null
          referred_by: string | null
          retainer_fee: number | null
          stage: string
          status: string
          success_fee_percent: number | null
          total_fee: number | null
          updated_at: string
          user_id: string | null
          value: number
        }
        Insert: {
          company: string
          created_at?: string
          deal_type?: string | null
          engagement_type?: string | null
          id?: string
          manager?: string | null
          milestone_fee?: number | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          referred_by?: string | null
          retainer_fee?: number | null
          stage?: string
          status?: string
          success_fee_percent?: number | null
          total_fee?: number | null
          updated_at?: string
          user_id?: string | null
          value?: number
        }
        Update: {
          company?: string
          created_at?: string
          deal_type?: string | null
          engagement_type?: string | null
          id?: string
          manager?: string | null
          milestone_fee?: number | null
          post_signing_hours?: number | null
          pre_signing_hours?: number | null
          referred_by?: string | null
          retainer_fee?: number | null
          stage?: string
          status?: string
          success_fee_percent?: number | null
          total_fee?: number | null
          updated_at?: string
          user_id?: string | null
          value?: number
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
      profiles: {
        Row: {
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
          email_notifications: boolean
          id: string
          in_app_notifications: boolean
          lender_updates_app: boolean
          lender_updates_email: boolean
          notify_activity_deal_created: boolean
          notify_activity_lender_added: boolean
          notify_activity_lender_updated: boolean
          notify_activity_stage_changed: boolean
          notify_activity_status_changed: boolean
          notify_stale_alerts: boolean
          onboarding_completed: boolean
          phone: string | null
          updated_at: string
          user_id: string
          weekly_summary_email: boolean
        }
        Insert: {
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
          email_notifications?: boolean
          id?: string
          in_app_notifications?: boolean
          lender_updates_app?: boolean
          lender_updates_email?: boolean
          notify_activity_deal_created?: boolean
          notify_activity_lender_added?: boolean
          notify_activity_lender_updated?: boolean
          notify_activity_stage_changed?: boolean
          notify_activity_status_changed?: boolean
          notify_stale_alerts?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
          weekly_summary_email?: boolean
        }
        Update: {
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
          email_notifications?: boolean
          id?: string
          in_app_notifications?: boolean
          lender_updates_app?: boolean
          lender_updates_email?: boolean
          notify_activity_deal_created?: boolean
          notify_activity_lender_added?: boolean
          notify_activity_lender_updated?: boolean
          notify_activity_stage_changed?: boolean
          notify_activity_status_changed?: boolean
          notify_stale_alerts?: boolean
          onboarding_completed?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
          weekly_summary_email?: boolean
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
      workflows: {
        Row: {
          actions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
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
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_company_role: {
        Args: { _company_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["company_role"]
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      company_role: "owner" | "admin" | "member"
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
      company_role: ["owner", "admin", "member"],
    },
  },
} as const
