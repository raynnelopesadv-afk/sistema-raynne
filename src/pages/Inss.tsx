import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { db } from '@/lib/juridico-db';
import { fmtData, type RequerimentoInss } from '@/lib/juridico';
import { UrgenciaBadge } from '@/components/juridico/UrgenciaBadge';

type Aba = 'exigencias' | 'automaticas' | 'cumpridas' | 'todos';

const ABAS: { v: Aba; l: string }[] = [
  { v: 'exigencias', l: 'Exigências em aberto' },
  { v: 'automaticas', l: 'Cumpridas pelo sistema (perícia agendada)' },
  { v: 'cumpridas', l: 'Cumpridas pela equipe' },
  { v: 'todos', l: 'Todos os requerimentos' },
];

export default function Inss() {
  const [aba, setAba] = useState<Aba>('exigencias');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['inss'],
    queryFn: async () => {
      const { data, error } = await db.from('inss_requerimentos').select('*')
        .order('ultimo_aviso_em', { ascending: false }).limit(3000);
      if (error) throw error;
      return (data ?? []) as RequerimentoInss[];
    },
  });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let l = (data ?? []).filter(r => {
      const pend = (r.status ?? '').toUpperCase().startsWith('PENDENTE');
      if (aba === 'exigencias') return pend && !r.cumprido && !r.exigencia_automatica;
      if (aba === 'automaticas') return pend && r.exigencia_automatica && !r.cumprido;
      if (aba === 'cumpridas') return r.cumprido;
      return true;
    });
    if (t) l = l.filter(r => [r.cliente, r.protocolo, r.servico, r.unidade].some(x => x?.toLowerCase().includes(t)));
    if (aba === 'exigencias') l = [...l].sort((a, b) => (a.prazo_exigencia ?? '9').localeCompare(b.prazo_exigencia ?? '9'));
    return l;
  }, [data, aba, busca]);

  const contagem = useMemo(() => {
    const d = data ?? [];
    const pend = (r: RequerimentoInss) => (r.status ?? '').toUpperCase().startsWith('PENDENTE');
    return {
      exigencias: d.filter(r => pend(r) && !r.cumprido && !r.exigencia_automatica).length,
      automaticas: d.filter(r => pend(r) && r.exigencia_automatica && !r.cumprido).length,
      cumpridas: d.filter(r => r.cumprido).length,
      todos: d.length,
    };
  }, [data]);

  const cumprir = useMutation({
    mutationFn: async ({ id, cumprido }: { id: string; cumprido: boolean }) => {
      const { error } = await db.from('inss_requerimentos').update({ cumprido }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['inss'] });
      qc.invalidateQueries({ queryKey: ['painel-inss'] });
      toast.success(v.cumprido ? 'Exigência marcada como cumprida' : 'Reaberta');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titulo-pagina text-3xl">INSS — Requerimentos e exigências</h1>
        <p className="text-sm text-muted-foreground">
          Lido dos e-mails do INSS (noreply@inss.gov.br). Prazo estimado: 30 dias corridos a partir do aviso — confirme no Meu INSS / GERID.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ABAS.map(a => (
          <button key={a.v} onClick={() => setAba(a.v)}
            className={`rounded-full border px-3 py-1 text-xs ${aba === a.v ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {a.l} <b>{contagem[a.v]}</b>
          </button>
        ))}
      </div>
      <Input placeholder="Buscar cliente, protocolo, serviço ou unidade" value={busca} onChange={e => setBusca(e.target.value)} className="max-w-md" />

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : lista.length === 0 ? (
        <p className="glass-card p-6 text-sm text-muted-foreground">Nada nesta aba.</p>
      ) : (
        <div className="glass-card divide-y divide-border">
          {lista.map(r => {
            const exp = aberto === r.id;
            return (
              <div key={r.id} className="p-3 flex items-start gap-3">
                <Checkbox className="mt-1" checked={r.cumprido} title="Exigência cumprida"
                  onCheckedChange={v => cumprir.mutate({ id: r.id, cumprido: v === true })} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {(r.status ?? '').toUpperCase().startsWith('PENDENTE') && !r.exigencia_automatica && (
                      <UrgenciaBadge data={r.prazo_exigencia} feito={r.cumprido} />
                    )}
                    <span className="text-[11px] rounded bg-secondary px-1.5 py-0.5">{r.status ?? '—'}</span>
                    {r.exigencia_automatica && <span className="text-[11px] text-emerald-700">perícia agendada · cumprida automaticamente</span>}
                  </div>
                  <p className="font-medium mt-1">{r.cliente ?? '—'} <span className="text-muted-foreground font-normal">· {r.servico}</span></p>
                  <p className="text-xs text-muted-foreground">
                    Protocolo {r.protocolo} · DER {fmtData(r.data_protocolo)} · {r.unidade ?? '—'} · último aviso {fmtData(r.ultimo_aviso_em, 'dd/MM/yyyy HH:mm')}
                    {r.prazo_exigencia && !r.exigencia_automatica ? ` · prazo estimado ${fmtData(r.prazo_exigencia)}` : ''}
                  </p>
                  {r.despacho && (
                    <>
                      <p className={`text-sm mt-2 whitespace-pre-line ${exp ? '' : 'line-clamp-2'}`}>{r.despacho}</p>
                      <button className="text-xs text-muted-foreground inline-flex items-center gap-1" onClick={() => setAberto(exp ? null : r.id)}>
                        {exp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{exp ? 'menos' : 'ver despacho completo'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
