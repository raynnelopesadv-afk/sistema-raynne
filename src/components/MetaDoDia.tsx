import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';
import { cn } from '@/lib/utils';

type Divisao = 'advogados' | 'educacao';
const CHAVE = 'meta_fechamentos_dia';
const PADRAO = 3;

/** Meta diária de fechamentos: o escritório e cada pessoa contra a meta do dia. */
export function MetaDoDia({ divisao }: { divisao: Divisao }) {
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const qc = useQueryClient();
  const { isGestor } = useUserRole();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');

  const meta = useQuery({
    queryKey: ['meta-dia', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('config').select('id, valor').eq('divisao', divisao).eq('chave', CHAVE).maybeSingle();
      const v = Number((data?.valor as { meta?: number } | null)?.meta ?? PADRAO);
      return { id: data?.id ?? null, meta: v > 0 ? v : PADRAO };
    },
  });

  const fechados = useQuery({
    queryKey: ['meta-dia-fechados', divisao, hoje],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: cf, error }, { data: cl }] = await Promise.all([
        supabase.from('clientes_fechados').select('id, closer_id').eq('divisao', divisao).eq('data_fechamento', hoje),
        supabase.from('closers').select('id, nome').eq('divisao', divisao).eq('ativo', true),
      ]);
      if (error) throw error;
      const porPessoa = new Map<string, { nome: string; qtd: number }>();
      for (const c of cl ?? []) porPessoa.set(c.id, { nome: c.nome, qtd: 0 });
      for (const f of cf ?? []) {
        const k = f.closer_id ?? 'sem';
        if (!porPessoa.has(k)) porPessoa.set(k, { nome: 'Sem responsável', qtd: 0 });
        porPessoa.get(k)!.qtd += 1;
      }
      return { total: cf?.length ?? 0, pessoas: [...porPessoa.values()].sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome)) };
    },
  });

  const salvar = useMutation({
    mutationFn: async (nova: number) => {
      if (meta.data?.id) {
        const { error } = await supabase.from('config').update({ valor: { meta: nova } }).eq('id', meta.data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('config').insert({ divisao, chave: CHAVE, valor: { meta: nova } });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meta-dia', divisao] }); setEditando(false); toast.success('Meta do dia atualizada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const m = meta.data?.meta ?? PADRAO;
  const total = fechados.data?.total ?? 0;
  const batida = total >= m;
  const falta = Math.max(0, m - total);

  return (
    <section className="glass-card p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Meta do dia</p>
          <p className="titulo-pagina text-4xl mt-1 tabular-nums">
            {total} <span className="text-muted-foreground text-2xl">de {m} fechamentos</span>
          </p>
          <p className={cn('text-sm mt-1', batida ? 'text-emerald-700 font-medium' : 'text-muted-foreground')}>
            {batida ? (total > m ? `Meta batida, ${total - m} acima.` : 'Meta batida.') : `Faltam ${falta} para bater a meta de hoje.`}
          </p>
        </div>
        <div className="flex items-center gap-2" aria-label={`${total} de ${m}`}>
          {Array.from({ length: Math.max(m, total) }).map((_, i) => (
            <span key={i} className={cn(
              'h-10 w-10 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-colors',
              i < total ? 'bg-primary border-primary text-primary-foreground' : 'border-dashed border-[hsl(41_35%_75%)] text-muted-foreground',
            )}>{i + 1}</span>
          ))}
        </div>
      </div>

      {(fechados.data?.pessoas.length ?? 0) > 0 && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {fechados.data!.pessoas.map(p => (
            <div key={p.nome} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
              <span className="text-sm font-medium truncate">{p.nome}</span>
              <span className="flex items-center gap-1">
                {Array.from({ length: Math.max(m, p.qtd) }).map((_, i) => (
                  <span key={i} className={cn('h-2.5 w-2.5 rounded-full', i < p.qtd ? 'bg-primary' : 'bg-secondary border border-border')} />
                ))}
                <span className="ml-2 text-xs tabular-nums text-muted-foreground">{p.qtd}/{m}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {isGestor && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          {editando ? (
            <>
              <span>Meta diária:</span>
              <input type="number" min={1} max={99} value={valor} onChange={e => setValor(e.target.value)}
                className="w-16 rounded-md border border-input bg-card px-2 py-1 text-foreground" autoFocus />
              <button className="inline-flex items-center gap-1 text-primary font-medium" onClick={() => {
                const n = Number(valor);
                if (!n || n < 1) return toast.error('Informe um número a partir de 1.');
                salvar.mutate(n);
              }}><Check className="w-3.5 h-3.5" />Salvar</button>
            </>
          ) : (
            <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setValor(String(m)); setEditando(true); }}>
              <Pencil className="w-3.5 h-3.5" />Alterar meta diária
            </button>
          )}
        </div>
      )}
    </section>
  );
}
