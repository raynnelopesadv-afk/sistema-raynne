import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, X, CalendarClock, UserPlus2, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { LABEL_CAMPO_DATA } from '@/lib/travas';

interface Solicitacao {
  id: string;
  tipo: 'alterar_data' | 'novo_contrato_duplicado' | 'excluir_contrato';
  contrato_id: string | null;
  solicitante: string;
  motivo: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
}

function fmtData(d: unknown): string {
  if (!d || typeof d !== 'string') return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

/** Fila de solicitações pendentes — exclusiva do gestor. */
export function SolicitacoesGestor() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['solicitacoes-gestor'],
    queryFn: async () => {
      const [sol, profiles] = await Promise.all([
        supabase.from('solicitacoes_alteracao').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('user_id, display_name, email'),
      ]);
      if (sol.error) throw sol.error;
      const nomes = new Map((profiles.data ?? []).map(p => [p.user_id, p.display_name || p.email || '—']));
      return { solicitacoes: (sol.data ?? []) as Solicitacao[], nomes };
    },
    refetchInterval: 30_000,
  });

  const decidir = useMutation({
    mutationFn: async ({ s, aprovar }: { s: Solicitacao; aprovar: boolean }) => {
      if (aprovar) {
        if (s.tipo === 'alterar_data' && s.contrato_id) {
          const campo = String(s.payload.campo ?? '');
          const novo = String(s.payload.valor_novo ?? '');
          if (!campo || !novo) throw new Error('Solicitação sem dados suficientes');
          const { error } = await supabase.from('clientes_fechados')
            .update({ [campo]: novo } as never).eq('id', s.contrato_id);
          if (error) throw error;
        }
        if (s.tipo === 'novo_contrato_duplicado') {
          const contrato = s.payload.contrato as Record<string, unknown> | undefined;
          if (!contrato) throw new Error('Solicitação sem os dados do contrato');
          const { error } = await supabase.from('clientes_fechados')
            .insert({ ...contrato, status_qualificacao: 'pendente' } as never);
          if (error) throw error;
        }
        if (s.tipo === 'excluir_contrato' && s.contrato_id) {
          const { error } = await supabase.from('clientes_fechados').delete().eq('id', s.contrato_id);
          if (error) throw error;
        }
      }
      const { error } = await supabase.from('solicitacoes_alteracao').update({
        status: aprovar ? 'aprovada' : 'rejeitada',
        resposta: respostas[s.id]?.trim() || null,
        decidido_por: user!.id,
        decidido_em: new Date().toISOString(),
      }).eq('id', s.id);
      if (error) throw error;
    },
    onSuccess: (_, { aprovar }) => {
      qc.invalidateQueries({ queryKey: ['solicitacoes-gestor'] });
      qc.invalidateQueries({ queryKey: ['fechamento'] });
      qc.invalidateQueries({ queryKey: ['processos-contratos'] });
      qc.invalidateQueries({ queryKey: ['pendencias-espelhamento'] });
      toast.success(aprovar ? 'Solicitação aprovada e aplicada' : 'Solicitação rejeitada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const pendentes = (data?.solicitacoes ?? []).filter(s => s.status === 'pendente');
  const decididas = (data?.solicitacoes ?? []).filter(s => s.status !== 'pendente').slice(0, 15);

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Solicitações pendentes ({pendentes.length})</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Alterações de datas comissionadas e lançamentos de clientes repetidos exigem sua aprovação.
            Aprovar aplica a mudança automaticamente.
          </p>
        </div>
        {pendentes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
        ) : pendentes.map(s => (
          <div key={s.id} className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {s.tipo === 'alterar_data' ? <CalendarClock className="w-4 h-4 text-warning" /> : s.tipo === 'excluir_contrato' ? <Trash2 className="w-4 h-4 text-destructive" /> : <UserPlus2 className="w-4 h-4 text-warning" />}
              {s.tipo === 'alterar_data' ? 'Alterar data comissionada' : s.tipo === 'excluir_contrato' ? 'Excluir fechamento' : 'Lançar cliente repetido'}
              <span className="text-xs text-muted-foreground font-normal">
                · {data?.nomes.get(s.solicitante) ?? '—'} · {new Date(s.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {s.tipo === 'alterar_data' ? (
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Cliente:</span> {String(s.payload.nome_cliente ?? '—')} ·{' '}
                <span className="text-muted-foreground">{LABEL_CAMPO_DATA[String(s.payload.campo)] ?? String(s.payload.campo)}:</span>{' '}
                {fmtData(s.payload.valor_atual)} → <strong>{fmtData(s.payload.valor_novo)}</strong>
              </p>
            ) : s.tipo === 'excluir_contrato' ? (
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Cliente:</span> {String(s.payload.nome_cliente ?? '—')} ·{' '}
                <span className="text-destructive">exclusão do fechamento</span>
              </p>
            ) : (
              <p className="text-xs text-foreground">
                <span className="text-muted-foreground">Cliente:</span> {String((s.payload.contrato as Record<string, unknown>)?.nome_cliente ?? '—')} ·{' '}
                <span className="text-muted-foreground">já existe na base:</span> {String(s.payload.duplicado_de ?? '—')}
              </p>
            )}
            <p className="text-xs text-muted-foreground italic">"{s.motivo}"</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Textarea
                rows={1}
                className="flex-1 min-w-[200px] text-xs"
                placeholder="Resposta ao solicitante (opcional)"
                value={respostas[s.id] ?? ''}
                onChange={e => setRespostas(r => ({ ...r, [s.id]: e.target.value }))}
              />
              <Button size="sm" className="gap-1" disabled={decidir.isPending} onClick={() => decidir.mutate({ s, aprovar: true })}>
                <Check className="w-4 h-4" /> Aprovar
              </Button>
              <Button size="sm" variant="destructive" className="gap-1" disabled={decidir.isPending} onClick={() => decidir.mutate({ s, aprovar: false })}>
                <X className="w-4 h-4" /> Rejeitar
              </Button>
            </div>
          </div>
        ))}
      </div>

      {decididas.length > 0 && (
        <div className="glass-card p-5">
          <p className="text-sm font-semibold text-foreground mb-3">Histórico recente</p>
          <div className="space-y-1">
            {decididas.map(s => (
              <p key={s.id} className="text-xs text-muted-foreground">
                <span className={s.status === 'aprovada' ? 'text-success' : 'text-destructive'}>{s.status === 'aprovada' ? '✓' : '✗'}</span>{' '}
                {s.tipo === 'alterar_data' ? 'Alteração de data' : s.tipo === 'excluir_contrato' ? 'Exclusão' : 'Cliente repetido'} · {data?.nomes.get(s.solicitante) ?? '—'} · "{s.motivo.slice(0, 60)}{s.motivo.length > 60 ? '…' : ''}"
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
