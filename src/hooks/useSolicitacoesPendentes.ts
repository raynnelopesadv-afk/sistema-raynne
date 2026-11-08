import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';

/** Nº de solicitações pendentes de aprovação — só consulta se for gestor. */
export function useSolicitacoesPendentes(): number {
  const { isGestor } = useUserRole();
  const { data } = useQuery({
    queryKey: ['solicitacoes-pendentes-count'],
    enabled: isGestor,
    queryFn: async () => {
      const { count } = await supabase
        .from('solicitacoes_alteracao')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente');
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
  return data ?? 0;
}
