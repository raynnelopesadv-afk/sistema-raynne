import { useMemo, useState, useRef } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Table as TableIcon, BarChart3, PieChart as PieIcon,
  BarChartHorizontal, LineChart as LineIcon, Download, Maximize2, Trophy, Zap, Boxes, Timer,
} from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/utils';

interface Row {
  product_id: string | null;
  protocolado?: boolean | null;
  status_qualificacao?: string | null;
  teve_exito?: boolean | null;
  valor: number;
  valor_exito: number;
  valor_honorarios_recebidos: number;
  data_protocolo?: string | null;
  data_recebimento?: string | null;
  fechado_em?: string | null;
  created_at?: string | null;
}

// Sincronizado com ProtocoloStats: qualificado conta como protocolado.
const isProt = (r: Row) => !!r.protocolado || r.status_qualificacao === 'qualificado';

interface Product { id: string; nome: string }

interface Stats {
  productId: string;
  nome: string;
  total: number;
  protocolados: number;
  pctProt: number;
  exitos: number;
  taxaExito: number;
  fatEsperado: number;
  fatReal: number;
  valorExito: number;
  tempoMedio: number;
}

type SortKey = keyof Omit<Stats, 'productId' | 'nome'> | 'nome';
type ViewMode = 'table' | 'bars' | 'pie' | 'compare' | 'evolution';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}
function num(v: number) { return v.toLocaleString('pt-BR'); }

const PALETTE = ['#B8892B', '#0E7490', '#8B5CF6', '#15803D', '#F59E0B', '#EC4899', '#10B981', '#6366F1', '#EAB308', '#06B6D4'];
const GRID = '#E3E5E1';
const AXIS = '#6B7076';

interface Props {
  rows: Row[];
  products: Product[];
  onSelectProduct?: (productId: string) => void;
}

type BarMetric = 'total' | 'protocolados' | 'pctProt' | 'exitos' | 'taxaExito' | 'fatEsperado' | 'fatReal' | 'tempoMedio';
const BAR_METRICS: { v: BarMetric; label: string; color: string; fmt: (n: number) => string }[] = [
  { v: 'total', label: 'Total de contratos', color: '#0E7490', fmt: num },
  { v: 'protocolados', label: 'Protocolados', color: '#0E7490', fmt: num },
  { v: 'pctProt', label: '% protocolação', color: '#0E7490', fmt: (n) => `${n.toFixed(1)}%` },
  { v: 'exitos', label: 'Êxitos', color: '#15803D', fmt: num },
  { v: 'taxaExito', label: 'Taxa de êxito (%)', color: '#15803D', fmt: (n) => `${n.toFixed(1)}%` },
  { v: 'fatEsperado', label: 'Faturamento esperado', color: '#B8892B', fmt: brl },
  { v: 'fatReal', label: 'Faturamento real', color: '#B8892B', fmt: brl },
  { v: 'tempoMedio', label: 'Tempo médio (dias)', color: '#EF4444', fmt: (n) => `${n.toFixed(0)} d` },
];

type PieMetric = 'total' | 'fatEsperado' | 'fatReal' | 'exitos';
const PIE_METRICS: { v: PieMetric; label: string; fmt: (n: number) => string }[] = [
  { v: 'total', label: 'Distribuição de contratos', fmt: num },
  { v: 'fatEsperado', label: 'Faturamento esperado', fmt: brl },
  { v: 'fatReal', label: 'Faturamento real', fmt: brl },
  { v: 'exitos', label: 'Êxitos', fmt: num },
];

type CompareMode = 'volume' | 'financeiro';
type EvolutionMetric = 'total' | 'protocolados' | 'fatReal' | 'exitos';

export function PerformancePorProduto({ rows, products, onSelectProduct }: Props) {
  const [view, setView] = usePersistentState<ViewMode>('perfprod.view', 'table');
  const [sortKey, setSortKey] = useState<SortKey>('fatReal');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [barMetric, setBarMetric] = usePersistentState<BarMetric>('perfprod.barMetric', 'fatReal');
  const [pieMetric, setPieMetric] = usePersistentState<PieMetric>('perfprod.pieMetric', 'fatReal');
  const [compareMode, setCompareMode] = usePersistentState<CompareMode>('perfprod.compareMode', 'volume');
  const [evolMetric, setEvolMetric] = usePersistentState<EvolutionMetric>('perfprod.evolMetric', 'total');
  const [hiddenProducts, setHiddenProducts] = useState<Set<string>>(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const stats = useMemo<Stats[]>(() => {
    const productMap = new Map(products.map(p => [p.id, p.nome]));
    const buckets = new Map<string, Row[]>();
    rows.forEach(r => {
      const key = r.product_id ?? '__none__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    });
    return Array.from(buckets.entries()).map(([pid, list]) => {
      const total = list.length;
      const protocolados = list.filter(isProt).length;
      const exitos = list.filter(r => r.teve_exito === true).length;
      const fatEsperado = list.reduce((acc, r) => acc + (Number(r.valor) || 0), 0);
      const fatReal = list.reduce((acc, r) => acc + (Number(r.valor_honorarios_recebidos) || 0), 0);
      const valorExito = list.reduce((acc, r) => acc + (Number(r.valor_exito) || 0), 0);
      const tempos: number[] = [];
      list.forEach(r => {
        if (r.data_protocolo && r.data_recebimento) {
          const d1 = new Date(r.data_protocolo).getTime();
          const d2 = new Date(r.data_recebimento).getTime();
          if (d2 >= d1) tempos.push((d2 - d1) / 86_400_000);
        }
      });
      const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;
      return {
        productId: pid,
        nome: productMap.get(pid) ?? 'Sem produto',
        total, protocolados,
        pctProt: total > 0 ? (protocolados / total) * 100 : 0,
        exitos,
        taxaExito: protocolados > 0 ? (exitos / protocolados) * 100 : 0,
        fatEsperado, fatReal, valorExito, tempoMedio,
      };
    });
  }, [rows, products]);

  // Group small slices into "Outros" if too many
  const aggregated = useMemo(() => {
    if (stats.length <= 15) return stats;
    const sorted = [...stats].sort((a, b) => b.fatReal - a.fatReal);
    const top = sorted.slice(0, 14);
    const rest = sorted.slice(14);
    if (rest.length === 0) return top;
    const merged: Stats = {
      productId: '__outros__', nome: `Outros (${rest.length})`,
      total: rest.reduce((a, s) => a + s.total, 0),
      protocolados: rest.reduce((a, s) => a + s.protocolados, 0),
      pctProt: 0,
      exitos: rest.reduce((a, s) => a + s.exitos, 0),
      taxaExito: 0,
      fatEsperado: rest.reduce((a, s) => a + s.fatEsperado, 0),
      fatReal: rest.reduce((a, s) => a + s.fatReal, 0),
      valorExito: rest.reduce((a, s) => a + s.valorExito, 0),
      tempoMedio: rest.reduce((a, s) => a + s.tempoMedio, 0) / rest.length,
    };
    merged.pctProt = merged.total > 0 ? (merged.protocolados / merged.total) * 100 : 0;
    merged.taxaExito = merged.protocolados > 0 ? (merged.exitos / merged.protocolados) * 100 : 0;
    return [...top, merged];
  }, [stats]);

  const sorted = useMemo(() => {
    const arr = [...stats];
    arr.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return arr;
  }, [stats, sortKey, sortDir]);

  const insights = useMemo(() => {
    if (stats.length === 0) return null;
    const lider = [...stats].sort((a, b) => b.fatReal - a.fatReal)[0];
    const maiorTaxa = [...stats].filter(s => s.protocolados > 0).sort((a, b) => b.taxaExito - a.taxaExito)[0];
    const volume = [...stats].sort((a, b) => b.total - a.total)[0];
    const rapido = [...stats].filter(s => s.tempoMedio > 0).sort((a, b) => a.tempoMedio - b.tempoMedio)[0];
    return { lider, maiorTaxa, volume, rapido };
  }, [stats]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ArrowUpDown className="w-3 h-3 opacity-40 inline ml-1" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 inline ml-1" /> : <ArrowDown className="w-3 h-3 inline ml-1" />;
  }

  function exportCSV() {
    const headers = ['Produto', 'Total', 'Protocolados', '% Prot', 'Êxitos', 'Taxa Êxito', 'Fat. Esperado', 'Fat. Real', 'Valor Êxito', 'Tempo médio (d)'];
    const lines = [headers.join(';')];
    sorted.forEach(s => {
      lines.push([
        `"${s.nome}"`, s.total, s.protocolados, s.pctProt.toFixed(1), s.exitos,
        s.taxaExito.toFixed(1), s.fatEsperado.toFixed(2), s.fatReal.toFixed(2),
        s.valorExito.toFixed(2), s.tempoMedio.toFixed(1),
      ].join(';'));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `performance-produtos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  async function exportPNG() {
    const node = chartRef.current?.querySelector('svg');
    if (!node) return;
    const xml = new XMLSerializer().serializeToString(node);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = node.clientWidth * 2;
      canvas.height = node.clientHeight * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#0A0B0F';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `grafico-${view}-${Date.now()}.png`;
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${svg64}`;
  }

  if (stats.length === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <h3 className="font-semibold text-foreground mb-1">Performance por Produto</h3>
        <p className="text-sm text-muted-foreground">Sem dados para os filtros atuais.</p>
      </div>
    );
  }

  const VIEWS: { v: ViewMode; label: string; icon: React.ElementType }[] = [
    { v: 'table', label: 'Tabela', icon: TableIcon },
    { v: 'bars', label: 'Barras', icon: BarChart3 },
    { v: 'pie', label: 'Pizza', icon: PieIcon },
    { v: 'compare', label: 'Comparativo', icon: BarChartHorizontal },
    { v: 'evolution', label: 'Evolução', icon: LineIcon },
  ];

  const renderChart = () => {
    if (view === 'bars') return renderBars();
    if (view === 'pie') return renderPie();
    if (view === 'compare') return renderCompare();
    if (view === 'evolution') return renderEvolution();
    return null;
  };

  function tooltipStyle() {
    return {
      contentStyle: { background: '#FFFFFF', border: `1px solid ${GRID}`, borderRadius: 8, color: '#1A1D21' },
      labelStyle: { color: '#B8892B', fontWeight: 600 },
    };
  }

  function renderBars() {
    const meta = BAR_METRICS.find(m => m.v === barMetric)!;
    const data = [...aggregated].sort((a, b) => (b[barMetric] as number) - (a[barMetric] as number));
    const height = Math.max(280, data.length * 36);
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {BAR_METRICS.map(m => (
            <button key={m.v} onClick={() => setBarMetric(m.v)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                barMetric === m.v
                  ? 'bg-primary text-black border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
              )}>
              {m.label}
            </button>
          ))}
        </div>
        <div ref={chartRef} style={{ width: '100%', height }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 8 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" stroke={AXIS} fontSize={11} tickFormatter={(v) => meta.fmt(v as number)} />
              <YAxis type="category" dataKey="nome" stroke={AXIS} fontSize={11} width={160} />
              <Tooltip {...tooltipStyle()} formatter={(v: number) => meta.fmt(v)} />
              <Bar
                dataKey={barMetric}
                fill={meta.color}
                radius={[0, 6, 6, 0]}
                isAnimationActive
                onClick={(d: any) => d?.productId && d.productId !== '__none__' && d.productId !== '__outros__' && onSelectProduct?.(d.productId)}
                cursor="pointer"
                label={{ position: 'right', fill: '#E5E7EB', fontSize: 11, formatter: (v: number) => meta.fmt(v) }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  function renderPie() {
    const meta = PIE_METRICS.find(m => m.v === pieMetric)!;
    const data = aggregated
      .map(s => ({ name: s.nome, value: s[pieMetric] as number, productId: s.productId }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
    const total = data.reduce((a, d) => a + d.value, 0);
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PIE_METRICS.map(m => (
            <button key={m.v} onClick={() => setPieMetric(m.v)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                pieMetric === m.v
                  ? 'bg-primary text-black border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
              )}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="grid lg:grid-cols-[1fr_300px] gap-4 items-center">
          <div ref={chartRef} className="relative" style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius="60%" outerRadius="90%" paddingAngle={2} stroke="#0A0B0F" strokeWidth={2}
                  isAnimationActive
                  onClick={(d: any) => d?.productId && d.productId !== '__none__' && d.productId !== '__outros__' && onSelectProduct?.(d.productId)}
                >
                  {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} cursor="pointer" />)}
                </Pie>
                <Tooltip {...tooltipStyle()} formatter={(v: number) => meta.fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl font-bold text-primary">{meta.fmt(total)}</div>
              <div className="text-xs text-muted-foreground mt-1">{meta.label}</div>
            </div>
          </div>
          <div className="space-y-1 max-h-[360px] overflow-y-auto pr-2">
            {data.map((d, i) => {
              const pct = total > 0 ? (d.value / total) * 100 : 0;
              return (
                <button key={d.productId} onClick={() => d.productId !== '__none__' && d.productId !== '__outros__' && onSelectProduct?.(d.productId)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 text-left">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="flex-1 text-xs text-foreground truncate">{d.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{meta.fmt(d.value)}</span>
                  <span className="text-[10px] tabular-nums text-primary w-10 text-right">{pct.toFixed(1)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderCompare() {
    const data = [...aggregated].sort((a, b) => b.total - a.total);
    const isVolume = compareMode === 'volume';
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {(['volume', 'financeiro'] as CompareMode[]).map(m => (
            <button key={m} onClick={() => setCompareMode(m)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition border',
                compareMode === m
                  ? 'bg-primary text-black border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
              )}>
              {m === 'volume' ? 'Volume (contratos)' : 'Financeiro'}
            </button>
          ))}
        </div>
        <div ref={chartRef} style={{ width: '100%', height: 360, overflowX: 'auto' }}>
          <div style={{ minWidth: Math.max(600, data.length * 90), height: '100%' }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 60 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="nome" stroke={AXIS} fontSize={11} angle={-45} textAnchor="end" interval={0} height={70} />
                <YAxis stroke={AXIS} fontSize={11} tickFormatter={(v) => isVolume ? num(v as number) : brl(v as number)} />
                <Tooltip {...tooltipStyle()} formatter={(v: number) => isVolume ? num(v) : brl(v)} />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                {isVolume ? (
                  <>
                    <Bar dataKey="total" name="Total" fill="#6B7076" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="protocolados" name="Protocolados" fill="#00BCD4" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="exitos" name="Êxitos" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="fatEsperado" name="Fat. esperado" fill="#C9A54A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="fatReal" name="Fat. real" fill="#B8892B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="valorExito" name="Valor êxito" fill="#22C55E" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  function renderEvolution() {
    // Aggregate by month using fechado_em || data_protocolo || created_at
    const productMap = new Map(products.map(p => [p.id, p.nome]));
    const months = new Set<string>();
    const byProductMonth = new Map<string, Map<string, { total: number; protocolados: number; fatReal: number; exitos: number }>>();

    rows.forEach(r => {
      const dateStr = r.fechado_em || r.data_protocolo || r.created_at;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.add(key);
      const pid = r.product_id ?? '__none__';
      if (!byProductMonth.has(pid)) byProductMonth.set(pid, new Map());
      const m = byProductMonth.get(pid)!;
      if (!m.has(key)) m.set(key, { total: 0, protocolados: 0, fatReal: 0, exitos: 0 });
      const bucket = m.get(key)!;
      bucket.total += 1;
      if (isProt(r)) bucket.protocolados += 1;
      if (r.teve_exito === true) bucket.exitos += 1;
      bucket.fatReal += Number(r.valor_honorarios_recebidos) || 0;
    });

    const sortedMonths = Array.from(months).sort();
    // Keep top 8 products by total volume
    const productTotals = Array.from(byProductMonth.entries()).map(([pid, m]) => ({
      pid, total: Array.from(m.values()).reduce((a, b) => a + b.total, 0),
    })).sort((a, b) => b.total - a.total);
    const topProducts = productTotals.slice(0, 8).map(p => p.pid);

    const data = sortedMonths.map(month => {
      const row: Record<string, any> = { month };
      topProducts.forEach(pid => {
        const v = byProductMonth.get(pid)?.get(month)?.[evolMetric] ?? 0;
        const name = pid === '__none__' ? 'Sem produto' : (productMap.get(pid) ?? 'Produto');
        row[name] = v;
      });
      return row;
    });
    const productNames = topProducts.map(pid => pid === '__none__' ? 'Sem produto' : (productMap.get(pid) ?? 'Produto'));
    const fmt = evolMetric === 'fatReal' ? brl : num;

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <Select value={evolMetric} onValueChange={(v) => setEvolMetric(v as EvolutionMetric)}>
            <SelectTrigger className="w-[220px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Contratos</SelectItem>
              <SelectItem value="protocolados">Protocolados</SelectItem>
              <SelectItem value="fatReal">Faturamento real</SelectItem>
              <SelectItem value="exitos">Êxitos</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[11px] text-muted-foreground">Top 8 produtos · clique na legenda para alternar</span>
        </div>
        <div ref={chartRef} style={{ width: '100%', height: 360 }}>
          {data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem datas suficientes para evolução</div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="month" stroke={AXIS} fontSize={11} />
                <YAxis stroke={AXIS} fontSize={11} tickFormatter={(v) => fmt(v as number)} />
                <Tooltip {...tooltipStyle()} formatter={(v: number) => fmt(v)} />
                <Legend
                  wrapperStyle={{ paddingTop: 8, cursor: 'pointer' }}
                  onClick={(e: any) => {
                    const name = e.dataKey || e.value;
                    setHiddenProducts(prev => {
                      const next = new Set(prev);
                      if (next.has(name)) next.delete(name); else next.add(name);
                      return next;
                    });
                  }}
                />
                {productNames.map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2}
                    dot={{ r: 3 }} activeDot={{ r: 5 }} hide={hiddenProducts.has(name)} isAnimationActive />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  }

  function renderTable() {
    const cols: { key: SortKey; label: string }[] = [
      { key: 'nome', label: 'Produto' },
      { key: 'total', label: 'Total' },
      { key: 'protocolados', label: 'Protocolados' },
      { key: 'pctProt', label: '% Prot.' },
      { key: 'exitos', label: 'Êxitos' },
      { key: 'taxaExito', label: 'Taxa êxito' },
      { key: 'fatEsperado', label: 'Fat. esperado' },
      { key: 'fatReal', label: 'Fat. real' },
      { key: 'tempoMedio', label: 'Tempo médio' },
    ];
    return (
      <div className="overflow-x-auto -mx-2">
        <Table>
          <TableHeader>
            <TableRow>
              {cols.map(c => (
                <TableHead key={c.key} onClick={() => toggleSort(c.key)} className="cursor-pointer select-none whitespace-nowrap">
                  {c.label}<SortIcon k={c.key} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(s => (
              <TableRow key={s.productId}
                className={onSelectProduct && s.productId !== '__none__' ? 'cursor-pointer hover:bg-muted/30' : ''}
                onClick={() => onSelectProduct && s.productId !== '__none__' && onSelectProduct(s.productId)}>
                <TableCell className="font-medium">{s.nome}</TableCell>
                <TableCell>{s.total}</TableCell>
                <TableCell>{s.protocolados}</TableCell>
                <TableCell className="tabular-nums">{s.pctProt.toFixed(1)}%</TableCell>
                <TableCell>{s.exitos}</TableCell>
                <TableCell className="tabular-nums">{s.taxaExito.toFixed(1)}%</TableCell>
                <TableCell className="tabular-nums">{brl(s.fatEsperado)}</TableCell>
                <TableCell className="tabular-nums text-primary">{brl(s.fatReal)}</TableCell>
                <TableCell className="tabular-nums">{s.tempoMedio.toFixed(0)} d</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  const InsightCard = ({ icon: Icon, label, name, value, color }: { icon: React.ElementType; label: string; name: string; value: string; color: string }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20`, color }}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold text-foreground truncate">{name}</div>
        <div className="text-xs tabular-nums" style={{ color }}>{value}</div>
      </div>
    </div>
  );

  const body = (
    <>
      {insights && view !== 'table' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          <InsightCard icon={Trophy} color="#B8892B" label="Líder em faturamento" name={insights.lider.nome} value={brl(insights.lider.fatReal)} />
          {insights.maiorTaxa && <InsightCard icon={Zap} color="#22C55E" label="Maior taxa de êxito" name={insights.maiorTaxa.nome} value={`${insights.maiorTaxa.taxaExito.toFixed(1)}%`} />}
          <InsightCard icon={Boxes} color="#00BCD4" label="Maior volume" name={insights.volume.nome} value={`${insights.volume.total} contratos`} />
          {insights.rapido && <InsightCard icon={Timer} color="#8B5CF6" label="Mais rápido p/ recebimento" name={insights.rapido.nome} value={`${insights.rapido.tempoMedio.toFixed(0)} dias`} />}
        </div>
      )}
      <div className="animate-in fade-in duration-200">
        {view === 'table' ? renderTable() : renderChart()}
      </div>
    </>
  );

  return (
    <>
      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Performance por Produto</h3>
            <p className="text-xs text-muted-foreground">Clique em um produto para filtrar a lista abaixo</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-card/40">
            {VIEWS.map(v => {
              const Icon = v.icon;
              const active = view === v.v;
              return (
                <button key={v.v} onClick={() => setView(v.v)}
                  title={v.label}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition',
                    active ? 'bg-primary text-black' : 'text-muted-foreground hover:text-foreground'
                  )}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={exportCSV} title="Baixar CSV">
              <Download className="w-3.5 h-3.5" />
            </Button>
            {view !== 'table' && (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={exportPNG} title="Baixar PNG">
                <PieIcon className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setFullscreen(true)} title="Tela cheia">
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="p-4">{body}</div>
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Performance por Produto</DialogTitle>
          </DialogHeader>
          <div className="pt-2">{body}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
