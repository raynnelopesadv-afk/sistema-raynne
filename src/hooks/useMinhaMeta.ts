import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/juridico-db';
import { useAuth } from '@/contexts/AuthContext';
import { hojeISO } from '@/lib/juridico';
import { META_NUM, type Inscricao } from '@/lib/alertas';

export function useMinhaInscricao() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['alertas-inscricao', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await db.from('alertas_inscricoes').select('*').eq('user_id', user!.id).maybeSingle();
      if (error) return null; // módulo ainda não instalado
      return data as Inscricao | null;
    },
  });
}

/** Quanto a pessoa já fez hoje, conforme o setor da meta. */
export function useMinhaMeta() {
  const { user } = useAuth();
  const insc = useMinhaInscricao();
  const setor = insc.data?.setor_meta;
  const hoje = hojeISO();
  const progresso = useQuery({
    queryKey: ['minha-meta', user?.id, setor, hoje],
    enabled: !!user?.id && !!setor && setor !== 'gestao',
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      if (setor === 'juridico') {
        const { count } = await db.from('protocolos_operacional').select('id', { count: 'exact', head: true })
          .eq('colaborador_id', user!.id).eq('data', hoje);
        return { feito: count ?? 0, meta: META_NUM.juridico, unidade: 'protocolos' };
      }
      if (setor === 'prazos') {
        const { data } = await db.from('agenda_juridica').select('concluido')
          .eq('data', hoje).in('tipo', ['prazo', 'exigencia_inss']);
        const total = data?.length ?? 0;
        return { feito: (data ?? []).filter(d => d.concluido).length, meta: total, unidade: 'prazos' };
      }
      const email = (user!.email ?? '').toLowerCase();
      const { data: proprio } = await db.from('closers').select('id').eq('id', user!.id).maybeSingle();
      const { data: porEmail } = proprio ? { data: null } : await db.from('closers').select('id').ilike('email', email).maybeSingle();
      const c = proprio ?? porEmail;
      let feito = 0;
      if (c?.id) {
        const { data } = await db.from('clientes_fechados').select('status_qualificacao')
          .eq('closer_id', c.id)
          .or(`data_fechamento.eq.${hoje},and(data_fechamento.is.null,fechado_em.gte.${hoje}T00:00:00-03:00)`);
        feito = (data ?? []).filter(f => f.status_qualificacao !== 'desistencia').length;
      }
      return { feito, meta: META_NUM.comercial, unidade: 'contratos' };
    },
  });
  return { inscricao: insc.data, carregando: insc.isLoading, progresso: progresso.data };
}
