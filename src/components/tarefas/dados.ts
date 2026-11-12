import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/juridico-db';
import type { Setor, Tarefa } from '@/lib/tarefas';

export function useSetores() {
  return useQuery({
    queryKey: ['setores'],
    queryFn: async () => {
      const { data, error } = await db.from('setores').select('*').order('ordem').order('nome');
      if (error) throw error;
      return (data ?? []) as Setor[];
    },
  });
}

export function useSetorMembros() {
  return useQuery({
    queryKey: ['setor-membros'],
    queryFn: async () => {
      const { data, error } = await db.from('setor_membros').select('setor_id, user_id');
      if (error) throw error;
      return (data ?? []) as { setor_id: string; user_id: string }[];
    },
  });
}

export function useTarefas() {
  return useQuery({
    queryKey: ['tarefas'],
    queryFn: async () => {
      // abertas + concluídas nos últimos 30 dias
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await db.from('tarefas').select('*')
        .or(`status.in.(a_fazer,fazendo,aguardando),concluida_em.gte.${desde}`)
        .order('prazo', { ascending: true, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map(t => ({ ...t, checklist: Array.isArray(t.checklist) ? t.checklist : [] })) as Tarefa[];
    },
    refetchInterval: 60_000,
  });
}
