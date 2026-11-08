import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/** Nº de fechamentos incompletos (vindos do Data Crazy com dados faltando). */
export function usePendenciasEspelhamento(): number {
  const { data } = useQuery({
    queryKey: ['pendencias-espelhamento'],
    queryFn: async () => {
      const { count } = await supabase
        .from('clientes_fechados')
        .select('*', { count: 'exact', head: true })
        .eq('incompleto', true);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
  return data ?? 0;
}
