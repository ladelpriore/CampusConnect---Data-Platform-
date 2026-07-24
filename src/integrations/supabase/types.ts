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
      applicants: {
        Row: {
          application_id: string | null
          application_status: string | null
          created_at: string
          email: string | null
          enrollment_term: string | null
          first_name: string | null
          id: string
          last_name: string | null
          merged_into: string | null
          missing_documents: string[] | null
          normalized_email: string | null
          source: string | null
          source_campaign: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          application_status?: string | null
          created_at?: string
          email?: string | null
          enrollment_term?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          merged_into?: string | null
          missing_documents?: string[] | null
          normalized_email?: string | null
          source?: string | null
          source_campaign?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          application_status?: string | null
          created_at?: string
          email?: string | null
          enrollment_term?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          merged_into?: string | null
          missing_documents?: string[] | null
          normalized_email?: string | null
          source?: string | null
          source_campaign?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor: string | null
          affected_record: string | null
          created_at: string
          id: string
          metadata: Json | null
          result: string | null
          source: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          affected_record?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          result?: string | null
          source?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          affected_record?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          result?: string | null
          source?: string | null
        }
        Relationships: []
      }
      data_sources: {
        Row: {
          created_at: string
          failed_records: number
          id: string
          kind: string
          last_sync_at: string | null
          name: string
          records_processed: number
          status: string
          sync_frequency: string
        }
        Insert: {
          created_at?: string
          failed_records?: number
          id?: string
          kind: string
          last_sync_at?: string | null
          name: string
          records_processed?: number
          status?: string
          sync_frequency?: string
        }
        Update: {
          created_at?: string
          failed_records?: number
          id?: string
          kind?: string
          last_sync_at?: string | null
          name?: string
          records_processed?: number
          status?: string
          sync_frequency?: string
        }
        Relationships: []
      }
      duplicate_matches: {
        Row: {
          applicant_a: string | null
          applicant_b: string | null
          created_at: string
          id: string
          reason: string
          resolved: boolean
        }
        Insert: {
          applicant_a?: string | null
          applicant_b?: string | null
          created_at?: string
          id?: string
          reason: string
          resolved?: boolean
        }
        Update: {
          applicant_a?: string | null
          applicant_b?: string | null
          created_at?: string
          id?: string
          reason?: string
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_matches_applicant_a_fkey"
            columns: ["applicant_a"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_matches_applicant_b_fkey"
            columns: ["applicant_b"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          id: string
          kind: string
          records_invalid: number
          records_total: number
          records_valid: number
          source_id: string | null
          source_name: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          records_invalid?: number
          records_total?: number
          records_valid?: number
          source_id?: string | null
          source_name?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          records_invalid?: number
          records_total?: number
          records_valid?: number
          source_id?: string | null
          source_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      validation_errors: {
        Row: {
          applicant_id: string | null
          created_at: string
          id: string
          kind: string
          message: string | null
          resolved: boolean
        }
        Insert: {
          applicant_id?: string | null
          created_at?: string
          id?: string
          kind: string
          message?: string | null
          resolved?: boolean
        }
        Update: {
          applicant_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "validation_errors_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          action_taken: string
          applicant_id: string | null
          created_at: string
          id: string
          result: string | null
          rule_id: string | null
        }
        Insert: {
          action_taken: string
          applicant_id?: string | null
          created_at?: string
          id?: string
          result?: string | null
          rule_id?: string | null
        }
        Update: {
          action_taken?: string
          applicant_id?: string | null
          created_at?: string
          id?: string
          result?: string | null
          rule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_rules: {
        Row: {
          action: Json
          active: boolean
          condition: Json
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          action: Json
          active?: boolean
          condition: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          action?: Json
          active?: boolean
          condition?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
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
} as const
