import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { padraoDaPermissao, type PermissaoChave } from '@/lib/permissoes';

/**
 * Permissões efetivas do usuário logado: override (user_permissoes) > padrão do papel.
 * Uso: const { can } = usePermissions();  if (can('lancar_venda')) ...
 */
export function usePermissions() {
  const { user } = useAuth();
  const { roles, isLoading: loadingRoles } = useUserRole();

  const { data: overrides, isLoading: loadingOverrides } = useQuery({
    queryKey: ['user-permissoes', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissoes')
        .select('permissao, permitido')
        .eq('user_id', user!.id);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach(r => { map[r.permissao] = r.permitido; });
      return map;
    },
    staleTime: 60_000,
  });

  function can(chave: PermissaoChave): boolean {
    const ov = overrides?.[chave];
    if (ov !== undefined) return ov;
    return padraoDaPermissao(chave, roles);
  }

  return { can, isLoading: loadingRoles || loadingOverrides };
}
