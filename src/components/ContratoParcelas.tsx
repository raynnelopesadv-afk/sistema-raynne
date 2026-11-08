import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Check, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface Parcela {
  id: string;
  contrato_id: string;
  numero: number;
  valor: number;
  vencimento: string | null;
  pago: boolean;
  data_pagamento: string | null;
  observacao: string | null;
}

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }); }
function hoje() { return new Date().toISOString().slice(0, 10); }
function fmtBr(d?: string | null) { if (!d) return '—'; return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); }

/**
 * Lista de parcelas do contrato: valor, vencimento, pago (com data).
 * Ao quitar a última parcela, o banco preenche data_recebimento no contrato
 * (trigger sync_recebimento_por_parcelas), disparando a etapa de recebimento
 * na comissão. O closer é o próprio do contrato (herdado).
 */
export function ContratoParcelas({ contratoId, valorContrato, canEdit }: { contratoId: string; valorContrato: number; canEdit: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['parcelas', contratoId],
    queryFn: async () => {
      const { data, error } = await supabase.from('contrato_parcelas').select('*').eq('contrato_id', contratoId).order('numero');
      if (error) throw error;
      return (data ?? []) as Parcela[];
    },
  });

  const parcelas = data ?? [];
  const totais = useMemo(() => {
    const soma = parcelas.reduce((s, p) => s + Number(p.valor || 0), 0);
    const pago = parcelas.filter(p => p.pago).reduce((s, p) => s + Number(p.valor || 0), 0);
    const pagas = parcelas.filter(p => p.pago).length;
    const todasPagas = parcelas.length > 0 && pagas === parcelas.length;
    return { soma, pago, pagas, todasPagas };
  }, [parcelas]);

  const addOne = useMutation({
    mutationFn: async () => {
      const proximo = (parcelas[parcelas.length - 1]?.numero ?? 0) + 1;
      const { error } = await supabase.from('contrato_parcelas').insert({ contrato_id: contratoId, numero: proximo, valor: 0 } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parcelas', contratoId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const gerarN = useMutation({
    mutationFn: async (n: number) => {
      if (n < 1) return;
      const valor = Math.round((valorContrato / n) * 100) / 100;
      const rows = Array.from({ length: n }, (_, i) => ({ contrato_id: contratoId, numero: i + 1, valor } as never));
      const { error: dErr } = await supabase.from('contrato_parcelas').delete().eq('contrato_id', contratoId);
      if (dErr) throw dErr;
      const { error } = await supabase.from('contrato_parcelas').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['parcelas', contratoId] }); toast.success('Parcelas geradas'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Parcela> }) => {
      const { error } = await supabase.from('contrato_parcelas').update(patch as never).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parcelas', contratoId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('contrato_parcelas').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parcelas', contratoId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [gerarN_, setGerarN] = useState<string>('');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">Parcelas do contrato</p>
          <p className="text-[11px] text-muted-foreground">Ao marcar a <strong>última</strong> parcela como paga, o recebimento é registrado automaticamente e libera a comissão.</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={60} placeholder="ex.: 12" value={gerarN_} onChange={e => setGerarN(e.target.value)} className="w-24 h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={() => { const n = Math.max(1, Math.min(60, Number(gerarN_) || 0)); if (n > 0) { gerarN.mutate(n); setGerarN(''); } }}>Gerar</Button>
            <Button size="sm" variant="outline" onClick={() => addOne.mutate()}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : parcelas.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">Sem parcelas cadastradas. Use "Gerar" para dividir o valor do contrato em N parcelas iguais, ou "Adicionar" uma a uma.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground bg-muted/30">
              <tr>
                <th className="text-left px-3 py-2 w-10">#</th>
                <th className="text-right px-3 py-2 w-40">Valor (R$)</th>
                <th className="text-left px-3 py-2 w-40">Vencimento</th>
                <th className="text-center px-3 py-2 w-16">Pago</th>
                <th className="text-left px-3 py-2 w-40">Data do pagamento</th>
                {canEdit && <th className="w-10 px-2" />}
              </tr>
            </thead>
            <tbody>
              {parcelas.map(p => (
                <tr key={p.id} className={`border-t border-border ${p.pago ? 'bg-emerald-500/[0.06]' : ''}`}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.numero}</td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" inputMode="decimal" className="h-8 text-right text-sm w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:m-0" defaultValue={p.valor}
                      disabled={!canEdit}
                      onBlur={e => { const v = Number(e.target.value) || 0; if (v !== p.valor) upd.mutate({ id: p.id, patch: { valor: v } }); }} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="date" className="h-8 text-sm" defaultValue={p.vencimento ?? ''} disabled={!canEdit}
                      onBlur={e => { const v = e.target.value || null; if (v !== p.vencimento) upd.mutate({ id: p.id, patch: { vencimento: v } }); }} />
                  </td>
                  <td className="px-3 py-1 text-center">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => upd.mutate({ id: p.id, patch: { pago: !p.pago, data_pagamento: !p.pago ? (p.data_pagamento || hoje()) : null } })}
                      className={`inline-flex items-center justify-center w-6 h-6 rounded border ${p.pago ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-border text-muted-foreground hover:text-foreground'}`}
                      title={p.pago ? 'Desmarcar' : 'Marcar como pago'}
                    >
                      {p.pago ? <Check className="w-3.5 h-3.5" /> : ''}
                    </button>
                  </td>
                  <td className="px-2 py-1">
                    {p.pago ? (
                      <Input type="date" className="h-8 text-sm" defaultValue={p.data_pagamento ?? hoje()} disabled={!canEdit}
                        onBlur={e => { const v = e.target.value || null; if (v !== p.data_pagamento) upd.mutate({ id: p.id, patch: { data_pagamento: v } }); }} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-1 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del.mutate(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/20 text-xs">
                <td className="px-3 py-2 text-muted-foreground">Total</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{brl(totais.soma)}</td>
                <td className="px-3 py-2 text-muted-foreground">Pago: <span className="text-emerald-400 font-semibold">{brl(totais.pago)}</span></td>
                <td className="px-3 py-2 text-center text-muted-foreground">{totais.pagas}/{parcelas.length}</td>
                <td className="px-3 py-2">
                  {totais.todasPagas ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Quitado — última parcela vira a data de recebimento</span>
                  ) : (
                    <span className="text-muted-foreground">Falta{parcelas.length - totais.pagas > 1 ? 'm' : ''} {parcelas.length - totais.pagas}</span>
                  )}
                </td>
                {canEdit && <td />}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
