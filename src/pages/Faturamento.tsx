import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, Filter, Sliders, Sparkles, Target, Wallet, Receipt, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVendedores } from '@/lib/vendedores';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend,
} from 'recharts';
import { FaturamentoBIExtra } from '@/components/FaturamentoBIExtra';
import { ProjecaoExito } from '@/components/ProjecaoExito';
import { KPICard, ConversionFunnel, type FunnelStage } from '@/components/bi';
import { PeriodSelector, detectPeriodKind } from '@/components/PeriodSelector';

type Divisao = 'advogados' | 'educacao';
type Cenario = 'conservador' | 'realista' | 'otimista' | 'custom';

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const PRESETS: Record<Exclude<Cenario, 'custom'>, { protocolo: number; exito: number; label: string }> = {
  conservador: { protocolo: 0.40, exito: 0.50, label: 'Conservador' },
  realista:    { protocolo: 0.50, exito: 0.50, label: 'Realista' },
  otimista:    { protocolo: 0.65, exito: 0.50, label: 'Otimista' },
};

const ETAPAS_PROTOCOLADAS = ['entrada', 'judicial', 'administrativo', 'fundo_investimento'];

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function pct(v: number) { return `${(v * 100).toFixed(0)}%`; }
function delta(curr: number, prev: number) {
  if (!prev) return 0;
  return ((curr - prev) / prev) * 100;
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Faturamento() {
  // ---------- filtros ----------
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const today = new Date();
  const [mesRef, setMesRef] = useState<string>(ymKey(today));
  const [closerFilter, setCloserFilter] = useState<string>('all');
  const [produtoFilter, setProdutoFilter] = useState<string>('all');
  const [statusContrato, setStatusContrato] = useState<string>('all'); // status_qualificacao
  const [statusProtocolo, setStatusProtocolo] = useState<string>('all'); // etapa_processo bucket

  // ---------- cenário / sliders ----------
  const [cenario, setCenario] = useState<Cenario>('realista');
  const [taxaProtocolo, setTaxaProtocolo] = useState(0.50);
  const [taxaExito, setTaxaExito] = useState(0.50);
  const [ticketOverride, setTicketOverride] = useState<number | null>(null); // null = usar média real

  function applyPreset(c: Exclude<Cenario, 'custom'>) {
    setCenario(c);
    setTaxaProtocolo(PRESETS[c].protocolo);
    setTaxaExito(PRESETS[c].exito);
  }

  const periodKind = detectPeriodKind(mesRef);

  // Range do período selecionado (mês / ano / todo / personalizado)
  const { startMonth, endMonth } = useMemo(() => {
    if (periodKind === 'all') {
      return { startMonth: '1970-01-01', endMonth: '2999-12-31' };
    }
    if (periodKind === 'range') {
      const [, s, e] = mesRef.split(':');
      return { startMonth: s, endMonth: e };
    }
    if (periodKind === 'year') {
      const y = Number(mesRef);
      return { startMonth: `${y}-01-01`, endMonth: `${y}-12-31` };
    }
    const [y, m] = mesRef.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      startMonth: `${y}-${String(m).padStart(2, '0')}-01`,
      endMonth: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    };
  }, [mesRef, periodKind]);

  // Mês de referência para a "tendência" (sempre baseada no mês final do período)
  const [refYear, refMonth] = useMemo(() => {
    if (periodKind === 'all') {
      const d = new Date();
      return [d.getFullYear(), d.getMonth() + 1];
    }
    if (periodKind === 'range') {
      const [, , e] = mesRef.split(':');
      const [y, m] = e.split('-').map(Number);
      return [y, m];
    }
    if (periodKind === 'year') return [Number(mesRef), 12];
    const [y, m] = mesRef.split('-').map(Number);
    return [y, m || 1];
  }, [mesRef, periodKind]);

  const { data: vendedores } = useVendedores(divisao);
  const { data: produtos } = useQuery({
    queryKey: ['fat-produtos', divisao],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products').select('id, nome').eq('divisao', divisao).eq('ativo', true).order('nome');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---------- Dados do mês selecionado (com filtros) ----------
  const { data: mesData, isLoading } = useQuery({
    queryKey: ['fat-mes', divisao, mesRef, closerFilter, produtoFilter, statusContrato, statusProtocolo],
    queryFn: async () => {
      let q = supabase
        .from('clientes_fechados')
        .select('valor, data_fechamento, status_qualificacao, etapa_processo, closer_id, product_id')
        .eq('divisao', divisao)
        .gte('data_fechamento', startMonth)
        .lte('data_fechamento', endMonth);
      if (closerFilter !== 'all') q = q.eq('closer_id', closerFilter);
      if (produtoFilter !== 'all') q = q.eq('product_id', produtoFilter);
      if (statusContrato !== 'all') q = q.eq('status_qualificacao', statusContrato as 'pendente' | 'qualificado' | 'desqualificado');
      if (statusProtocolo === 'protocolado') q = q.in('etapa_processo', ETAPAS_PROTOCOLADAS as ('entrada' | 'judicial' | 'administrativo' | 'fundo_investimento')[]);
      else if (statusProtocolo === 'aguardando') q = q.eq('etapa_processo', 'aguardando');
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // ---------- Tendência (últimos 6 meses) ----------
  const trendStart = useMemo(() => {
    const d = new Date(refYear, refMonth - 6, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }, [refYear, refMonth]);

  const { data: trendRows } = useQuery({
    queryKey: ['fat-trend', divisao, refYear, refMonth, closerFilter, produtoFilter],
    queryFn: async () => {
      let q = supabase
        .from('clientes_fechados')
        .select('valor, data_fechamento, etapa_processo, closer_id, product_id')
        .eq('divisao', divisao)
        .gte('data_fechamento', trendStart)
        .lte('data_fechamento', endMonth);
      if (closerFilter !== 'all') q = q.eq('closer_id', closerFilter);
      if (produtoFilter !== 'all') q = q.eq('product_id', produtoFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  // ---------- Cálculo das métricas do mês ----------
  const metricas = useMemo(() => {
    const rows = mesData ?? [];
    const contratos = rows.length;
    const totalValor = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
    const ticketMedioReal = contratos > 0 ? totalValor / contratos : 0;
    const ticket = ticketOverride ?? ticketMedioReal;

    const protocoladosReal = rows.filter(r => r.etapa_processo && ETAPAS_PROTOCOLADAS.includes(r.etapa_processo)).length;
    const taxaProtocoloReal = contratos > 0 ? protocoladosReal / contratos : 0;

    const protocolosEsperados = contratos * taxaProtocolo;
    const exitosEsperados = protocolosEsperados * taxaExito;

    const potencialBruto = contratos * ticket;
    const potencialProtocolado = protocolosEsperados * ticket;
    const faturamentoEsperado = exitosEsperados * ticket;

    const receitaPorContrato = ticket * taxaProtocolo * taxaExito;
    const receitaPorProtocolo = ticket * taxaExito;

    // Quantos meses estão cobertos pelo período selecionado (para projeção anual)
    let mesesPeriodo = 1;
    if (periodKind === 'all') {
      const datas = rows.map(r => r.data_fechamento).filter(Boolean) as string[];
      if (datas.length > 0) {
        const min = datas.reduce((a, b) => (a < b ? a : b));
        const max = datas.reduce((a, b) => (a > b ? a : b));
        const [y1, m1] = min.slice(0, 7).split('-').map(Number);
        const [y2, m2] = max.slice(0, 7).split('-').map(Number);
        mesesPeriodo = Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
      }
    } else if (periodKind === 'year') {
      mesesPeriodo = 12;
    } else if (periodKind === 'range') {
      const [y1, m1] = startMonth.slice(0, 7).split('-').map(Number);
      const [y2, m2] = endMonth.slice(0, 7).split('-').map(Number);
      mesesPeriodo = Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
    }
    const projecaoAnual = (faturamentoEsperado / mesesPeriodo) * 12;
    const projecaoAnualBruta = (potencialBruto / mesesPeriodo) * 12;

    return {
      contratos, totalValor, ticketMedioReal, ticket,
      protocoladosReal, taxaProtocoloReal,
      protocolosEsperados, exitosEsperados,
      potencialBruto, potencialProtocolado, faturamentoEsperado,
      receitaPorContrato, receitaPorProtocolo,
      mesesPeriodo, projecaoAnual, projecaoAnualBruta,
    };
  }, [mesData, taxaProtocolo, taxaExito, ticketOverride, periodKind, startMonth, endMonth]);


  // ---------- Tendência por mês ----------
  const trend = useMemo(() => {
    const buckets = new Map<string, { contratos: number; protocolados: number; valor: number }>();
    // inicia 6 meses
    for (let i = -5; i <= 0; i++) {
      const d = new Date(refYear, refMonth - 1 + i, 1);
      buckets.set(ymKey(d), { contratos: 0, protocolados: 0, valor: 0 });
    }
    (trendRows ?? []).forEach(r => {
      if (!r.data_fechamento) return;
      const key = r.data_fechamento.slice(0, 7);
      const b = buckets.get(key);
      if (!b) return;
      b.contratos += 1;
      b.valor += Number(r.valor) || 0;
      if (r.etapa_processo && ETAPAS_PROTOCOLADAS.includes(r.etapa_processo)) b.protocolados += 1;
    });
    return Array.from(buckets.entries()).map(([key, b]) => {
      const [y, m] = key.split('-').map(Number);
      const ticketReal = b.contratos > 0 ? b.valor / b.contratos : 0;
      const ticket = ticketOverride ?? ticketReal;
      const protoEsp = b.contratos * taxaProtocolo;
      const exitosEsp = protoEsp * taxaExito;
      const taxaProtoReal = b.contratos > 0 ? b.protocolados / b.contratos : 0;
      return {
        mes: `${MESES[m - 1]}/${String(y).slice(2)}`,
        contratos: b.contratos,
        protocolosEsperados: Math.round(protoEsp * 10) / 10,
        protocolosRealizados: b.protocolados,
        exitosEsperados: Math.round(exitosEsp * 10) / 10,
        ticket,
        potencialBruto: b.contratos * ticket,
        potencialProtocolado: protoEsp * ticket,
        faturamentoEsperado: exitosEsp * ticket,
        receitaPorContrato: ticket * taxaProtocolo * taxaExito,
        receitaPorProtocolo: ticket * taxaExito,
        taxaProtocoloReal: taxaProtoReal,
      };
    });
  }, [trendRows, refYear, refMonth, taxaProtocolo, taxaExito, ticketOverride]);

  const trendCurr = trend[trend.length - 1];
  const trendPrev = trend[trend.length - 2];

  // garante que cenário vira "custom" quando user mexe nos sliders
  useEffect(() => {
    const p = PRESETS[cenario as Exclude<Cenario, 'custom'>];
    if (!p) return;
    if (Math.abs(p.protocolo - taxaProtocolo) > 0.001 || Math.abs(p.exito - taxaExito) > 0.001) {
      setCenario('custom');
    }
  }, [taxaProtocolo, taxaExito]); // eslint-disable-line

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Faturamento — Funil BI</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modelagem por taxas de conversão: contratos → protocolos → êxitos → receita ponderada
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Período:</span>
          <PeriodSelector value={mesRef} onChange={setMesRef} />
        </div>
      </div>
      <DivisaoSelector value={divisao} onChange={setDivisao} />

      {/* Projeção de êxito */}
      <ProjecaoExito divisao={divisao} />

      {/* Filtros adicionais */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Vendedor</Label>
            <Select value={closerFilter} onValueChange={setCloserFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(vendedores ?? []).map(v => <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Produto</Label>
            <Select value={produtoFilter} onValueChange={setProdutoFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(produtos ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status do Contrato</Label>
            <Select value={statusContrato} onValueChange={setStatusContrato}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="qualificado">Qualificado</SelectItem>
                <SelectItem value="desqualificado">Desqualificado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status do Protocolo</Label>
            <Select value={statusProtocolo} onValueChange={setStatusProtocolo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="protocolado">Protocolado</SelectItem>
                <SelectItem value="aguardando">Aguardando</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Cenários e Sliders */}
      <div className="glass-card p-5 border border-primary/20">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">Simulação de Cenários</h3>
            <span className="text-xs text-muted-foreground">· cenário atual: <strong className="text-foreground capitalize">{cenario}</strong></span>
          </div>
          <div className="flex gap-2">
            {(['conservador','realista','otimista'] as const).map(c => (
              <button
                key={c}
                onClick={() => applyPreset(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  cenario === c
                    ? 'bg-primary/15 text-primary border-primary/40'
                    : 'bg-secondary/50 text-muted-foreground border-border hover:text-foreground'
                }`}
              >{PRESETS[c].label} ({pct(PRESETS[c].protocolo)} · {pct(PRESETS[c].exito)})</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <Label className="text-sm">Taxa de Protocolo</Label>
              <span className="text-xl font-bold text-primary tabular-nums">{pct(taxaProtocolo)}</span>
            </div>
            <Slider value={[taxaProtocolo * 100]} min={0} max={100} step={1}
              onValueChange={([v]) => setTaxaProtocolo(v / 100)} />
            <p className="text-[11px] text-muted-foreground mt-1">% de contratos fechados que viram protocolo</p>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <Label className="text-sm">Taxa de Êxito</Label>
              <span className="text-xl font-bold text-primary tabular-nums">{pct(taxaExito)}</span>
            </div>
            <Slider value={[taxaExito * 100]} min={0} max={100} step={1}
              onValueChange={([v]) => setTaxaExito(v / 100)} />
            <p className="text-[11px] text-muted-foreground mt-1">% de protocolos que geram êxito</p>
          </div>
          <div>
            <div className="flex justify-between items-baseline mb-2">
              <Label className="text-sm">Ticket Médio Cheio</Label>
              <span className="text-xl font-bold text-primary tabular-nums">{fmt(metricas.ticket)}</span>
            </div>
            <Input
              type="number"
              min={0}
              placeholder={`Real: ${fmt(metricas.ticketMedioReal)}`}
              value={ticketOverride ?? ''}
              onChange={e => setTicketOverride(e.target.value ? Number(e.target.value) : null)}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Em branco = média real do período ({fmt(metricas.ticketMedioReal)})
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI Grid — Premium */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 stagger">
            <KPICard
              title="Contratos Fechados"
              info="Total de contratos fechados no período filtrado. O potencial bruto abaixo é a soma dos valores desses contratos."
              value={metricas.contratos}
              icon={Target}
              tone="gold"
              trend={delta(trendCurr?.contratos ?? 0, trendPrev?.contratos ?? 0)}
              sparkline={trend.map(t => t.contratos)}
              subtitle={`${fmt(metricas.potencialBruto)} potencial bruto`}
            />
            <KPICard
              title="Protocolos Esperados"
              info={'Quantos dos contratos fechados devem chegar ao protocolo, aplicando a taxa de protocolo do cenário. Realizados mostra quantos já foram protocolados de fato.'}
              value={metricas.protocolosEsperados}
              format="decimal"
              icon={Sparkles}
              tone="purple"
              trend={delta(trendCurr?.protocolosEsperados ?? 0, trendPrev?.protocolosEsperados ?? 0)}
              sparkline={trend.map(t => t.protocolosEsperados)}
              subtitle={`Realizados: ${metricas.protocoladosReal}`}
            />
            <KPICard
              title="Taxa de Protocolo"
              info={'Percentual dos contratos fechados que viram protocolo, conforme o cenário selecionado. Compare com o real do período para calibrar o cenário.'}
              value={taxaProtocolo * 100}
              format="percent"
              icon={TrendingUp}
              tone="blue"
              subtitle={`Real do período: ${pct(metricas.taxaProtocoloReal)}`}
              alert={metricas.taxaProtocoloReal > 0 && metricas.taxaProtocoloReal < taxaProtocolo - 0.1 ? 'Real abaixo do cenário' : undefined}
            />
            <KPICard
              title="Êxitos Esperados"
              info="Quantos processos devem terminar com êxito: contratos fechados × taxa de protocolo × taxa de êxito do cenário."
              value={metricas.exitosEsperados}
              format="decimal"
              icon={Trophy}
              tone="green"
              trend={delta(trendCurr?.exitosEsperados ?? 0, trendPrev?.exitosEsperados ?? 0)}
              sparkline={trend.map(t => t.exitosEsperados)}
            />
            <KPICard
              title="Taxa de Êxito"
              info="Percentual dos processos protocolados que terminam com êxito, conforme o cenário selecionado."
              value={taxaExito * 100}
              format="percent"
              icon={TrendingUp}
              tone="green"
            />
            <KPICard
              title="Ticket Médio Cheio"
              info="Valor médio por contrato fechado no período (potencial bruto ÷ contratos)."
              value={metricas.ticket}
              format="currency"
              icon={Receipt}
              tone="gold"
              trend={delta(trendCurr?.ticket ?? 0, trendPrev?.ticket ?? 0)}
              sparkline={trend.map(t => t.ticket)}
            />
            <KPICard
              title="Potencial Bruto Contratado"
              info="Soma do valor de todos os contratos fechados no período — o teto de receita se 100% chegarem ao fim com êxito."
              value={metricas.potencialBruto}
              format="currency"
              icon={Wallet}
              tone="orange"
              trend={delta(trendCurr?.potencialBruto ?? 0, trendPrev?.potencialBruto ?? 0)}
              sparkline={trend.map(t => t.potencialBruto)}
            />
            <KPICard
              title="Potencial Protocolado"
              info="Parte do potencial bruto que deve passar do protocolo (potencial × taxa de protocolo)."
              value={metricas.potencialProtocolado}
              format="currency"
              icon={Wallet}
              tone="purple"
              trend={delta(trendCurr?.potencialProtocolado ?? 0, trendPrev?.potencialProtocolado ?? 0)}
              sparkline={trend.map(t => t.potencialProtocolado)}
            />
            <KPICard
              title="Faturamento Esperado"
              info="Receita realista do período: potencial bruto × taxa de protocolo × taxa de êxito. É o valor ponderado pelo funil inteiro."
              value={metricas.faturamentoEsperado}
              format="currency"
              icon={Sparkles}
              tone="green"
              highlight
              trend={delta(trendCurr?.faturamentoEsperado ?? 0, trendPrev?.faturamentoEsperado ?? 0)}
              sparkline={trend.map(t => t.faturamentoEsperado)}
              subtitle="ponderado pelo funil"
            />
            <KPICard
              title="Projeção Anual"
              info="Faturamento esperado do período convertido em ritmo anual (média mensal × 12)."
              value={metricas.projecaoAnual}
              format="currency"
              icon={TrendingUp}
              tone="green"
              highlight
              subtitle={`base ${metricas.mesesPeriodo} ${metricas.mesesPeriodo === 1 ? 'mês' : 'meses'} × 12`}
            />
            <KPICard
              title="Projeção Anual Bruta"
              info="Potencial bruto do período convertido em ritmo anual, sem ponderar pelo funil — o cenário máximo."
              value={metricas.projecaoAnualBruta}
              format="currency"
              icon={Wallet}
              tone="orange"
              subtitle="potencial × 12 / meses do período"
            />
            <KPICard
              title="Receita Esperada / Contrato"
              info="Quanto cada contrato fechado vale em receita esperada (faturamento esperado ÷ contratos). Útil para saber quanto vale um fechamento a mais."
              value={metricas.receitaPorContrato}
              format="currency"
              icon={Receipt}
              tone="teal"
            />
            <KPICard
              title="Receita Esperada / Protocolo"
              info="Quanto cada protocolo vale em receita esperada (faturamento esperado ÷ protocolos esperados)."
              value={metricas.receitaPorProtocolo}
              format="currency"
              icon={Receipt}
              tone="teal"
            />
          </div>

          {/* Funil Premium */}
          <PremiumFunnel m={metricas} />

          {/* Tendências */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Tendência: Contratos × Protocolos × Êxitos">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="contratos" name="Contratos" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="protocolosEsperados" name="Protoc. esp." stroke="hsl(var(--accent))" strokeWidth={2} />
                  <Line type="monotone" dataKey="protocolosRealizados" name="Protoc. real" stroke="hsl(var(--success))" strokeWidth={2} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="exitosEsperados" name="Êxitos esp." stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tendência: Faturamento Esperado (ponderado)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="potencialBruto" name="Potencial Bruto" fill="hsl(var(--muted))" radius={[4,4,0,0]} />
                  <Bar dataKey="potencialProtocolado" name="Potencial Protoc." fill="hsl(var(--accent))" radius={[4,4,0,0]} />
                  <Bar dataKey="faturamentoEsperado" name="Faturamento Esp." fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tendência: Ticket Médio Cheio">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="ticket" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tendência: Receita Esperada / Contrato e / Protocolo">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="receitaPorContrato" name="/ Contrato" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="receitaPorProtocolo" name="/ Protocolo" stroke="hsl(var(--accent))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tendência: Taxa de Protocolo (real vs esperada)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend.map(t => ({ ...t, taxaProtoRealPct: t.taxaProtocoloReal * 100, taxaProtoEspPct: taxaProtocolo * 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="taxaProtoRealPct" name="Real" stroke="hsl(var(--success))" strokeWidth={2} />
                  <Line type="monotone" dataKey="taxaProtoEspPct" name="Esperada" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* BI Avançado: produtos, protocolos, timeline, duração */}
          <FaturamentoBIExtra divisao={divisao} />
        </>
      )}
    </div>
  );
}

// ---------- Subcomponentes ----------
const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '0.75rem',
  color: 'hsl(var(--foreground))',
  fontSize: 12,
};


function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PremiumFunnel({
  m,
}: {
  m: { contratos: number; protocolosEsperados: number; exitosEsperados: number; potencialBruto: number; potencialProtocolado: number; faturamentoEsperado: number; ticket: number; protocoladosReal: number };
}) {
  const stages: FunnelStage[] = [
    { label: 'Contratos Fechados',    count: m.contratos,            value: m.potencialBruto,        tone: 'gold'   },
    { label: 'Protocolos (esperado)', count: m.protocolosEsperados,  value: m.potencialProtocolado,  tone: 'purple' },
    { label: 'Êxitos (esperado)',     count: m.exitosEsperados,      value: m.faturamentoEsperado,   tone: 'green'  },
  ];
  return (
    <div className="premium-card p-5 animate-fade-up">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-foreground">Funil de Conversão</h3>
          <p className="text-xs text-muted-foreground">Contratos → Protocolos → Êxitos · perdas e conversões</p>
        </div>
        <div className="text-right">
          <p className="label-eyebrow">Faturamento esperado</p>
          <p className="text-lg font-bold text-bi-green tabular-nums">{fmt(m.faturamentoEsperado)}</p>
        </div>
      </div>
      <ConversionFunnel stages={stages} />
      <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FunnelStat label="Protoc. real / esperado" value={`${m.protocoladosReal} / ${m.protocolosEsperados.toFixed(1)}`} />
        <FunnelStat label="Ticket cheio" value={fmt(m.ticket)} />
        <FunnelStat label="Potencial Protocolado" value={fmt(m.potencialProtocolado)} />
        <FunnelStat label="Faturamento Esperado" value={fmt(m.faturamentoEsperado)} highlight />
      </div>
    </div>
  );
}

function FunnelStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-2.5 rounded-lg ${highlight ? 'bg-bi-green/10 ring-1 ring-bi-green/30' : 'bg-muted/30'}`}>
      <p className="label-eyebrow">{label}</p>
      <p className={`text-sm font-bold tabular-nums mt-0.5 ${highlight ? 'text-bi-green' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

