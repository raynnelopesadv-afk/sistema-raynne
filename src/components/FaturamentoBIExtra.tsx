import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Package, FileCheck, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

type Divisao = 'advogados' | 'educacao';
type Periodo = 'mes' | 'trimestre' | 'ano';
type StatusTimeline = 'todos' | 'aguardando_protocolo' | 'aguardando_recebimento' | 'concluido';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
];

const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.75rem',
  color: 'hsl(var(--foreground))',
  fontSize: 12,
};

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function periodoRange(periodo: Periodo, ref: Date): { start: string; end: string; label: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (periodo === 'mes') {
    const last = new Date(y, m + 1, 0).getDate();
    return {
      start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      label: ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    };
  }
  if (periodo === 'trimestre') {
    const q = Math.floor(m / 3);
    const startM = q * 3;
    const endM = startM + 2;
    const last = new Date(y, endM + 1, 0).getDate();
    return {
      start: `${y}-${String(startM + 1).padStart(2, '0')}-01`,
      end: `${y}-${String(endM + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
      label: `T${q + 1}/${y}`,
    };
  }
  return {
    start: `${y}-01-01`,
    end: `${y}-12-31`,
    label: String(y),
  };
}

function csvDownload(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) {
    toast.info('Sem dados para exportar');
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => escape(r[h])).join(';')),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function diffDays(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

interface Props {
  divisao: Divisao;
}

export function FaturamentoBIExtra({ divisao }: Props) {
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [refDate, setRefDate] = useState<Date>(new Date());
  const range = useMemo(() => periodoRange(periodo, refDate), [periodo, refDate]);

  const [statusTimeline, setStatusTimeline] = useState<StatusTimeline>('todos');
  const [produtoTimeline, setProdutoTimeline] = useState<string>('all');

  // ---- products lookup
  const { data: produtos } = useQuery({
    queryKey: ['bi-extra-prods', divisao],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, nome, ticket_medio, valor')
        .eq('divisao', divisao)
        .order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  const produtosMap = useMemo(() => {
    const m = new Map<string, { nome: string; ticket: number }>();
    (produtos ?? []).forEach(p => {
      m.set(p.id, { nome: p.nome, ticket: Number(p.ticket_medio) || Number(p.valor) || 0 });
    });
    return m;
  }, [produtos]);

  // ---- main dataset for the period (fechados)
  const { data: rows, isLoading } = useQuery({
    queryKey: ['bi-extra-rows', divisao, range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select('id, nome_cliente, valor, data_fechamento, data_protocolo, data_recebimento, etapa_processo, product_id, closer_id')
        .eq('divisao', divisao)
        .gte('data_fechamento', range.start)
        .lte('data_fechamento', range.end)
        .order('data_fechamento', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  // ---- 1) Fechamentos por produto
  const porProduto = useMemo(() => {
    const acc = new Map<string, { nome: string; count: number; valor: number }>();
    (rows ?? []).forEach(r => {
      const key = r.product_id ?? '__sem_produto';
      const nome = r.product_id ? (produtosMap.get(r.product_id)?.nome ?? 'Produto removido') : 'Sem produto';
      const cur = acc.get(key) ?? { nome, count: 0, valor: 0 };
      cur.count += 1;
      cur.valor += Number(r.valor) || 0;
      acc.set(key, cur);
    });
    const total = (rows ?? []).length;
    const arr = Array.from(acc.values())
      .map(x => ({ ...x, pct: total > 0 ? (x.count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count);
    return { arr, total };
  }, [rows, produtosMap]);

  // ---- 2) Protocolos & honorários
  const protocoloPanel = useMemo(() => {
    const fechados = rows ?? [];
    const protocolados = fechados.filter(r => !!r.data_protocolo);
    const recebidos = fechados.filter(r => !!r.data_recebimento);
    const honorariosEstimados = protocolados.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const honorariosRecebidos = recebidos.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    return {
      totalFechados: fechados.length,
      totalProtocolados: protocolados.length,
      totalRecebidos: recebidos.length,
      taxaProtocolo: fechados.length ? protocolados.length / fechados.length : 0,
      honorariosEstimados,
      honorariosRecebidos,
    };
  }, [rows]);

  // ---- 3) Timeline (filtragem por status + produto)
  const timeline = useMemo(() => {
    let list = (rows ?? []).map(r => {
      const status: StatusTimeline =
        r.data_recebimento ? 'concluido' :
        r.data_protocolo ? 'aguardando_recebimento' :
        'aguardando_protocolo';
      return {
        id: r.id,
        nome: r.nome_cliente,
        produto: r.product_id ? (produtosMap.get(r.product_id)?.nome ?? '—') : '—',
        product_id: r.product_id,
        valor: Number(r.valor) || 0,
        data_fechamento: r.data_fechamento,
        data_protocolo: r.data_protocolo,
        data_recebimento: r.data_recebimento,
        status,
      };
    });
    if (statusTimeline !== 'todos') list = list.filter(x => x.status === statusTimeline);
    if (produtoTimeline !== 'all') list = list.filter(x => x.product_id === produtoTimeline);
    return list;
  }, [rows, produtosMap, statusTimeline, produtoTimeline]);

  // ---- 4) Duração média (protocolo → recebimento)
  const duracaoPorProduto = useMemo(() => {
    const acc = new Map<string, number[]>();
    (rows ?? []).forEach(r => {
      const d = diffDays(r.data_protocolo, r.data_recebimento);
      if (d === null || d < 0) return;
      const nome = r.product_id ? (produtosMap.get(r.product_id)?.nome ?? '—') : 'Sem produto';
      const arr = acc.get(nome) ?? [];
      arr.push(d);
      acc.set(nome, arr);
    });
    return Array.from(acc.entries()).map(([nome, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b);
      const media = sorted.reduce((s, v) => s + v, 0) / sorted.length;
      const mediana = sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
      return {
        nome,
        n: sorted.length,
        media: Math.round(media),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mediana: Math.round(mediana),
      };
    }).sort((a, b) => b.media - a.media);
  }, [rows, produtosMap]);

  // ---- inline date update
  async function salvarData(id: string, campo: 'data_protocolo' | 'data_recebimento', valor: string) {
    const v = valor || null;
    const payload = (campo === 'data_protocolo' ? { data_protocolo: v } : { data_recebimento: v });
    const { error } = await supabase
      .from('clientes_fechados')
      .update(payload)
      .eq('id', id);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      return;
    }
    toast.success('Atualizado');
    qc.invalidateQueries({ queryKey: ['bi-extra-rows'] });
  }

  function shiftPeriodo(delta: number) {
    const d = new Date(refDate);
    if (periodo === 'mes') d.setMonth(d.getMonth() + delta);
    else if (periodo === 'trimestre') d.setMonth(d.getMonth() + delta * 3);
    else d.setFullYear(d.getFullYear() + delta);
    setRefDate(d);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header / período global */}
      <div className="glass-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">BI Avançado</h2>
          <p className="text-xs text-muted-foreground">Produtos, protocolos, honorários e duração</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={v => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mês</SelectItem>
              <SelectItem value="trimestre">Trimestre</SelectItem>
              <SelectItem value="ano">Ano</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => shiftPeriodo(-1)}>‹</Button>
          <span className="text-sm font-medium text-foreground capitalize min-w-[140px] text-center">{range.label}</span>
          <Button size="sm" variant="outline" onClick={() => shiftPeriodo(1)}>›</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card p-10 text-center text-muted-foreground text-sm">Carregando…</div>
      ) : (
        <>
          {/* 1) Fechamentos por produto */}
          <section className="glass-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">Fechamentos por Produto</h3>
                <span className="text-xs text-muted-foreground">· {porProduto.total} contratos</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => csvDownload(
                `fechamentos-produto-${range.label}.csv`,
                porProduto.arr.map(p => ({ produto: p.nome, contratos: p.count, valor_total: p.valor.toFixed(2), pct: p.pct.toFixed(1) + '%' }))
              )}>
                <Download className="w-3.5 h-3.5 mr-1" /> CSV
              </Button>
            </div>
            {porProduto.arr.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">Sem fechamentos no período</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={porProduto.arr} layout="vertical" margin={{ left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis dataKey="nome" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => n === 'valor' ? fmt(v) : v} />
                    <Bar dataKey="count" name="Contratos" radius={[0, 6, 6, 0]}>
                      {porProduto.arr.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={porProduto.arr}
                      dataKey="count"
                      nameKey="nome"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      label={(e: { nome: string; pct: number }) => `${e.pct.toFixed(0)}%`}
                    >
                      {porProduto.arr.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _n: string, p: { payload: { nome: string; pct: number } }) => [`${v} contratos (${p.payload.pct.toFixed(1)}%)`, p.payload.nome]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* 2) Protocolos & honorários */}
          <section className="glass-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">Protocolos & Honorários Estimados</h3>
              </div>
              <Button size="sm" variant="outline" onClick={() => csvDownload(
                `protocolos-honorarios-${range.label}.csv`,
                [{
                  fechados: protocoloPanel.totalFechados,
                  protocolados: protocoloPanel.totalProtocolados,
                  taxa_conversao_pct: (protocoloPanel.taxaProtocolo * 100).toFixed(1),
                  recebidos: protocoloPanel.totalRecebidos,
                  honorarios_estimados: protocoloPanel.honorariosEstimados.toFixed(2),
                  honorarios_recebidos: protocoloPanel.honorariosRecebidos.toFixed(2),
                }]
              )}>
                <Download className="w-3.5 h-3.5 mr-1" /> CSV
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <MiniKpi label="Fechados" value={String(protocoloPanel.totalFechados)} />
              <MiniKpi label="Protocolados" value={`${protocoloPanel.totalProtocolados}`} sub={`${(protocoloPanel.taxaProtocolo * 100).toFixed(1)}%`} highlight />
              <MiniKpi label="Honorários Estimados" value={fmt(protocoloPanel.honorariosEstimados)} />
              <MiniKpi label="Honorários Recebidos" value={fmt(protocoloPanel.honorariosRecebidos)} />
            </div>
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Conversão Fechado → Protocolado</span>
                <span className="tabular-nums">{(protocoloPanel.taxaProtocolo * 100).toFixed(1)}%</span>
              </div>
              <div className="h-3 rounded-full bg-secondary/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, protocoloPanel.taxaProtocolo * 100)}%`,
                    background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                  }}
                />
              </div>
            </div>
          </section>

          {/* 3) Timeline */}
          <section className="glass-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">Linha do Tempo por Caso</h3>
                <span className="text-xs text-muted-foreground">· {timeline.length} casos</span>
              </div>
              <div className="flex items-center gap-2">
                <Select value={statusTimeline} onValueChange={v => setStatusTimeline(v as StatusTimeline)}>
                  <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="aguardando_protocolo">Aguardando protocolo</SelectItem>
                    <SelectItem value="aguardando_recebimento">Aguardando recebimento</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={produtoTimeline} onValueChange={setProdutoTimeline}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos produtos</SelectItem>
                    {(produtos ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => csvDownload(
                  `timeline-${range.label}.csv`,
                  timeline.map(t => ({
                    cliente: t.nome,
                    produto: t.produto,
                    valor: t.valor.toFixed(2),
                    data_fechamento: t.data_fechamento ?? '',
                    data_protocolo: t.data_protocolo ?? '',
                    data_recebimento: t.data_recebimento ?? '',
                    status: t.status,
                  }))
                )}>
                  <Download className="w-3.5 h-3.5 mr-1" /> CSV
                </Button>
              </div>
            </div>
            {timeline.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">Sem casos no filtro selecionado</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3">Cliente</th>
                      <th className="py-2 pr-3">Produto</th>
                      <th className="py-2 pr-3">Valor</th>
                      <th className="py-2 pr-3">Fechamento</th>
                      <th className="py-2 pr-3">Protocolo</th>
                      <th className="py-2 pr-3">Recebimento</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map(t => (
                      <tr key={t.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${t.status !== 'concluido' ? 'bg-warning/5' : ''}`}>
                        <td className="py-2 pr-3 font-medium text-foreground">{t.nome}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{t.produto}</td>
                        <td className="py-2 pr-3 tabular-nums text-foreground">{fmt(t.valor)}</td>
                        <td className="py-2 pr-3 text-muted-foreground tabular-nums">
                          {t.data_fechamento ? new Date(t.data_fechamento).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            type="date"
                            defaultValue={t.data_protocolo ?? ''}
                            className="h-8 w-40 text-xs"
                            onBlur={e => {
                              if (e.target.value !== (t.data_protocolo ?? '')) salvarData(t.id, 'data_protocolo', e.target.value);
                            }}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            type="date"
                            defaultValue={t.data_recebimento ?? ''}
                            className="h-8 w-40 text-xs"
                            onBlur={e => {
                              if (e.target.value !== (t.data_recebimento ?? '')) salvarData(t.id, 'data_recebimento', e.target.value);
                            }}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <StatusBadge status={t.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 4) Duração média por produto */}
          <section className="glass-card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground">Duração Média por Produto</h3>
                <span className="text-xs text-muted-foreground">· Protocolo → Recebimento (em dias)</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => csvDownload(
                `duracao-produto-${range.label}.csv`,
                duracaoPorProduto.map(d => ({ produto: d.nome, n: d.n, media_dias: d.media, mediana_dias: d.mediana, min_dias: d.min, max_dias: d.max }))
              )}>
                <Download className="w-3.5 h-3.5 mr-1" /> CSV
              </Button>
            </div>
            {duracaoPorProduto.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground flex flex-col items-center gap-2">
                <AlertCircle className="w-6 h-6 text-muted-foreground" />
                Nenhum caso com protocolo e recebimento registrados ainda.
                <span className="text-xs">Preencha as datas na timeline acima para alimentar este gráfico.</span>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(220, duracaoPorProduto.length * 42)}>
                  <BarChart data={duracaoPorProduto} layout="vertical" margin={{ left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} unit="d" />
                    <YAxis dataKey="nome" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} dias`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="media" name="Média" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="mediana" name="Mediana" fill="hsl(var(--accent))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3">Produto</th>
                        <th className="py-2 pr-3">Casos</th>
                        <th className="py-2 pr-3">Média</th>
                        <th className="py-2 pr-3">Mediana</th>
                        <th className="py-2 pr-3">Mín</th>
                        <th className="py-2 pr-3">Máx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duracaoPorProduto.map(d => (
                        <tr key={d.nome} className="border-b border-border/50">
                          <td className="py-2 pr-3 font-medium text-foreground">{d.nome}</td>
                          <td className="py-2 pr-3 tabular-nums">{d.n}</td>
                          <td className="py-2 pr-3 tabular-nums">{d.media}d</td>
                          <td className="py-2 pr-3 tabular-nums">{d.mediana}d</td>
                          <td className="py-2 pr-3 tabular-nums text-success">{d.min}d</td>
                          <td className="py-2 pr-3 tabular-nums text-warning">{d.max}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MiniKpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-xl ${highlight ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/40 border border-border'}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: StatusTimeline }) {
  if (status === 'concluido') return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/15 text-success border border-success/30">Concluído</span>;
  if (status === 'aguardando_recebimento') return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent border border-accent/30">Aguard. recebimento</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/15 text-warning border border-warning/30">Aguard. protocolo</span>;
}
