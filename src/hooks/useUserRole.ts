import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'gestor' | 'usuario' | 'operador_tecnico' | 'sdr' | 'closer' | 'full_cycle' | 'agencia';

const VENDAS_ROLES: AppRole[] = ['sdr', 'closer', 'full_cycle'];

export function useUserRole() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['user-roles', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map(r => r.role as AppRole);
    },
  });
  const roles = data ?? [];
  const isGestor = roles.includes('gestor');
  const isOperador = roles.includes('operador_tecnico');
  const isVendas = roles.some(r => VENDAS_ROLES.includes(r));
  const isAgencia = roles.includes('agencia');
  return {
    roles,
    isLoading,
    isGestor,
    isOperador,
    isVendas,
    isAgencia,
    canCadastrarVenda: isGestor || isVendas,
    canEditQualificacao: isGestor || isOperador,
  };
}
