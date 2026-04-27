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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      components: {
        Row: {
          company_id: string
          created_at: string
          defective_count: number
          id: string
          image_url: string | null
          minimum_threshold: number
          name: string
          sku: string
          stock_count: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          defective_count?: number
          id?: string
          image_url?: string | null
          minimum_threshold?: number
          name: string
          sku: string
          stock_count?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          defective_count?: number
          id?: string
          image_url?: string | null
          minimum_threshold?: number
          name?: string
          sku?: string
          stock_count?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "components_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          company_id: string
          edited_at: string | null
          edited_by: string | null
          id: string
          notes: string | null
          report_date: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          notes?: string | null
          report_date: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          notes?: string | null
          report_date?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: []
      }
      device_dependencies: {
        Row: {
          depends_on_device_id: string
          device_id: string
          id: string
          quantity: number
        }
        Insert: {
          depends_on_device_id: string
          device_id: string
          id?: string
          quantity: number
        }
        Update: {
          depends_on_device_id?: string
          device_id?: string
          id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "device_dependencies_depends_on_device_id_fkey"
            columns: ["depends_on_device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_dependencies_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_recipes: {
        Row: {
          component_id: string
          device_id: string
          id: string
          quantity: number
        }
        Insert: {
          component_id: string
          device_id: string
          id?: string
          quantity: number
        }
        Update: {
          component_id?: string
          device_id?: string
          id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "device_recipes_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_recipes_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          assembled_stock: number
          company_id: string
          created_at: string
          id: string
          image_url: string | null
          minimum_threshold: number
          name: string
          sku: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          assembled_stock?: number
          company_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          minimum_threshold?: number
          name: string
          sku: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          assembled_stock?: number
          company_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          minimum_threshold?: number
          name?: string
          sku?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          action: Database["public"]["Enums"]["log_action"]
          company_id: string
          created_at: string
          id: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["log_item_type"]
          note: string | null
          quantity: number
          user_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["log_action"]
          company_id: string
          created_at?: string
          id?: string
          item_id: string
          item_name: string
          item_type: Database["public"]["Enums"]["log_item_type"]
          note?: string | null
          quantity: number
          user_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["log_action"]
          company_id?: string
          created_at?: string
          id?: string
          item_id?: string
          item_name?: string
          item_type?: Database["public"]["Enums"]["log_item_type"]
          note?: string | null
          quantity?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          end_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string
          created_at: string
          display_title: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          display_title?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          display_title?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_tasks: {
        Row: {
          created_at: string
          id: string
          quantity: number | null
          report_id: string
          task_name: string
          template_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          quantity?: number | null
          report_id: string
          task_name: string
          template_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          quantity?: number | null
          report_id?: string
          task_name?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_tasks_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      system_notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      system_reports: {
        Row: {
          company_id: string
          created_at: string
          file_url: string | null
          generated_at: string | null
          id: string
          metadata: Json | null
          period_end: string
          period_start: string
          report_type: Database["public"]["Enums"]["system_report_type"]
          status: Database["public"]["Enums"]["system_report_status"]
          title: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          file_url?: string | null
          generated_at?: string | null
          id?: string
          metadata?: Json | null
          period_end: string
          period_start: string
          report_type: Database["public"]["Enums"]["system_report_type"]
          status?: Database["public"]["Enums"]["system_report_status"]
          title?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          file_url?: string | null
          generated_at?: string | null
          id?: string
          metadata?: Json | null
          period_end?: string
          period_start?: string
          report_type?: Database["public"]["Enums"]["system_report_type"]
          status?: Database["public"]["Enums"]["system_report_status"]
          title?: string | null
        }
        Relationships: []
      }
      task_templates: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_component: {
        Args: { _component_id: string; _delta: number; _note?: string }
        Returns: undefined
      }
      assemble_device: {
        Args: { _device_id: string; _note?: string; _qty: number }
        Returns: undefined
      }
      build_capacity: { Args: { _device_id: string }; Returns: number }
      decide_leave_request: {
        Args: { _approve: boolean; _request_id: string }
        Returns: undefined
      }
      deliver_device: {
        Args: { _device_id: string; _note?: string; _qty: number }
        Returns: undefined
      }
      get_user_company: { Args: { _user_id: string }; Returns: string }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_in_company: {
        Args: {
          _company_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_of: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_manager_of: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      mark_component_defective: {
        Args: { _component_id: string; _note?: string; _qty: number }
        Returns: undefined
      }
      missing_report_users_for_date: {
        Args: { _company_id: string; _date: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      previous_working_day: {
        Args: { _from?: string; _user_id: string }
        Returns: string
      }
      remove_user_role: { Args: { _user_id: string }; Returns: undefined }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      should_submit_report_for_date: {
        Args: { _date: string; _user_id: string }
        Returns: boolean
      }
      submit_daily_report: {
        Args: { _notes: string; _report_date: string; _tasks: Json }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "staff" | "manager"
      leave_status: "pending" | "approved" | "rejected"
      leave_type: "annual" | "off_day" | "sick"
      log_action: "in" | "out" | "assemble" | "deliver" | "adjust" | "defective"
      log_item_type: "component" | "device"
      system_report_status: "pending" | "ready" | "failed"
      system_report_type: "monthly" | "quarterly" | "biannual" | "annual"
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
      app_role: ["admin", "staff", "manager"],
      leave_status: ["pending", "approved", "rejected"],
      leave_type: ["annual", "off_day", "sick"],
      log_action: ["in", "out", "assemble", "deliver", "adjust", "defective"],
      log_item_type: ["component", "device"],
      system_report_status: ["pending", "ready", "failed"],
      system_report_type: ["monthly", "quarterly", "biannual", "annual"],
    },
  },
} as const
