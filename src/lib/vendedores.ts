import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export type Divisao = 'advogados' | 'educacao';
export type VendedorRole = 'sdr' | 'closer' | 'full_cycle';

export interface Vendedor {
  id: string;            // user_id
  nome: string;
  email: string | null;
  squad_id: string | null;
  divisao: Divisao | null;
  role: VendedorRole;
  meta_mes: number;
}

export async function fetchVendedores(divisao?: Divisao): Promise<Vendedor[]> {
  let query = supabase
    .from('closers')
    .select('id, nome, divisao, squad_id, meta_mes')
    .eq('ativo', true)
    .order('nome');

  if (divisao) query = query.eq('divisao', divisao);

  const { data, error } = await query;
  if (error) throw error;

  const list: Vendedor[] = (data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    email: null,
    squad_id: c.squad_id ?? null,
    divisao: c.divisao as Divisao,
    role: 'closer',
    meta_mes: Number(c.meta_mes ?? 0),
  }));

  return list.sort((a, b) => a.nome.localeCompare(b.nome));
}

export function useVendedores(divisao?: Divisao) {
  return useQuery({
    queryKey: ['vendedores', divisao ?? 'all'],
    queryFn: () => fetchVendedores(divisao),
  });
}
