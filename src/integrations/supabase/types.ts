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
      daily_top_domains: {
        Row: {
          confidence_score: number
          created_at: string
          domain: string
          estimated_value: number
          id: string
          rank: number
          rationale: string | null
          registrar_price: number
          scan_date: string
          tld: string
        }
        Insert: {
          confidence_score: number
          created_at?: string
          domain: string
          estimated_value: number
          id?: string
          rank: number
          rationale?: string | null
          registrar_price: number
          scan_date?: string
          tld: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          domain?: string
          estimated_value?: number
          id?: string
          rank?: number
          rationale?: string | null
          registrar_price?: number
          scan_date?: string
          tld?: string
        }
        Relationships: []
      }
      decision_settings: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      domain_history: {
        Row: {
          confidence_score: number
          created_at: string
          domain: string
          estimated_value: number
          id: string
          rationale: string | null
          registrar_price: number
          registrar_url: string | null
          tld: string
        }
        Insert: {
          confidence_score: number
          created_at?: string
          domain: string
          estimated_value: number
          id?: string
          rationale?: string | null
          registrar_price: number
          registrar_url?: string | null
          tld: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          domain?: string
          estimated_value?: number
          id?: string
          rationale?: string | null
          registrar_price?: number
          registrar_url?: string | null
          tld?: string
        }
        Relationships: []
      }
      marketplace_audit_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          listing_id: string | null
          metadata: Json
          offer_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          listing_id?: string | null
          metadata?: Json
          offer_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          listing_id?: string | null
          metadata?: Json
          offer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_audit_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_domain_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_audit_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_domain_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_domain_control_proofs: {
        Row: {
          challenge_record: string
          challenge_token: string
          checked_at: string | null
          created_at: string
          expires_at: string
          id: string
          listing_id: string
          rejected_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["marketplace_domain_control_proof_status"]
          submitted_at: string | null
          updated_at: string
          verified_at: string | null
          verifier_note: string | null
        }
        Insert: {
          challenge_record: string
          challenge_token: string
          checked_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          listing_id: string
          rejected_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["marketplace_domain_control_proof_status"]
          submitted_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verifier_note?: string | null
        }
        Update: {
          challenge_record?: string
          challenge_token?: string
          checked_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          listing_id?: string
          rejected_at?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["marketplace_domain_control_proof_status"]
          submitted_at?: string | null
          updated_at?: string
          verified_at?: string | null
          verifier_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_domain_control_proofs_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_domain_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_domain_listings: {
        Row: {
          asking_price: number
          created_at: string
          currency: string
          description: string
          domain: string
          expires_at: string | null
          id: string
          ownership_verification_status: Database["public"]["Enums"]["marketplace_ownership_verification_status"]
          ownership_verified_at: string | null
          published_at: string | null
          reviewed_at: string | null
          seller_display_name: string
          seller_id: string
          source_user_domain_id: string | null
          status: Database["public"]["Enums"]["marketplace_listing_status"]
          updated_at: string
        }
        Insert: {
          asking_price: number
          created_at?: string
          currency?: string
          description: string
          domain: string
          expires_at?: string | null
          id?: string
          ownership_verification_status?: Database["public"]["Enums"]["marketplace_ownership_verification_status"]
          ownership_verified_at?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          seller_display_name: string
          seller_id: string
          source_user_domain_id?: string | null
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          updated_at?: string
        }
        Update: {
          asking_price?: number
          created_at?: string
          currency?: string
          description?: string
          domain?: string
          expires_at?: string | null
          id?: string
          ownership_verification_status?: Database["public"]["Enums"]["marketplace_ownership_verification_status"]
          ownership_verified_at?: string | null
          published_at?: string | null
          reviewed_at?: string | null
          seller_display_name?: string
          seller_id?: string
          source_user_domain_id?: string | null
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_domain_listings_source_user_domain_id_fkey"
            columns: ["source_user_domain_id"]
            isOneToOne: false
            referencedRelation: "user_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_domain_offers: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string
          currency: string
          id: string
          listing_id: string
          message: string | null
          seller_id: string
          status: Database["public"]["Enums"]["marketplace_offer_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id?: string
          created_at?: string
          currency?: string
          id?: string
          listing_id: string
          message?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["marketplace_offer_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          created_at?: string
          currency?: string
          id?: string
          listing_id?: string
          message?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["marketplace_offer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_domain_offers_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_domain_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_registrable_suffixes: {
        Row: {
          created_at: string
          suffix: string
        }
        Insert: {
          created_at?: string
          suffix: string
        }
        Update: {
          created_at?: string
          suffix?: string
        }
        Relationships: []
      }
      marketplace_seller_profiles: {
        Row: {
          created_at: string
          default_currency: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_domain_history: {
        Row: {
          confidence_score: number
          created_at: string
          domain: string
          estimated_value: number
          id: string
          rationale: string | null
          registrar_price: number
          registrar_url: string | null
          tld: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence_score: number
          created_at?: string
          domain: string
          estimated_value: number
          id?: string
          rationale?: string | null
          registrar_price: number
          registrar_url?: string | null
          tld: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          domain?: string
          estimated_value?: number
          id?: string
          rationale?: string | null
          registrar_price?: number
          registrar_url?: string | null
          tld?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      model_adapters: {
        Row: {
          calibration_offset: number | null
          confidence_multiplier: number | null
          created_at: string
          display_name: string
          drift_threshold: number | null
          historical_accuracy: number | null
          id: string
          is_enabled: boolean
          last_drift_check: string | null
          model_name: string
          notes: string | null
          total_evaluations: number | null
          updated_at: string
          weight: number
        }
        Insert: {
          calibration_offset?: number | null
          confidence_multiplier?: number | null
          created_at?: string
          display_name: string
          drift_threshold?: number | null
          historical_accuracy?: number | null
          id?: string
          is_enabled?: boolean
          last_drift_check?: string | null
          model_name: string
          notes?: string | null
          total_evaluations?: number | null
          updated_at?: string
          weight?: number
        }
        Update: {
          calibration_offset?: number | null
          confidence_multiplier?: number | null
          created_at?: string
          display_name?: string
          drift_threshold?: number | null
          historical_accuracy?: number | null
          id?: string
          is_enabled?: boolean
          last_drift_check?: string | null
          model_name?: string
          notes?: string | null
          total_evaluations?: number | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      model_evaluation_history: {
        Row: {
          actual_outcome: number | null
          confidence_score: number
          domain: string
          evaluation_date: string
          id: string
          model_name: string
          predicted_value: number
          signals_used: Json | null
        }
        Insert: {
          actual_outcome?: number | null
          confidence_score: number
          domain: string
          evaluation_date?: string
          id?: string
          model_name: string
          predicted_value: number
          signals_used?: Json | null
        }
        Update: {
          actual_outcome?: number | null
          confidence_score?: number
          domain?: string
          evaluation_date?: string
          id?: string
          model_name?: string
          predicted_value?: number
          signals_used?: Json | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      registrar_settings: {
        Row: {
          confidence_threshold: number | null
          created_at: string
          display_name: string
          excluded_patterns: Json | null
          id: string
          is_enabled: boolean
          last_scrape_at: string | null
          last_success_at: string | null
          max_concurrent_requests: number | null
          max_price: number | null
          min_estimated_value: number | null
          min_price: number | null
          notes: string | null
          preferred_tlds: Json | null
          priority_weight: number | null
          rate_limit_per_minute: number | null
          registrar_name: string
          scrape_interval_minutes: number | null
          success_rate: number | null
          total_domains_found: number | null
          total_gems_found: number | null
          updated_at: string
          value_to_price_ratio: number | null
        }
        Insert: {
          confidence_threshold?: number | null
          created_at?: string
          display_name: string
          excluded_patterns?: Json | null
          id?: string
          is_enabled?: boolean
          last_scrape_at?: string | null
          last_success_at?: string | null
          max_concurrent_requests?: number | null
          max_price?: number | null
          min_estimated_value?: number | null
          min_price?: number | null
          notes?: string | null
          preferred_tlds?: Json | null
          priority_weight?: number | null
          rate_limit_per_minute?: number | null
          registrar_name: string
          scrape_interval_minutes?: number | null
          success_rate?: number | null
          total_domains_found?: number | null
          total_gems_found?: number | null
          updated_at?: string
          value_to_price_ratio?: number | null
        }
        Update: {
          confidence_threshold?: number | null
          created_at?: string
          display_name?: string
          excluded_patterns?: Json | null
          id?: string
          is_enabled?: boolean
          last_scrape_at?: string | null
          last_success_at?: string | null
          max_concurrent_requests?: number | null
          max_price?: number | null
          min_estimated_value?: number | null
          min_price?: number | null
          notes?: string | null
          preferred_tlds?: Json | null
          priority_weight?: number | null
          rate_limit_per_minute?: number | null
          registrar_name?: string
          scrape_interval_minutes?: number | null
          success_rate?: number | null
          total_domains_found?: number | null
          total_gems_found?: number | null
          updated_at?: string
          value_to_price_ratio?: number | null
        }
        Relationships: []
      }
      scan_results: {
        Row: {
          algorithm_version: string | null
          availability_status: string
          check_method: string | null
          checked_at: string | null
          confidence_score: number
          created_at: string
          domain: string
          estimated_value: number
          id: string
          is_valuated: boolean
          model_count: number | null
          rationale: string | null
          price_source: string | null
          registrar_price: number
          registrar_url: string | null
          scan_id: string
          tld: string
          valuation_signals: Json
        }
        Insert: {
          algorithm_version?: string | null
          availability_status?: string
          check_method?: string | null
          checked_at?: string | null
          confidence_score?: number
          created_at?: string
          domain: string
          estimated_value?: number
          id?: string
          is_valuated?: boolean
          model_count?: number | null
          rationale?: string | null
          price_source?: string | null
          registrar_price: number
          registrar_url?: string | null
          scan_id: string
          tld: string
          valuation_signals?: Json
        }
        Update: {
          algorithm_version?: string | null
          availability_status?: string
          check_method?: string | null
          checked_at?: string | null
          confidence_score?: number
          created_at?: string
          domain?: string
          estimated_value?: number
          id?: string
          is_valuated?: boolean
          model_count?: number | null
          rationale?: string | null
          price_source?: string | null
          registrar_price?: number
          registrar_url?: string | null
          scan_id?: string
          tld?: string
          valuation_signals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "user_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_domains: {
        Row: {
          category: string | null
          confidence_score: number | null
          created_at: string
          domain: string
          estimated_value: number | null
          has_website: boolean | null
          hosting: string | null
          id: string
          is_live: boolean | null
          notes: string | null
          purchase_date: string | null
          purchase_price: number | null
          updated_at: string
          user_id: string
          valuation_rationale: string | null
          valuation_algorithm_version: string | null
          valuation_signals: Json
          valued_at: string | null
          website_checked_at: string | null
        }
        Insert: {
          category?: string | null
          confidence_score?: number | null
          created_at?: string
          domain: string
          estimated_value?: number | null
          has_website?: boolean | null
          hosting?: string | null
          id?: string
          is_live?: boolean | null
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          updated_at?: string
          user_id: string
          valuation_rationale?: string | null
          valuation_algorithm_version?: string | null
          valuation_signals?: Json
          valued_at?: string | null
          website_checked_at?: string | null
        }
        Update: {
          category?: string | null
          confidence_score?: number | null
          created_at?: string
          domain?: string
          estimated_value?: number | null
          has_website?: boolean | null
          hosting?: string | null
          id?: string
          is_live?: boolean | null
          notes?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          updated_at?: string
          user_id?: string
          valuation_rationale?: string | null
          valuation_algorithm_version?: string | null
          valuation_signals?: Json
          valued_at?: string | null
          website_checked_at?: string | null
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
      user_scans: {
        Row: {
          completed_at: string | null
          created_at: string
          dispatch_token: string | null
          execution_mode: string
          execution_started_at: string | null
          id: string
          request_origin: string
          scan_mode: string
          search_keyword: string | null
          selected_tlds: string[]
          status: string
          total_domains_scanned: number
          updated_at: string
          user_id: string
          worker_claimed_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dispatch_token?: string | null
          execution_mode?: string
          execution_started_at?: string | null
          id?: string
          request_origin?: string
          scan_mode?: string
          search_keyword?: string | null
          selected_tlds?: string[]
          status?: string
          total_domains_scanned?: number
          updated_at?: string
          user_id: string
          worker_claimed_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dispatch_token?: string | null
          execution_mode?: string
          execution_started_at?: string | null
          id?: string
          request_origin?: string
          scan_mode?: string
          search_keyword?: string | null
          selected_tlds?: string[]
          status?: string
          total_domains_scanned?: number
          updated_at?: string
          user_id?: string
          worker_claimed_at?: string | null
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          confidence_score: number
          created_at: string
          domain: string
          estimated_value: number
          id: string
          rationale: string | null
          registrar_price: number
          user_id: string
        }
        Insert: {
          confidence_score: number
          created_at?: string
          domain: string
          estimated_value: number
          id?: string
          rationale?: string | null
          registrar_price: number
          user_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          domain?: string
          estimated_value?: number
          id?: string
          rationale?: string | null
          registrar_price?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      marketplace_active_domain_listings: {
        Row: {
          asking_price: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          domain: string | null
          expires_at: string | null
          id: string | null
          published_at: string | null
          seller_display_name: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cancel_user_scan: {
        Args: {
          p_scan_id: string
        }
        Returns: boolean
      }
      claim_next_trusted_user_scan: {
        Args: Record<PropertyKey, never>
        Returns: {
          dispatch_token: string
          scan_id: string
        }[]
      }
      begin_marketplace_domain_control_proof: {
        Args: {
          p_listing_id: string
        }
        Returns: {
          challenge_record: string
          challenge_token: string
          created_at: string
          expires_at: string
          id: string
          listing_id: string
          status: Database["public"]["Enums"]["marketplace_domain_control_proof_status"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      marketplace_is_registrable_domain: {
        Args: {
          p_domain: string
        }
        Returns: boolean
      }
      record_marketplace_domain_control_result: {
        Args: {
          p_proof_id: string
          p_publish?: boolean
          p_verified: boolean
          p_verifier_note?: string | null
        }
        Returns: Database["public"]["Enums"]["marketplace_listing_status"]
      }
      request_user_scan: {
        Args: {
          p_execution_mode?: string
          p_scan_mode: string
          p_search_keyword?: string | null
          p_selected_tlds: string[]
        }
        Returns: string
      }
      submit_marketplace_domain_control_proof: {
        Args: {
          p_proof_id: string
        }
        Returns: Database["public"]["Enums"]["marketplace_domain_control_proof_status"]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      marketplace_domain_control_proof_status:
        | "challenge_issued"
        | "submitted"
        | "verified"
        | "expired"
        | "rejected"
      marketplace_listing_status:
        | "seller_declared"
        | "proof_pending"
        | "under_review"
        | "active"
        | "paused"
        | "withdrawn"
        | "sold"
        | "rejected"
      marketplace_offer_status:
        | "submitted"
        | "withdrawn"
        | "accepted"
        | "declined"
        | "expired"
      marketplace_ownership_verification_status:
        | "not_requested"
        | "challenge_issued"
        | "pending_review"
        | "verified"
        | "rejected"
        | "expired"
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
      marketplace_domain_control_proof_status: [
        "challenge_issued",
        "submitted",
        "verified",
        "expired",
        "rejected",
      ],
      marketplace_listing_status: [
        "seller_declared",
        "proof_pending",
        "under_review",
        "active",
        "paused",
        "withdrawn",
        "sold",
        "rejected",
      ],
      marketplace_offer_status: [
        "submitted",
        "withdrawn",
        "accepted",
        "declined",
        "expired",
      ],
      marketplace_ownership_verification_status: [
        "not_requested",
        "challenge_issued",
        "pending_review",
        "verified",
        "rejected",
        "expired",
      ],
    },
  },
} as const
