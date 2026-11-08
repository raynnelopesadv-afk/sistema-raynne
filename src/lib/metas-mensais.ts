// Helpers para metas mensais (overrides por mês) armazenadas em `config`.
// Não criamos novas tabelas: usamos chaves padronizadas em config.valor (jsonb).
//
// Chaves usadas:
//   - metas_mes:YYYY-MM         → override mensal das metas da divisão (mesmo formato de metas_mes)
//   - squad_metas:YYYY-MM       → { [squad_id]: number } overrides por squad
//   - closer_metas:YYYY-MM      → { [user_id]: number } overrides por vendedor
//
// Fallbacks (quando o mês não tem override):
//   - Divisão: chave 'metas_mes' / coluna meta_mensal
//   - Squad: squads.meta_mensal
//   - Vendedor: profiles.meta_mes / closers.meta_mes

import { supabase } from '@/lib/supabase';

export type Divisao = 'advogados' | 'educacao';

export const SQUAD_METAS_KEY = (ym: string) => `squad_metas:${ym}`;
export const CLOSER_METAS_KEY = (ym: string) => `closer_metas:${ym}`;
export const DIVISION_METAS_KEY = (ym: string) => `metas_mes:${ym}`;

export async function fetchSquadMetaOverrides(divisao: Divisao, monthRef: string) {
  const { data } = await supabase
    .from('config')
    .select('valor')
    .eq('divisao', divisao)
    .eq('chave', SQUAD_METAS_KEY(monthRef))
    .maybeSingle();
  return ((data?.valor as Record<string, number>) ?? {});
}

export async function fetchCloserMetaOverrides(divisao: Divisao, monthRef: string) {
  const { data } = await supabase
    .from('config')
    .select('valor')
    .eq('divisao', divisao)
    .eq('chave', CLOSER_METAS_KEY(monthRef))
    .maybeSingle();
  return ((data?.valor as Record<string, number>) ?? {});
}

export async function upsertConfigJson(divisao: Divisao, chave: string, valor: unknown) {
  const v = valor as never;
  const { data: existing } = await supabase
    .from('config')
    .select('id')
    .eq('divisao', divisao)
    .eq('chave', chave)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('config').update({ valor: v }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('config').insert({ divisao, chave, valor: v } as never);
    if (error) throw error;
  }
}

