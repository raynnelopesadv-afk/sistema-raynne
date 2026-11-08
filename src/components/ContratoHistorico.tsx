import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { History, Loader2 } from 'lucide-react';

const LABEL_CAMPO: Record<string, string> = {
  nome_cliente: 'Nome do cliente', cpf: 'CPF', telefone: 'Telefone', valor: 'Valor',
  product_id: 'Produto', closer_id: 'Closer', variante: 'Variante',
  data_fechamento: 'Data de fechamento', data_protocolo: 'Data de protocolo',
  data_pagamento_confirmado: 'Recebimento da inicial', data_recebimento: 'Data de recebimento',
  status_qualificacao: 'Status', valor_exito: 'Valor do êxito',
  valor_honorarios_recebidos: 'Honorários recebidos', uf: 'UF', origem_lead: 'Origem',
};

interface Item {
  id: number; campo: string; valor_antigo: string | null; valor_novo: string | null;
  alterado_por: string | null; alterado_em: string;
}

/** Histórico de alterações do contrato — visível apenas para o gestor. */
export function ContratoHistorico({ contratoId, isGestor }: { contratoId: string; isGestor: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['contrato-historico', contratoId],
    enabled: isGestor,
    queryFn: async () => {
      const [hist, profiles] = await Promise.all([
        supabase.from('contrato_historico').select('*').eq('contrato_id', contratoId).order('alterado_em', { ascending: false }).limit(100),
        supabase.from('profiles').select('user_id, display_name, email'),
      ]);
      const nomes = new Map((profiles.data ?? []).map(p => [p.user_id, p.display_name || p.email || '—']));
      return { itens: (hist.data ?? []) as Item[], nomes };
    },
  });

  if (!isGestor) return null;
  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>;
  const itens = data?.itens ?? [];
  if (itens.length === 0) return null;

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Histórico de alterações</p>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {itens.map(i => (
          <div key={i.id} className="text-[11px] border-b border-border/40 pb-1.5 last:border-0">
            <span className="text-muted-foreground">
              {new Date(i.alterado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {' · '}
              <span className="text-foreground">{data?.nomes.get(i.alterado_por ?? '') ?? (i.alterado_por ? 'usuário' : 'sistema')}</span>
              {' alterou '}
              <span className="text-foreground">{LABEL_CAMPO[i.campo] ?? i.campo}</span>
            </span>
            <div className="mt-0.5">
              <span className="line-through text-destructive/70">{i.valor_antigo || '(vazio)'}</span>
              <span className="text-muted-foreground mx-1">→</span>
              <span className="text-success">{i.valor_novo || '(vazio)'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
