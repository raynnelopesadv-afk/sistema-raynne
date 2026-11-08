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
      agendamentos: {
        Row: {
          closer_id: string | null
          created_at: string
          data_agendamento: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          nome_cliente: string
          observacoes: string | null
          status: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          closer_id?: string | null
          created_at?: string
          data_agendamento: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          nome_cliente: string
          observacoes?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          closer_id?: string | null
          created_at?: string
          data_agendamento?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          nome_cliente?: string
          observacoes?: string | null
          status?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_fechados: {
        Row: {
          cadastrado_por_usuario_id: string | null
          cadastro_retroativo: boolean
          dc_business_id: string | null
          dc_lead_id: string | null
          incompleto: boolean
          origem: string
          origem_lead: string
          uf: string | null
          data_criacao_lead: string | null
          criacao_lead_em: string | null
          conta_fechamento: boolean
          campos_personalizados: Json
          closer_id: string | null
          considerar_comissao_retroativa: boolean
          cpf: string | null
          created_at: string
          data_cadastro_retroativo: string | null
          data_desqualificacao: string | null
          data_encerramento: string | null
          data_fechamento: string | null
          data_pagamento_confirmado: string | null
          data_protocolo: string | null
          data_recebimento: string | null
          divisao: Database["public"]["Enums"]["divisao"]
          etapa_processo: Database["public"]["Enums"]["etapa_processo"]
          fechado_em: string | null
          fechado_por_ia: boolean
          filial: string | null
          forma_recebimento: string | null
          id: string
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          motivo_desqualificacao: string | null
          motivo_encerramento: string | null
          nome_cliente: string
          numero_protocolo: string | null
          observacoes_protocolo: string | null
          observacoes_retroativas: string | null
          product_id: string | null
          protocolado: boolean
          qualificado_em: string | null
          status_qualificacao: Database["public"]["Enums"]["cliente_status"]
          telefone: string | null
          teve_exito: boolean | null
          tipo_processo: string | null
          updated_at: string
          valor: number
          valor_exito: number
          variante: string | null
          valor_honorarios_recebidos: number
        }
        Insert: {
          cadastrado_por_usuario_id?: string | null
          cadastro_retroativo?: boolean
          dc_business_id?: string | null
          dc_lead_id?: string | null
          incompleto?: boolean
          origem?: string
          origem_lead?: string
          uf?: string | null
          data_criacao_lead?: string | null
          criacao_lead_em?: string | null
          conta_fechamento?: boolean
          campos_personalizados?: Json
          closer_id?: string | null
          considerar_comissao_retroativa?: boolean
          cpf?: string | null
          created_at?: string
          data_cadastro_retroativo?: string | null
          data_desqualificacao?: string | null
          data_encerramento?: string | null
          data_fechamento?: string | null
          data_pagamento_confirmado?: string | null
          data_protocolo?: string | null
          data_recebimento?: string | null
          divisao: Database["public"]["Enums"]["divisao"]
          etapa_processo?: Database["public"]["Enums"]["etapa_processo"]
          fechado_em?: string | null
          fechado_por_ia?: boolean
          filial?: string | null
          forma_recebimento?: string | null
          id?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          motivo_desqualificacao?: string | null
          motivo_encerramento?: string | null
          nome_cliente: string
          numero_protocolo?: string | null
          observacoes_protocolo?: string | null
          observacoes_retroativas?: string | null
          product_id?: string | null
          protocolado?: boolean
          qualificado_em?: string | null
          status_qualificacao?: Database["public"]["Enums"]["cliente_status"]
          telefone?: string | null
          teve_exito?: boolean | null
          tipo_processo?: string | null
          updated_at?: string
          valor?: number
          valor_exito?: number
          valor_honorarios_recebidos?: number
          variante?: string | null
        }
        Update: {
          cadastrado_por_usuario_id?: string | null
          cadastro_retroativo?: boolean
          dc_business_id?: string | null
          dc_lead_id?: string | null
          incompleto?: boolean
          origem?: string
          origem_lead?: string
          uf?: string | null
          data_criacao_lead?: string | null
          criacao_lead_em?: string | null
          conta_fechamento?: boolean
          campos_personalizados?: Json
          closer_id?: string | null
          considerar_comissao_retroativa?: boolean
          cpf?: string | null
          created_at?: string
          data_cadastro_retroativo?: string | null
          data_desqualificacao?: string | null
          data_encerramento?: string | null
          data_fechamento?: string | null
          data_pagamento_confirmado?: string | null
          data_protocolo?: string | null
          data_recebimento?: string | null
          divisao?: Database["public"]["Enums"]["divisao"]
          etapa_processo?: Database["public"]["Enums"]["etapa_processo"]
          fechado_em?: string | null
          fechado_por_ia?: boolean
          filial?: string | null
          forma_recebimento?: string | null
          id?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          motivo_desqualificacao?: string | null
          motivo_encerramento?: string | null
          nome_cliente?: string
          numero_protocolo?: string | null
          observacoes_protocolo?: string | null
          observacoes_retroativas?: string | null
          product_id?: string | null
          protocolado?: boolean
          qualificado_em?: string | null
          status_qualificacao?: Database["public"]["Enums"]["cliente_status"]
          telefone?: string | null
          teve_exito?: boolean | null
          tipo_processo?: string | null
          updated_at?: string
          valor?: number
          valor_exito?: number
          valor_honorarios_recebidos?: number
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_fechados_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_fechados_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bonificacao_recebimento_regras: {
        Row: {
          created_at: string
          forma: string
          id: string
          product_id: string
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          forma: string
          id?: string
          product_id: string
          tipo: string
          user_id: string
          valor?: number
        }
        Update: {
          created_at?: string
          forma?: string
          id?: string
          product_id?: string
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "bonificacao_recebimento_regras_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_alteracao: {
        Row: {
          contrato_id: string | null
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          id: string
          motivo: string
          payload: Json
          resposta: string | null
          solicitante: string
          status: string
          tipo: string
        }
        Insert: {
          contrato_id?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          motivo: string
          payload?: Json
          resposta?: string | null
          solicitante: string
          status?: string
          tipo: string
        }
        Update: {
          contrato_id?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          motivo?: string
          payload?: Json
          resposta?: string | null
          solicitante?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_alteracao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "clientes_fechados"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissoes: {
        Row: {
          created_at: string
          id: string
          permissao: string
          permitido: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissao: string
          permitido: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissao?: string
          permitido?: boolean
          user_id?: string
        }
        Relationships: []
      }
      funil_classificacao: {
        Row: { pipeline_id: string; stage_id: string; tipo: string; updated_at: string }
        Insert: { pipeline_id: string; stage_id: string; tipo: string; updated_at?: string }
        Update: { pipeline_id?: string; stage_id?: string; tipo?: string; updated_at?: string }
        Relationships: []
      }
      contrato_parcelas: {
        Row: { id: string; contrato_id: string; numero: number; valor: number; vencimento: string | null; pago: boolean; data_pagamento: string | null; observacao: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; contrato_id: string; numero: number; valor?: number; vencimento?: string | null; pago?: boolean; data_pagamento?: string | null; observacao?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; contrato_id?: string; numero?: number; valor?: number; vencimento?: string | null; pago?: boolean; data_pagamento?: string | null; observacao?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      contrato_historico: {
        Row: { id: number; contrato_id: string; campo: string; valor_antigo: string | null; valor_novo: string | null; alterado_por: string | null; alterado_em: string }
        Insert: { id?: number; contrato_id: string; campo: string; valor_antigo?: string | null; valor_novo?: string | null; alterado_por?: string | null; alterado_em?: string }
        Update: { id?: number; contrato_id?: string; campo?: string; valor_antigo?: string | null; valor_novo?: string | null; alterado_por?: string | null; alterado_em?: string }
        Relationships: []
      }
      product_campos: {
        Row: { id: string; product_id: string; label: string; tipo: string; opcoes: string[]; obrigatorio: boolean; ordem: number; ativo: boolean; visivel_kanban: boolean; created_at: string }
        Insert: { id?: string; product_id: string; label: string; tipo: string; opcoes?: string[]; obrigatorio?: boolean; ordem?: number; ativo?: boolean; visivel_kanban?: boolean; created_at?: string }
        Update: { id?: string; product_id?: string; label?: string; tipo?: string; opcoes?: string[]; obrigatorio?: boolean; ordem?: number; ativo?: boolean; visivel_kanban?: boolean; created_at?: string }
        Relationships: []
      }
      datacrazy_funil_cache: {
        Row: { chave: string; payload: Json; updated_at: string }
        Insert: { chave: string; payload: Json; updated_at?: string }
        Update: { chave?: string; payload?: Json; updated_at?: string }
        Relationships: []
      }
      career_levels: {
        Row: {
          ativo: boolean
          bonus_combo: number
          created_at: string
          honorario_fixo: number
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          bonus_combo?: number
          created_at?: string
          honorario_fixo?: number
          id?: string
          nome: string
          ordem: number
        }
        Update: {
          ativo?: boolean
          bonus_combo?: number
          created_at?: string
          honorario_fixo?: number
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      product_metas: {
        Row: {
          career_level_id: string
          created_at: string
          id: string
          meta_contratos: number
          product_id: string
        }
        Insert: {
          career_level_id: string
          created_at?: string
          id?: string
          meta_contratos?: number
          product_id: string
        }
        Update: {
          career_level_id?: string
          created_at?: string
          id?: string
          meta_contratos?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_metas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_metas_career_level_id_fkey"
            columns: ["career_level_id"]
            isOneToOne: false
            referencedRelation: "career_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      product_commission_stages: {
        Row: {
          career_level_id: string
          created_at: string
          etapa: string
          id: string
          product_id: string
          valor: number
          variante: string | null
        }
        Insert: {
          career_level_id: string
          created_at?: string
          etapa: string
          id?: string
          product_id: string
          valor?: number
          variante?: string | null
        }
        Update: {
          career_level_id?: string
          created_at?: string
          etapa?: string
          id?: string
          product_id?: string
          valor?: number
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_commission_stages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_commission_stages_career_level_id_fkey"
            columns: ["career_level_id"]
            isOneToOne: false
            referencedRelation: "career_levels"
            referencedColumns: ["id"]
          },
        ]
      }
      closers: {
        Row: {
          ativo: boolean
          career_level_id: string | null
          foto_url: string | null
          operacao_product_ids: string[]
          created_at: string
          data_desligamento: string | null
          divisao: Database["public"]["Enums"]["divisao"]
          filial: string | null
          funcao: string | null
          id: string
          meta_dia: number
          email: string | null
          meta_mes: number
          nome: string
          squad_id: string | null
          status: Database["public"]["Enums"]["closer_status"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          career_level_id?: string | null
          foto_url?: string | null
          operacao_product_ids?: string[]
          created_at?: string
          data_desligamento?: string | null
          divisao: Database["public"]["Enums"]["divisao"]
          filial?: string | null
          funcao?: string | null
          id?: string
          meta_dia?: number
          email?: string | null
          meta_mes?: number
          nome: string
          squad_id?: string | null
          status?: Database["public"]["Enums"]["closer_status"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          career_level_id?: string | null
          foto_url?: string | null
          operacao_product_ids?: string[]
          created_at?: string
          data_desligamento?: string | null
          divisao?: Database["public"]["Enums"]["divisao"]
          filial?: string | null
          funcao?: string | null
          id?: string
          meta_dia?: number
          email?: string | null
          meta_mes?: number
          nome?: string
          squad_id?: string | null
          status?: Database["public"]["Enums"]["closer_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "closers_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          chave: string | null
          created_at: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          meta_mensal: number | null
          updated_at: string
          valor: Json | null
        }
        Insert: {
          chave?: string | null
          created_at?: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          meta_mensal?: number | null
          updated_at?: string
          valor?: Json | null
        }
        Update: {
          chave?: string | null
          created_at?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          meta_mensal?: number | null
          updated_at?: string
          valor?: Json | null
        }
        Relationships: []
      }
      faturamento_mensal: {
        Row: {
          ano: number
          created_at: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          mes: number
          updated_at: string
          valor: number
        }
        Insert: {
          ano: number
          created_at?: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          mes: number
          updated_at?: string
          valor?: number
        }
        Update: {
          ano?: number
          created_at?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          mes?: number
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      funis: {
        Row: {
          created_at: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_sync_logs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          integration: string
          items: number
          ok: boolean | null
          started_at: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          integration: string
          items?: number
          ok?: boolean | null
          started_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          integration?: string
          items?: number
          ok?: boolean | null
          started_at?: string
        }
        Relationships: []
      }
      lead_class_map: {
        Row: {
          classification: string
          label_id: string
        }
        Insert: {
          classification: string
          label_id: string
        }
        Update: {
          classification?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_class_map_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: true
            referencedRelation: "lh_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      lh_labels: {
        Row: {
          id: string
          kind: string
          name: string
          synced_at: string
        }
        Insert: {
          id: string
          kind: string
          name: string
          synced_at?: string
        }
        Update: {
          id?: string
          kind?: string
          name?: string
          synced_at?: string
        }
        Relationships: []
      }
      lh_leads: {
        Row: {
          agent_id: string | null
          connection_id: string | null
          contact_name: string | null
          contact_number: string | null
          created_at: string | null
          department_id: string | null
          id: string
          integration: string | null
          raw: Json | null
          source_id: string | null
          status_id: string | null
          synced_at: string
          tags: string[]
          ticket_status: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          connection_id?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string | null
          department_id?: string | null
          id: string
          integration?: string | null
          raw?: Json | null
          source_id?: string | null
          status_id?: string | null
          synced_at?: string
          tags?: string[]
          ticket_status?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          connection_id?: string | null
          contact_name?: string | null
          contact_number?: string | null
          created_at?: string | null
          department_id?: string | null
          id?: string
          integration?: string | null
          raw?: Json | null
          source_id?: string | null
          status_id?: string | null
          synced_at?: string
          tags?: string[]
          ticket_status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      meta_ads: {
        Row: {
          adset_id: string | null
          campaign_id: string | null
          creative_body: string | null
          creative_id: string | null
          creative_thumbnail_url: string | null
          creative_title: string | null
          id: string
          name: string
          raw: Json | null
          status: string | null
          synced_at: string
        }
        Insert: {
          adset_id?: string | null
          campaign_id?: string | null
          creative_body?: string | null
          creative_id?: string | null
          creative_thumbnail_url?: string | null
          creative_title?: string | null
          id: string
          name: string
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Update: {
          adset_id?: string | null
          campaign_id?: string | null
          creative_body?: string | null
          creative_id?: string | null
          creative_thumbnail_url?: string | null
          creative_title?: string | null
          id?: string
          name?: string
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ads_adset_id_fkey"
            columns: ["adset_id"]
            isOneToOne: false
            referencedRelation: "meta_adsets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_adsets: {
        Row: {
          campaign_id: string | null
          id: string
          name: string
          raw: Json | null
          status: string | null
          synced_at: string
        }
        Insert: {
          campaign_id?: string | null
          id: string
          name: string
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Update: {
          campaign_id?: string | null
          id?: string
          name?: string
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_adsets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "meta_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_campaigns: {
        Row: {
          daily_budget: number | null
          id: string
          name: string
          objective: string | null
          raw: Json | null
          status: string | null
          synced_at: string
        }
        Insert: {
          daily_budget?: number | null
          id: string
          name: string
          objective?: string | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Update: {
          daily_budget?: number | null
          id?: string
          name?: string
          objective?: string | null
          raw?: Json | null
          status?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      meta_insights_daily: {
        Row: {
          ad_id: string
          clicks: number
          conversations: number
          cpc: number | null
          cpm: number | null
          ctr: number | null
          date: string
          frequency: number | null
          impressions: number
          leads: number
          raw_actions: Json | null
          reach: number
          spend: number
          synced_at: string
        }
        Insert: {
          ad_id: string
          clicks?: number
          conversations?: number
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date: string
          frequency?: number | null
          impressions?: number
          leads?: number
          raw_actions?: Json | null
          reach?: number
          spend?: number
          synced_at?: string
        }
        Update: {
          ad_id?: string
          clicks?: number
          conversations?: number
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          date?: string
          frequency?: number | null
          impressions?: number
          leads?: number
          raw_actions?: Json | null
          reach?: number
          spend?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_insights_daily_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "meta_ads"
            referencedColumns: ["id"]
          },
        ]
      }
      processos: {
        Row: {
          cliente_id: string | null
          closer_id: string | null
          created_at: string
          created_by: string | null
          descricao: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          product_id: string | null
          status: Database["public"]["Enums"]["processo_status"]
          tipo: Database["public"]["Enums"]["processo_tipo"]
          updated_at: string
          valor: number
        }
        Insert: {
          cliente_id?: string | null
          closer_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          product_id?: string | null
          status?: Database["public"]["Enums"]["processo_status"]
          tipo?: Database["public"]["Enums"]["processo_tipo"]
          updated_at?: string
          valor?: number
        }
        Update: {
          cliente_id?: string | null
          closer_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          product_id?: string | null
          status?: Database["public"]["Enums"]["processo_status"]
          tipo?: Database["public"]["Enums"]["processo_tipo"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "processos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fechados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ativo: boolean
          created_at: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          nome: string
          exito_probabilidade: number | null
          exito_tipo: string
          exito_valor: number
          projecao_soma_inicial: boolean
          short: string | null
          tem_honorarios_iniciais: boolean
          ticket_medio: number
          tipo: string | null
          updated_at: string
          valor: number
          variantes: string[]
          sku: string | null
          variantes_config: Json
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          nome: string
          exito_probabilidade?: number | null
          exito_tipo?: string
          exito_valor?: number
          projecao_soma_inicial?: boolean
          short?: string | null
          tem_honorarios_iniciais?: boolean
          ticket_medio?: number
          tipo?: string | null
          updated_at?: string
          valor?: number
          variantes?: string[]
          sku?: string | null
          variantes_config?: Json
        }
        Update: {
          ativo?: boolean
          created_at?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          nome?: string
          exito_probabilidade?: number | null
          exito_tipo?: string
          exito_valor?: number
          projecao_soma_inicial?: boolean
          short?: string | null
          tem_honorarios_iniciais?: boolean
          ticket_medio?: number
          tipo?: string | null
          updated_at?: string
          valor?: number
          variantes?: string[]
          sku?: string | null
          variantes_config?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          meta_mes: number
          percentual_comissao_qualificacao: number
          squad_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          meta_mes?: number
          percentual_comissao_qualificacao?: number
          squad_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          meta_mes?: number
          percentual_comissao_qualificacao?: number
          squad_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_squad_id_fkey"
            columns: ["squad_id"]
            isOneToOne: false
            referencedRelation: "squads"
            referencedColumns: ["id"]
          },
        ]
      }
      squads: {
        Row: {
          ativo: boolean
          bandeira_url: string | null
          created_at: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          meta_mensal: number
          motto: string | null
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bandeira_url?: string | null
          created_at?: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          meta_mensal?: number
          motto?: string | null
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bandeira_url?: string | null
          created_at?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          meta_mensal?: number
          motto?: string | null
          nome?: string
          updated_at?: string
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
      vendas: {
        Row: {
          cliente_id: string | null
          closer_id: string | null
          created_at: string
          divisao: Database["public"]["Enums"]["divisao"]
          id: string
          product_id: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          cliente_id?: string | null
          closer_id?: string | null
          created_at?: string
          divisao: Database["public"]["Enums"]["divisao"]
          id?: string
          product_id?: string | null
          updated_at?: string
          valor_total?: number
        }
        Update: {
          cliente_id?: string | null
          closer_id?: string | null
          created_at?: string
          divisao?: Database["public"]["Enums"]["divisao"]
          id?: string
          product_id?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_fechados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "closers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      is_gestor_or_operador: { Args: { _user_id: string }; Returns: boolean }
      is_vendas: { Args: { _user_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_closer_from_profile: {
        Args: { _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "gestor"
        | "usuario"
        | "operador_tecnico"
        | "sdr"
        | "closer"
        | "full_cycle"
        | "agencia"
      cliente_status: "pendente" | "qualificado" | "desqualificado" | "desistencia"
      closer_status: "ativo" | "desligado" | "externo"
      divisao: "advogados" | "educacao"
      etapa_processo:
        | "aguardando"
        | "entrada"
        | "judicial"
        | "administrativo"
        | "fundo_investimento"
      processo_status: "em_andamento" | "vendido"
      processo_tipo: "judicial" | "administrativo"
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
      app_role: [
        "gestor",
        "usuario",
        "operador_tecnico",
        "sdr",
        "closer",
        "full_cycle",
        "agencia",
      ],
      cliente_status: ["pendente", "qualificado", "desqualificado", "desistencia"],
      closer_status: ["ativo", "desligado", "externo"],
      divisao: ["advogados", "educacao"],
      etapa_processo: [
        "aguardando",
        "entrada",
        "judicial",
        "administrativo",
        "fundo_investimento",
      ],
      processo_status: ["em_andamento", "vendido"],
      processo_tipo: ["judicial", "administrativo"],
    },
  },
} as const
