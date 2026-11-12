import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trophy, Plus } from 'lucide-react';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/juridico-db';
import { hojeISO, fmtData } from '@/lib/juridico';
import { fetchVendedores } from '@/lib/vendedores';
import { nomeAmigavel, type Protocolo } from '@/lib/protocolos';

export interface LinhaRanking { id: string; nome: string; valor: number; detalhe?: string }

const MEDALHA = ['🥇', '🥈', '🥉'];
const COR_PODIO = ['#D4A017', '#9CA3AF', '#B45309'];

/** Ordena do maior para o menor e devolve posição (empates dividem a posição). */
export function montarRanking(linhas: LinhaRanking[]): (LinhaRanking & { posicao: number })[] {
  const ord = [...linhas].filter(l => l.valor > 0).sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
  let pos = 0; let anterior = -1;
  return ord.map((l, i) => {
    if (l.valor !== anterior) { pos = i + 1; anterior = l.valor; }
    return { ...l, posicao: pos };
  });
}

function useMesSelecionado() {
  const [qual, setQual] = useState<'atual' | 'passado'>('atual');
  const base = qual === 'atual' ? new Date() : subMonths(new Date(), 1);
  const de = format(startOfMonth(base), 'yyyy-MM-dd');
  const ate = format(endOfMonth(base), 'yyyy-MM-dd');
  const rotulo = format(base, "MMMM 'de' yyyy", { locale: ptBR });
  return { qual, setQual, de, ate, rotulo };
}

function SeletorMes({ qual, setQual }: { qual: 'atual' | 'passado'; setQual: (v: 'atual' | 'passado') => void }) {
  const b = 'px-3 py-1.5 rounded-lg text-xs font-medium border';
  return (
    <div className="inline-flex gap-2">
      <button className={`${b} ${qual === 'atual' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`} onClick={() => setQual('atual')}>Este mês</button>
      <button className={`${b} ${qual === 'passado' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`} onClick={() => setQual('passado')}>Mês passado</button>
    </div>
  );
}

export function RankingMes({ titulo, rotulo, unidade, linhas, carregando }: {
  titulo: string; rotulo: string; unidade: string; linhas: LinhaRanking[]; carregando?: boolean;
}) {
  const r = montarRanking(linhas);
  const lider = r.filter(x => x.posicao === 1);
  return (
    <div className="glass-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-500" />
        <div>
          <h3 className="font-semibold">{titulo}</h3>
          <p className="text-xs text-muted-foreground first-letter:uppercase">{rotulo}</p>
        </div>
      </div>
      {carregando ? <Loader2 className="w-5 h-5 animate-spin" /> : r.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Ninguém lançou nada neste mês ainda.</p>
      ) : (
        <>
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-amber-700">1º lugar</p>
            <p className="text-2xl font-bold mt-1">🏆 {lider.map(l => l.nome).join(' e ')}</p>
            <p className="text-sm text-muted-foreground">{lider[0].valor} {unidade}</p>
          </div>
          <ol className="space-y-1.5">
            {r.map(l => (
              <li key={l.id} className="flex items-center gap-3 text-sm">
                <span className="w-7 text-center">{MEDALHA[l.posicao - 1] ?? `${l.posicao}º`}</span>
                <span className="flex-1 truncate">{l.nome}{l.detalhe && <span className="text-xs text-muted-foreground"> · {l.detalhe}</span>}</span>
                <span className="font-semibold tabular-nums">{l.valor}</span>
              </li>
            ))}
          </ol>
          <div style={{ height: Math.max(160, r.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nome" width={110} tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [`${v} ${unidade}`, '']} />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                  {r.map(l => <Cell key={l.id} fill={COR_PODIO[l.posicao - 1] ?? 'hsl(var(--primary))'} />)}
                  <LabelList dataKey="valor" position="right" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

const DISTRIBUICAO = new Set(['acao_judicial', 'requerimento_adm']);

/** Operacional: quem distribuiu mais (ações judiciais + requerimentos do INSS) no mês. */
export function RankingOperacional() {
  const m = useMesSelecionado();
  const { data, isLoading } = useQuery({
    queryKey: ['ranking-operacional', m.de, m.ate],
    queryFn: async () => {
      const { data, error } = await db.from('protocolos_operacional').select('colaborador_id, colaborador_nome, tipo')
        .gte('data', m.de).lte('data', m.ate).limit(10000);
      if (error) throw error;
      return (data ?? []) as Pick<Protocolo, 'colaborador_id' | 'colaborador_nome' | 'tipo'>[];
    },
  });
  const linhas = useMemo(() => {
    const p = new Map<string, { nome: string; dist: number; acoes: number; req: number; total: number }>();
    for (const r of data ?? []) {
      const x = p.get(r.colaborador_id) ?? { nome: nomeAmigavel(r.colaborador_nome), dist: 0, acoes: 0, req: 0, total: 0 };
      x.total++;
      if (DISTRIBUICAO.has(r.tipo)) x.dist++;
      if (r.tipo === 'acao_judicial') x.acoes++;
      if (r.tipo === 'requerimento_adm') x.req++;
      p.set(r.colaborador_id, x);
    }
    return [...p.entries()].map(([id, x]) => ({
      id, nome: x.nome, valor: x.dist, detalhe: `${x.acoes} ações · ${x.req} requerimentos · ${x.total} protocolos no total`,
    }));
  }, [data]);
  return (
    <div className="space-y-3">
      <SeletorMes qual={m.qual} setQual={m.setQual} />
      <RankingMes titulo="Quem distribuiu mais" rotulo={m.rotulo} unidade="distribuições (ações + requerimentos)" linhas={linhas} carregando={isLoading} />
    </div>
  );
}

interface Fechado { id: string; nome_cliente: string; closer_id: string | null; data_fechamento: string | null; fechado_em: string | null; status_qualificacao: string }

/** Comercial: fechamentos do dia por vendedor + ranking do mês. */
export function ComercialFechamentos() {
  const nav = useNavigate();
  const m = useMesSelecionado();
  const hoje = hojeISO();
  const ini = m.de < hoje.slice(0, 8) + '01' ? m.de : hoje.slice(0, 8) + '01';

  const vendedores = useQuery({ queryKey: ['vendedores-all'], queryFn: async () => (await fetchVendedores()).map(v => ({ id: v.id, nome: v.nome, divisao: v.divisao })) });
  const { data, isLoading } = useQuery({
    queryKey: ['ranking-comercial', ini],
    queryFn: async () => {
      // data do fechamento: data_fechamento; se vazia, fechado_em
      const { data, error } = await supabase.from('clientes_fechados')
        .select('id, nome_cliente, closer_id, data_fechamento, fechado_em, status_qualificacao')
        .or(`data_fechamento.gte.${ini},and(data_fechamento.is.null,fechado_em.gte.${ini}T00:00:00-03:00)`)
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as Fechado[];
    },
  });
  const nomeDe = useMemo(() => Object.fromEntries((vendedores.data ?? []).map(v => [v.id, v.nome])), [vendedores.data]);
  const dia = (f: Fechado) => f.data_fechamento ?? (f.fechado_em ? format(new Date(f.fechado_em), 'yyyy-MM-dd') : '');
  const validos = (data ?? []).filter(f => f.status_qualificacao !== 'desistencia');

  const deHoje = validos.filter(f => dia(f) === hoje);
  const hojePorVendedor = useMemo(() => {
    const p = new Map<string, Fechado[]>();
    for (const f of deHoje) p.set(f.closer_id ?? 'sem', [...(p.get(f.closer_id ?? 'sem') ?? []), f]);
    return [...p.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [deHoje]);

  const linhasMes = useMemo(() => {
    const p = new Map<string, number>();
    for (const f of validos) {
      const d = dia(f);
      if (d < m.de || d > m.ate) continue;
      p.set(f.closer_id ?? 'sem', (p.get(f.closer_id ?? 'sem') ?? 0) + 1);
    }
    return [...p.entries()].map(([id, valor]) => ({ id, nome: id === 'sem' ? 'Sem vendedor' : (nomeDe[id] ?? 'Vendedor'), valor }));
  }, [validos, m.de, m.ate, nomeDe]);

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Fechamentos de hoje · {fmtData(hoje, 'dd/MM')}</h3>
            <p className="text-xs text-muted-foreground">Cada vendedor lança o seu fechamento em Fechamento → Novo. Os contratos assinados no ZapSign aparecem em Contratos Fechados.</p>
          </div>
          <Button size="sm" onClick={() => nav('/fechamento')}><Plus className="w-4 h-4 mr-1" /> Lançar fechamento</Button>
        </div>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : hojePorVendedor.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum fechamento lançado hoje ainda.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {hojePorVendedor.map(([id, lista]) => (
              <div key={id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{id === 'sem' ? 'Sem vendedor' : (nomeDe[id] ?? 'Vendedor')}</span>
                  <span className="text-lg font-bold">{lista.length}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{lista.map(f => f.nome_cliente).join(', ')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <SeletorMes qual={m.qual} setQual={m.setQual} />
      <RankingMes titulo="Quem fechou mais" rotulo={m.rotulo} unidade="contratos fechados" linhas={linhasMes} carregando={isLoading} />
    </div>
  );
}
