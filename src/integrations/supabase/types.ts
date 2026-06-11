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
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          resource_id: string | null
          resource_type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          resource_id?: string | null
          resource_type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cedentes: {
        Row: {
          activo: boolean
          cargo: string | null
          cedula: string | null
          created_at: string
          id: string
          nombre_comercial: string | null
          razon_social: string
          representante_legal: string | null
          rif: string
        }
        Insert: {
          activo?: boolean
          cargo?: string | null
          cedula?: string | null
          created_at?: string
          id?: string
          nombre_comercial?: string | null
          razon_social: string
          representante_legal?: string | null
          rif: string
        }
        Update: {
          activo?: boolean
          cargo?: string | null
          cedula?: string | null
          created_at?: string
          id?: string
          nombre_comercial?: string | null
          razon_social?: string
          representante_legal?: string | null
          rif?: string
        }
        Relationships: []
      }
      confirmaciones: {
        Row: {
          contraparte_razon_social: string
          created_at: string
          emision_id: string
          fecha_operacion: string
          fecha_valor: string
          id: string
          monto_efectivo_usd: number
          pdf_url: string | null
          tipo: Database["public"]["Enums"]["tipo_confirmacion"]
          valor_efectivo_bs: number
        }
        Insert: {
          contraparte_razon_social: string
          created_at?: string
          emision_id: string
          fecha_operacion: string
          fecha_valor: string
          id?: string
          monto_efectivo_usd: number
          pdf_url?: string | null
          tipo: Database["public"]["Enums"]["tipo_confirmacion"]
          valor_efectivo_bs: number
        }
        Update: {
          contraparte_razon_social?: string
          created_at?: string
          emision_id?: string
          fecha_operacion?: string
          fecha_valor?: string
          id?: string
          monto_efectivo_usd?: number
          pdf_url?: string | null
          tipo?: Database["public"]["Enums"]["tipo_confirmacion"]
          valor_efectivo_bs?: number
        }
        Relationships: [
          {
            foreignKeyName: "confirmaciones_emision_id_fkey"
            columns: ["emision_id"]
            isOneToOne: false
            referencedRelation: "emisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      emisiones: {
        Row: {
          cantidad_ordenes_compra: number
          cedente_id: string | null
          created_at: string
          descuento: number
          dias_colocados: number
          estado: string
          fecha_emision: string
          fecha_vencimiento: string
          financista_id: string | null
          id: string
          monto_efectivo_usd: number
          operador_id: string | null
          precio: number
          programa_id: string | null
          rendimiento_anualizado: number
          simbolo_cfb: string
          tasa_cambio_bs_usd: number
          valor_efectivo_bs: number
          valor_nominal_usd: number
        }
        Insert: {
          cantidad_ordenes_compra?: number
          cedente_id?: string | null
          created_at?: string
          descuento: number
          dias_colocados: number
          estado?: string
          fecha_emision: string
          fecha_vencimiento: string
          financista_id?: string | null
          id?: string
          monto_efectivo_usd: number
          operador_id?: string | null
          precio: number
          programa_id?: string | null
          rendimiento_anualizado: number
          simbolo_cfb: string
          tasa_cambio_bs_usd: number
          valor_efectivo_bs: number
          valor_nominal_usd: number
        }
        Update: {
          cantidad_ordenes_compra?: number
          cedente_id?: string | null
          created_at?: string
          descuento?: number
          dias_colocados?: number
          estado?: string
          fecha_emision?: string
          fecha_vencimiento?: string
          financista_id?: string | null
          id?: string
          monto_efectivo_usd?: number
          operador_id?: string | null
          precio?: number
          programa_id?: string | null
          rendimiento_anualizado?: number
          simbolo_cfb?: string
          tasa_cambio_bs_usd?: number
          valor_efectivo_bs?: number
          valor_nominal_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "emisiones_cedente_id_fkey"
            columns: ["cedente_id"]
            isOneToOne: false
            referencedRelation: "cedentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emisiones_financista_id_fkey"
            columns: ["financista_id"]
            isOneToOne: false
            referencedRelation: "financistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emisiones_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      financistas: {
        Row: {
          activo: boolean
          cargo: string | null
          cedula: string | null
          celular: string | null
          correo: string | null
          created_at: string
          id: string
          razon_social: string
          representante_legal: string | null
          rif: string | null
          tipo: Database["public"]["Enums"]["tipo_financista"]
        }
        Insert: {
          activo?: boolean
          cargo?: string | null
          cedula?: string | null
          celular?: string | null
          correo?: string | null
          created_at?: string
          id?: string
          razon_social: string
          representante_legal?: string | null
          rif?: string | null
          tipo?: Database["public"]["Enums"]["tipo_financista"]
        }
        Update: {
          activo?: boolean
          cargo?: string | null
          cedula?: string | null
          celular?: string | null
          correo?: string | null
          created_at?: string
          id?: string
          razon_social?: string
          representante_legal?: string | null
          rif?: string | null
          tipo?: Database["public"]["Enums"]["tipo_financista"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      programa_descuentos: {
        Row: {
          activo: boolean
          created_at: string
          descuento: number
          es_default: boolean
          etiqueta: string | null
          id: string
          programa_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descuento: number
          es_default?: boolean
          etiqueta?: string | null
          id?: string
          programa_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descuento?: number
          es_default?: boolean
          etiqueta?: string | null
          id?: string
          programa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programa_descuentos_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      programas: {
        Row: {
          activo: boolean
          cedente_id: string
          codigo_pcfb: string
          contrato_cesion: string | null
          created_at: string
          descuento_base: number
          estado: string
          fecha_inicio: string
          fecha_vencimiento: string
          id: string
          linea: string | null
          plazo_cuotas_dias: number
          plazo_ejecucion_dias: number
        }
        Insert: {
          activo?: boolean
          cedente_id: string
          codigo_pcfb: string
          contrato_cesion?: string | null
          created_at?: string
          descuento_base?: number
          estado?: string
          fecha_inicio: string
          fecha_vencimiento: string
          id?: string
          linea?: string | null
          plazo_cuotas_dias?: number
          plazo_ejecucion_dias?: number
        }
        Update: {
          activo?: boolean
          cedente_id?: string
          codigo_pcfb?: string
          contrato_cesion?: string | null
          created_at?: string
          descuento_base?: number
          estado?: string
          fecha_inicio?: string
          fecha_vencimiento?: string
          id?: string
          linea?: string | null
          plazo_cuotas_dias?: number
          plazo_ejecucion_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "programas_cedente_id_fkey"
            columns: ["cedente_id"]
            isOneToOne: false
            referencedRelation: "cedentes"
            referencedColumns: ["id"]
          },
        ]
      }
      role_section_permissions: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          section: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          section: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          section?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated_user: { Args: never; Returns: boolean }
      next_simbolo_cfb: { Args: never; Returns: string }
      next_simbolo_for_programa: {
        Args: { _programa_id: string }
        Returns: string
      }
      refresh_programas_estado: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "operador" | "backoffice"
      tipo_confirmacion: "CDC" | "CDV"
      tipo_financista: "natural" | "juridica"
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
      app_role: ["admin", "operador", "backoffice"],
      tipo_confirmacion: ["CDC", "CDV"],
      tipo_financista: ["natural", "juridica"],
    },
  },
} as const
