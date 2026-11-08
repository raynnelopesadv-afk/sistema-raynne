import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronUp, Check, Undo2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/juridico-db';
import { fmtData, hojeISO, somaDias, type Publicacao, type StatusPublicacao } from '@/lib/juridico';
import { UrgenciaBadge } from '@/components/juridico/UrgenciaBadge';

const PERIODOS = [
  { v: '7', l: 'Últimos 7 dias' },
  { v: '30', l: 'Últimos 30 dias' },
  { v: '90', l: 'Últimos 90 dias' },
];

export default function Publicacoes() {
  const [status, setStatus] = useState<StatusPublicacao | 'todas'>('nao_lida');
  const [periodo, setPeriodo] = useState('30');
  const [uf, setUf] = useState('todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['publicacoes', status, periodo],
    queryFn: async () => {
      let q = db.from('publicacoes').select('*')
        .gte('data_disponibilizacao', somaDias(hojeISO(), -Number(periodo)));
      if (status !== 'todas') q = q.eq('status', status);
      const { data, error } = await q.order('data_disponibilizacao', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Publicacao[];
    },
  });

  // A mesma intimação pode chegar pelo DJEN e pela Tramitação: mostra uma vez só
  // (mesmo processo + mesma data), preferindo a que tem o texto completo.
  const lista = useMemo(() => {
    const vistos = new Map<string, Publicacao>();
    for (const p of data ?? []) {
      const chave = `${(p.numero_processo ?? '').replace(/\D/g, '')}|${p.data_disponibilizacao}|${p.tipo_documento ?? ''}`;
      const atual = vistos.get(chave);
      if (!atual || (!atual.texto && p.texto)) vistos.set(chave, p);
    }
    const t = busca.trim().toLowerCase();
    const td = t.replace(/\D/g, '');
    return [...vistos.values()].filter(p => {
      if (uf !== 'todas' && p.uf !== uf) return false;
      if (!t) return true;
      if (td.length >= 6 && (p.numero_processo ?? '').replace(/\D/g, '').includes(td)) return true;
      return [p.texto, p.orgao, p.tribunal, p.classe].some(x => x?.toLowerCase().includes(t));
    });
  }, [data, uf, busca]);

  const ufs = useMemo(() => [...new Set((data ?? []).map(p => p.uf).filter(Boolean))].sort() as string[], [data]);
  const porUf = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of lista) m[p.uf ?? '—'] = (m[p.uf ?? '—'] ?? 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [lista]);

  const mudar = useMutation({
    mutationFn: async ({ ids, novo }: { ids: string[]; novo: StatusPublicacao }) => {
      const { error } = await db.from('publicacoes').update({ status: novo }).in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['publicacoes'] });
      qc.invalidateQueries({ queryKey: ['painel-pubs'] });
      toast.success(v.novo === 'tratada' ? `${v.ids.length} marcada(s) como tratada(s)` : 'Atualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Publicações</h1>
        <p className="text-sm text-muted-foreground">Intimações do DJEN (todos os tribunais, OAB/MG 160.914) e da Tramitação Inteligente</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={v => setStatus(v as StatusPublicacao | 'todas')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nao_lida">Não lidas</SelectItem>
            <SelectItem value="tratada">Tratadas</SelectItem>
            <SelectItem value="arquivada">Arquivadas</SelectItem>
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{PERIODOS.map(p => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={uf} onValueChange={setUf}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos UFs</SelectItem>
            {ufs.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar nº do processo, texto, órgão..." value={busca} onChange={e => setBusca(e.target.value)} className="max-w-sm" />
        {status === 'nao_lida' && lista.length > 0 && (
          <Button variant="outline" onClick={() => {
            if (confirm(`Marcar as ${lista.length} publicações listadas como tratadas?`)) mudar.mutate({ ids: lista.map(p => p.id), novo: 'tratada' });
          }}>
            <Check className="w-4 h-4 mr-1" /> Tratar as {lista.length} listadas
          </Button>
        )}
      </div>

      {porUf.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {porUf.map(([u, n]) => (
            <button key={u} onClick={() => setUf(uf === u ? 'todas' : u)}
              className={`text-[11px] rounded-full border px-2 py-0.5 ${uf === u ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`}>
              {u} <b>{n}</b>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : lista.length === 0 ? (
        <p className="glass-card p-6 text-sm text-muted-foreground">Nenhuma publicação com esses filtros.</p>
      ) : (
        <div className="glass-card divide-y divide-border">
          {lista.map(p => {
            const exp = aberta === p.id;
            return (
              <div key={p.id} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-primary">{p.tribunal ?? '—'}{p.uf ? ` · ${p.uf}` : ''}</span>
                      <span className="text-muted-foreground">Disp. {fmtData(p.data_disponibilizacao)}</span>
                      {p.inicio_prazo && <span className="text-muted-foreground">· início do prazo {fmtData(p.inicio_prazo)}</span>}
                      {p.status === 'nao_lida' && p.inicio_prazo && <UrgenciaBadge data={p.inicio_prazo} />}
                      <span className="text-muted-foreground">· {p.fonte === 'djen' ? 'DJEN' : p.fonte === 'tramitacao' ? 'Tramitação' : 'Manual'}</span>
                    </div>
                    <p className="font-medium mt-1">{p.numero_processo ?? 'Sem número'} {p.classe ? <span className="text-muted-foreground font-normal">— {p.classe}</span> : null}</p>
                    <p className="text-xs text-muted-foreground">{p.orgao}{p.tipo_documento ? ` · ${p.tipo_documento}` : ''}</p>
                    {p.texto && (
                      <p className={`text-sm mt-2 whitespace-pre-line ${exp ? '' : 'line-clamp-3'}`}>{p.texto}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {p.status === 'nao_lida' ? (
                      <Button size="sm" onClick={() => mudar.mutate({ ids: [p.id], novo: 'tratada' })}><Check className="w-4 h-4 mr-1" />Tratada</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => mudar.mutate({ ids: [p.id], novo: 'nao_lida' })}><Undo2 className="w-4 h-4 mr-1" />Reabrir</Button>
                    )}
                    {p.link && <a href={p.link} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 justify-center"><ExternalLink className="w-3 h-3" />abrir</a>}
                    {p.texto && (
                      <button className="text-xs text-muted-foreground inline-flex items-center gap-1 justify-center" onClick={() => setAberta(exp ? null : p.id)}>
                        {exp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}{exp ? 'menos' : 'texto'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
