// Motivos padronizados de desqualificação de contrato.
// Usados no diálogo de desqualificação e no relatório da aba Qualificação.
export const MOTIVOS_DESQUALIFICACAO = [
  'Litispendência',
  'Já tem advogado',
  'Não tem direito pela renda',
  'Não tem direito por falta de documentos médicos',
  'Não tem direito pela qualidade de segurado',
  'Motivo diverso',
] as const;

export type MotivoDesqualificacao = (typeof MOTIVOS_DESQUALIFICACAO)[number];

// ---------------------------------------------------------------------------
// Motivos personalizáveis por divisão (Config → Parâmetros)
// ---------------------------------------------------------------------------
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const MOTIVO_DIVERSO = 'Motivo diverso';
export const MOTIVOS_CONFIG_CHAVE = 'motivos_desqualificacao';

/** Garante lista válida: sem vazios/duplicados e com 'Motivo diverso' no fim. */
export function normalizarMotivos(lista: string[]): string[] {
  const semDiverso = lista
    .map(m => m.trim())
    .filter(Boolean)
    .filter(m => m !== MOTIVO_DIVERSO);
  return [...new Set(semDiverso), MOTIVO_DIVERSO];
}

/** Lista de motivos da divisão: personalizada (Config) ou padrão. */
export function useMotivosDesqualificacao(divisao: 'advogados' | 'educacao') {
  const { data } = useQuery({
    queryKey: ['motivos-desqualificacao', divisao],
    queryFn: async () => {
      const { data } = await supabase
        .from('config')
        .select('valor')
        .eq('divisao', divisao)
        .eq('chave', MOTIVOS_CONFIG_CHAVE)
        .maybeSingle();
      const lista = (data?.valor as string[] | null) ?? null;
      return Array.isArray(lista) && lista.length > 0
        ? normalizarMotivos(lista)
        : [...MOTIVOS_DESQUALIFICACAO];
    },
    staleTime: 60_000,
  });
  return data ?? [...MOTIVOS_DESQUALIFICACAO];
}
