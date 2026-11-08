import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy, ArrowUpRight, Loader2, Calendar as CalendarIcon, CalendarDays, Sun, DollarSign, Sparkles, TrendingUp, TrendingDown, Minus, Percent, FileCheck2, Stamp, Clock, Info as InfoIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { fetchAllDashboardData } from '@/lib/dashboard-queries';
import { supabase } from '@/lib/supabase';
import { MonthCountdown } from '@/components/MonthCountdown';
import { FechamentoDiaTable } from '@/components/FechamentoDiaTable';
import { FechamentoCalendarioMes } from '@/components/FechamentoCalendarioMes';
import { MapaFechamentosEstado } from '@/components/MapaFechamentosEstado';
import { PaceFechamentos } from '@/components/PaceFechamentos';
import { GroupCard } from '@/components/GroupCard';
import { SquadsSection } from '@/components/SquadsSection';
import { FunilResumo } from '@/components/FunilResumo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PeriodSelector, detectPeriodKind } from '@/components/PeriodSelector';
import { getEffectiveStatus } from '@/lib/contrato-status';
import { ProjecaoExito } from '@/components/ProjecaoExito';
import { BRAND } from '@/config/brand';
import { cn } from '@/lib/utils';

type Divisao = 'advogados' | 'educacao';

const META_CONTRATOS: Record<Divisao, number> = {
  advogados: 12,
  educacao: 20,
};

const ETAPAS_PROTOCOLADAS = ['entrada', 'judicial', 'administrativo', 'fundo_investimento'];
const TAXA_PROTOCOLO = 0.50;
const TAXA_EXITO = 0.50;

function formatCurrency(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

// Converte o valor do PeriodSelector em intervalo de datas [start, end]
function periodRange(metaMonth: string): { start: string; end: string } {
  const kind = detectPeriodKind(metaMonth);
  if (kind === 'all') return { start: '1970-01-01', end: '2999-12-31' };
  if (kind === 'range') {
    const [, s, e] = metaMonth.split(':');
    return { start: s, end: e };
  }
  if (kind === 'year') return { start: `${metaMonth}-01-01`, end: `${metaMonth}-12-31` };
  const [y, m] = metaMonth.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

type Tone = 'cyan' | 'gold' | 'gold-strong';

interface PremiumKpiProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ElementType;
  tone?: Tone;
  compact?: boolean;
  /** Explicação exibida em tooltip ao passar o cursor no ícone ⓘ */
  info?: string;
}

function PremiumKpi({ label, value, hint, icon: Icon, tone = 'gold', compact, info }: PremiumKpiProps) {
  const toneMap: Record<Tone, { num: string; chip: string; ring: string }> = {
    cyan: {
      num: 'text-[#00BCD4]',
      chip: 'bg-[#00BCD4]/10 text-[#00BCD4] border border-[#00BCD4]/20',
      ring: 'hover:border-[#00BCD4]/40',
    },
    gold: {
      num: 'text-[#F5C518]',
      chip: 'bg-[#F5C518]/10 text-[#F5C518] border border-[#F5C518]/20',
      ring: 'hover:border-[#F5C518]/40',
    },
    'gold-strong': {
      num: 'text-[#F5C518]',
      chip: 'bg-[#F5C518]/15 text-[#F5C518] border border-[#F5C518]/30',
      ring: 'border-[#F5C518]/30 hover:border-[#F5C518]/60 shadow-[0_0_0_1px_hsl(46_91%_53%/0.15)]',
    },
  };
  const t = toneMap[tone];
  return (
    <div
      className={cn(
        'group rounded-2xl bg-[#111827] border border-[#1F2937] p-5 shadow-lg transition-all duration-300 min-w-0 overflow-hidden',
        'hover:bg-[#131b2c]',
        t.ring,
      )}
    >
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF] leading-tight">{label}</p>
          {info && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <span className="cursor-help text-[#9CA3AF]/60 hover:text-[#9CA3AF] shrink-0" aria-label={`O que é ${label}?`}>
                  <InfoIcon className="w-3 h-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                {info}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {Icon && (
          <div className={cn('p-1.5 rounded-lg shrink-0', t.chip)}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <p
        className={cn(
          'font-bold tabular-nums leading-none whitespace-nowrap',
          compact ? 'text-lg sm:text-xl xl:text-2xl' : 'text-3xl xl:text-4xl truncate',
          t.num,
        )}
        title={String(value)}
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-[#9CA3AF] mt-3 truncate">{hint}</p>}
    </div>
  );
}


const Dashboard = () => {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const [closerFilter, setCloserFilter] = useState<string>('all');
  const [squadFilter, setSquadFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const now = new Date();
  const [metaMonth, setMetaMonth] = useState<string>(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [incluirRetro, setIncluirRetro] = useState<boolean>(true);
  const { data: filtroClosers } = useQuery({
    queryKey: ['dash-filtro-closers', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('closers').select('id, nome, squad_id').eq('divisao', divisao).eq('ativo', true).order('nome');
      return (data ?? []) as { id: string; nome: string; squad_id: string | null }[];
    },
  });
  const { data: filtroSquads } = useQuery({
    queryKey: ['dash-filtro-squads', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('squads').select('id, nome').eq('divisao', divisao).order('nome');
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const closerIdsDoSquad = useMemo(() => {
    if (squadFilter === 'all') return undefined;
    return (filtroClosers ?? []).filter(c => c.squad_id === squadFilter).map(c => c.id);
  }, [squadFilter, filtroClosers]);

  const { data: filtroProdutos } = useQuery({
    queryKey: ['dash-filtro-produtos', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, nome').eq('divisao', divisao).eq('ativo', true).order('nome');
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', divisao, metaMonth, incluirRetro, closerFilter, squadFilter, productFilter],
    queryFn: () => fetchAllDashboardData(divisao, metaMonth, incluirRetro, {
      closerId: closerFilter === 'all' ? undefined : closerFilter,
      productId: productFilter === 'all' ? undefined : productFilter,
      closerIds: closerFilter === 'all' ? closerIdsDoSquad : undefined,
    }),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
  });


  // Mesmo queryKey do FunilResumo — usa o cache para mostrar Faturamento Esperado no topo
  const { data: funil } = useQuery({
    queryKey: ['funil-resumo-kpi', divisao, metaMonth, incluirRetro],
    queryFn: async () => {
      const kind = detectPeriodKind(metaMonth);
      let start: string, end: string;
      if (kind === 'all') {
        start = '1970-01-01'; end = '2999-12-31';
      } else if (kind === 'range') {
        const [, s, e] = metaMonth.split(':');
        start = s; end = e;
      } else if (kind === 'year') {
        start = `${metaMonth}-01-01`; end = `${metaMonth}-12-31`;
      } else {
        const [y, m] = metaMonth.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        start = `${y}-${String(m).padStart(2, '0')}-01`;
        end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      }
      let q = supabase
        .from('clientes_fechados')
        .select('valor, etapa_processo')
        .eq('divisao', divisao)
        .gte('data_fechamento', start)
        .lte('data_fechamento', end);
      if (!incluirRetro) q = q.eq('cadastro_retroativo', false);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      const contratos = rows.length;
      const totalValor = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
      const ticket = contratos > 0 ? totalValor / contratos : 0;
      const exitosEsp = contratos * TAXA_PROTOCOLO * TAXA_EXITO;
      return { faturamentoEsperado: exitosEsp * ticket };
    },
    refetchInterval: 30_000,
  });

  // Métricas de protocolo (mesmos filtros de divisão/período/retroativos)
  const { data: protocolos } = useQuery({
    queryKey: ['protocolos-kpi', divisao, metaMonth, incluirRetro],
    queryFn: async () => {
      const { start, end } = periodRange(metaMonth);
      let q = supabase
        .from('clientes_fechados')
        .select('status_qualificacao, teve_exito, protocolado, data_protocolo, data_fechamento, fechado_em, cadastro_retroativo')
        .eq('divisao', divisao);
      if (!incluirRetro) q = q.eq('cadastro_retroativo', false);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];

      const dataFech = (r: (typeof rows)[number]) =>
        r.data_fechamento ?? (r.fechado_em ? String(r.fechado_em).slice(0, 10) : null);
      const inPeriod = (d: string | null) => !!d && d >= start && d <= end;
      const isDesqualificado = (r: (typeof rows)[number]) => getEffectiveStatus(r) === 'desqualificado';

      // Coorte: fechados dentro do período selecionado
      const fechadosPeriodo = rows.filter(r => inPeriod(dataFech(r)));
      const protocoladosCoorte = fechadosPeriodo.filter(r => r.protocolado).length;
      const taxaPeriodo = fechadosPeriodo.length > 0 ? (protocoladosCoorte / fechadosPeriodo.length) * 100 : 0;

      // Geral: todo o histórico, desconsiderando os desqualificados
      const baseGeral = rows.filter(r => !isDesqualificado(r));
      const totalProtocolados = baseGeral.filter(r => r.protocolado).length;
      const taxaGeral = baseGeral.length > 0 ? (totalProtocolados / baseGeral.length) * 100 : 0;

      // Produção: protocolos feitos DENTRO do período (pela data do protocolo)
      const protocoladosNoPeriodo = rows.filter(r => r.protocolado && inPeriod(r.data_protocolo)).length;

      return {
        taxaPeriodo,
        fechadosPeriodo: fechadosPeriodo.length,
        protocoladosCoorte,
        aguardando: fechadosPeriodo.length - protocoladosCoorte,
        taxaGeral,
        totalProtocolados,
        totalFechados: baseGeral.length,
        protocoladosNoPeriodo,
      };
    },
    refetchInterval: 30_000,
  });

  // Métricas de qualificação (coorte: fechados no período)
  const { data: qualificacao } = useQuery({
    queryKey: ['qualificacao-kpi', divisao, metaMonth, incluirRetro],
    queryFn: async () => {
      const { start, end } = periodRange(metaMonth);
      let q = supabase
        .from('clientes_fechados')
        .select('status_qualificacao, protocolado, teve_exito, data_fechamento, fechado_em, cadastro_retroativo')
        .eq('divisao', divisao);
      if (!incluirRetro) q = q.eq('cadastro_retroativo', false);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];

      const dataFech = (r: (typeof rows)[number]) =>
        r.data_fechamento ?? (r.fechado_em ? String(r.fechado_em).slice(0, 10) : null);
      const fechadosPeriodo = rows.filter(r => {
        const d = dataFech(r);
        return !!d && d >= start && d <= end;
      });

      let qualificados = 0, desqualificados = 0, desistencias = 0, pendentes = 0, qualifProtocolados = 0;
      for (const r of fechadosPeriodo) {
        const eff = getEffectiveStatus(r);
        if (eff === 'qualificado' || eff === 'exito' || eff === 'sem_exito') {
          qualificados++;
          if (r.protocolado) qualifProtocolados++;
        } else if (eff === 'desqualificado') desqualificados++;
        else if (eff === 'desistencia') desistencias++;
        else pendentes++;
      }
      const decididos = qualificados + desqualificados + desistencias;
      return {
        total: fechadosPeriodo.length,
        qualificados, desqualificados, desistencias, pendentes, decididos, qualifProtocolados,
        pctQualificados: decididos > 0 ? (qualificados / decididos) * 100 : 0,
        pctDesqualificados: fechadosPeriodo.length > 0 ? (desqualificados / fechadosPeriodo.length) * 100 : 0,
        pctProtocoladoDosQualif: qualificados > 0 ? (qualifProtocolados / qualificados) * 100 : 0,
      };
    },
    refetchInterval: 30_000,
  });

  // Vendas por produto no período
  const { data: vendasProduto } = useQuery({
    queryKey: ['vendas-produto-dashboard', divisao, metaMonth, incluirRetro],
    queryFn: async () => {
      const kind = detectPeriodKind(metaMonth);
      let start: string, end: string;
      if (kind === 'all') { start = '1970-01-01'; end = '2999-12-31'; }
      else if (kind === 'range') { const [, s, e] = metaMonth.split(':'); start = s; end = e; }
      else if (kind === 'year') { start = `${metaMonth}-01-01`; end = `${metaMonth}-12-31`; }
      else {
        const [y, m] = metaMonth.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        start = `${y}-${String(m).padStart(2, '0')}-01`;
        end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      }
      let q = supabase
        .from('clientes_fechados')
        .select('valor, valor_honorarios_recebidos, product_id')
        .eq('divisao', divisao)
        .gte('data_fechamento', start)
        .lte('data_fechamento', end);
      if (!incluirRetro) q = q.eq('cadastro_retroativo', false);
      const [{ data: rows, error }, { data: prods }] = await Promise.all([
        q,
        supabase.from('products').select('id, nome').eq('divisao', divisao),
      ]);
      if (error) throw error;
      const nameMap = new Map((prods ?? []).map((p: any) => [p.id, p.nome]));
      const map = new Map<string, { nome: string; total: number; valor: number; recebido: number }>();
      (rows ?? []).forEach((r: any) => {
        const key = r.product_id ?? '__none__';
        const nome = nameMap.get(key) ?? 'Sem produto';
        const cur = map.get(key) ?? { nome, total: 0, valor: 0, recebido: 0 };
        cur.total += 1;
        cur.valor += Number(r.valor) || 0;
        cur.recebido += Number(r.valor_honorarios_recebidos) || 0;
        map.set(key, cur);
      });
      return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
    },
    refetchInterval: 30_000,
  });


  const periodKind = detectPeriodKind(metaMonth);

  const metaMonthRef = useMemo(() => {
    if (periodKind === 'all') return new Date();
    if (periodKind === 'range') {
      const [, , e] = metaMonth.split(':');
      const [y, m, d] = e.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    if (periodKind === 'year') return new Date(Number(metaMonth), 11, 1);
    const [y, m] = metaMonth.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }, [metaMonth, periodKind]);

  useEffect(() => {
    const refreshDashboard = () => queryClient.invalidateQueries({ queryKey: ['dashboard', divisao] });
    const channel = supabase
      .channel(`dashboard-live-${divisao}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes_fechados', filter: `divisao=eq.${divisao}` }, refreshDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `divisao=eq.${divisao}` }, refreshDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'config', filter: `divisao=eq.${divisao}` }, refreshDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'squads', filter: `divisao=eq.${divisao}` }, refreshDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refreshDashboard)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [divisao, queryClient]);

  const hasData = data && (data.receita.total > 0 || data.clientes.total > 0 || data.agendamentos.total > 0);
  const metaPct = data ? Math.min(100, Math.max(0, data.metaPct || 0)) : 0;

  // Contagem regressiva: dias úteis restantes
  const todayDate = metaMonthRef;
  const nowDate = new Date();
  const isCurrentMonth = todayDate.getFullYear() === nowDate.getFullYear() && todayDate.getMonth() === nowDate.getMonth();
  const isPastMonth = todayDate < new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
  const startDay = isCurrentMonth ? nowDate.getDate() : isPastMonth ? 32 : 1;
  const lastDay = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0).getDate();
  let regressiva = 0;
  for (let d = startDay; d <= lastDay; d++) {
    const wd = new Date(todayDate.getFullYear(), todayDate.getMonth(), d).getDay();
    if (wd !== 0 && wd !== 6) regressiva++;
  }

  return (
    <div className="space-y-10">
      {/* === HEADER === */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#F9FAFB]">Painel</h1>
          <p className="text-sm text-[#9CA3AF] mt-1.5">Visão geral · {BRAND.companyName}</p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setDivisao('advogados')}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all',
                divisao === 'advogados'
                  ? 'bg-[#F5C518]/10 text-[#F5C518] border-[#F5C518]/30'
                  : 'bg-[#111827] text-[#9CA3AF] border-[#1F2937] hover:text-[#F9FAFB] hover:border-gray-600',
              )}
            >
              {BRAND.divisionLabels.advogados}
            </button>
            <button
              onClick={() => setDivisao('educacao')}
              className={cn(
                'px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all',
                divisao === 'educacao'
                  ? 'bg-accent/10 text-accent border-accent/30'
                  : 'bg-[#111827] text-[#9CA3AF] border-[#1F2937] hover:text-[#F9FAFB] hover:border-gray-600',
              )}
            >
              {BRAND.divisionLabels.educacao}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium border cursor-pointer transition-all select-none',
              incluirRetro
                ? 'bg-[#F5C518]/10 text-[#F5C518] border-[#F5C518]/30'
                : 'bg-[#111827] text-[#9CA3AF] border-[#1F2937] hover:text-[#F9FAFB] hover:border-gray-600',
            )}
            title="Quando ativo, contratos retroativos entram nas metas, rankings e gráficos."
          >
            <input
              type="checkbox"
              checked={incluirRetro}
              onChange={(e) => setIncluirRetro(e.target.checked)}
              className="sr-only"
            />
            <span
              className={cn(
                'w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors',
                incluirRetro ? 'bg-[#F5C518] border-[#F5C518]' : 'border-[#4B5563]',
              )}
            >
              {incluirRetro && <span className="w-2 h-2 bg-[#0A0B0F] rounded-[1px]" />}
            </span>
            Incluir retroativos
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[#9CA3AF] uppercase tracking-[0.18em]">Período</span>
            <PeriodSelector value={metaMonth} onChange={setMetaMonth} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={squadFilter} onValueChange={(v) => { setSquadFilter(v); setCloserFilter('all'); }}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Squad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os squads</SelectItem>
            {(filtroSquads ?? []).map(sq => <SelectItem key={sq.id} value={sq.id}>{sq.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={closerFilter} onValueChange={setCloserFilter}>
          <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder="Closer" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Todos os closers</SelectItem>
            {(filtroClosers ?? []).filter(c => squadFilter === 'all' || c.squad_id === squadFilter).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os produtos</SelectItem>
            {(filtroProdutos ?? []).map(pr => <SelectItem key={pr.id} value={pr.id}>{pr.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#F5C518]" />
        </div>
      ) : (
        <>
          {!hasData && (
            <div className="rounded-2xl bg-[#111827] border border-[#1F2937] p-4 text-center text-sm text-[#9CA3AF]">
              Sem registros ainda para {divisao === 'advogados' ? 'Advogados' : 'Educação'} neste período — os painéis abaixo serão preenchidos conforme as vendas forem cadastradas.
            </div>
          )}

          {/* === ROW DE KPIs PRINCIPAIS === */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <PremiumKpi label={periodKind === 'year' ? 'Fechamentos · Ano' : periodKind === 'all' ? 'Fechamentos · Total' : periodKind === 'range' ? 'Fechamentos · Período' : 'Fechamentos · Mês'} value={data.contagens.mes} icon={CalendarIcon} tone="cyan" info="Contratos fechados no período selecionado, considerando os filtros ativos." />
            <PremiumKpi label="Fechamentos · Semana" value={data.contagens.semana} icon={CalendarDays} tone="cyan" info="Contratos fechados na semana atual (segunda a domingo)." />
            <PremiumKpi label="Fechamentos · Dia" value={data.contagens.hoje} icon={Sun} tone="cyan" info="Contratos fechados hoje." />
            <PremiumKpi label={periodKind === 'year' ? 'Receita Anual' : periodKind === 'all' ? 'Receita Total' : periodKind === 'range' ? 'Receita do Período' : 'Receita Mensal'} value={formatCurrency(data.receita.total)} hint={data.metaMensal > 0 ? `de ${formatCurrency(data.metaMensal)}` : undefined} icon={DollarSign} tone="gold" compact info="Receita realizada: valor dos contratos de produtos com honorário inicial (no fechamento) + honorários efetivamente recebidos dos demais (ex.: AMEA). Produtos sem honorário inicial não entram aqui no fechamento — o valor deles fica na Projeção de Êxito até ser recebido." />
            <PremiumKpi label="Faturamento Esperado" value={formatCurrency(funil?.faturamentoEsperado ?? 0)} hint="potencial ponderado" icon={Sparkles} tone="gold-strong" compact info="Receita realista do período: potencial contratado × taxa de protocolo × taxa de êxito do funil." />
          </div>

          {/* === PROJEÇÃO DE ÊXITO === */}
          <ProjecaoExito divisao={divisao} />

          {/* === PROTOCOLOS === */}
          <div className="space-y-3">
            <h2 className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-[0.18em]">Protocolos</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PremiumKpi
                label={periodKind === 'year' ? 'Taxa de Protocolo · Ano' : periodKind === 'all' ? 'Taxa de Protocolo · Total' : periodKind === 'range' ? 'Taxa de Protocolo · Período' : 'Taxa de Protocolo · Mês'}
                info="Percentual dos contratos fechados no período que já foram protocolados."
                value={`${(protocolos?.taxaPeriodo ?? 0).toFixed(1).replace('.', ',')}%`}
                hint={`${protocolos?.protocoladosCoorte ?? 0} de ${protocolos?.fechadosPeriodo ?? 0} fechados no período`}
                icon={Percent}
                tone="gold-strong"
                compact
              />
              <PremiumKpi
                label="Taxa de Protocolo · Geral" info="Percentual de todos os contratos já fechados (fora desqualificados) que foram protocolados, sem recorte de período."
                value={`${(protocolos?.taxaGeral ?? 0).toFixed(1).replace('.', ',')}%`}
                hint={`${protocolos?.totalProtocolados ?? 0} de ${protocolos?.totalFechados ?? 0} (fora desqualificados)`}
                icon={FileCheck2}
                tone="cyan"
                compact
              />
              <PremiumKpi
                label={periodKind === 'month' ? 'Protocolados no Mês' : 'Protocolados no Período'}
                info="Protocolos realizados no período, pela data do protocolo — inclui contratos fechados em meses anteriores."
                value={protocolos?.protocoladosNoPeriodo ?? 0}
                hint="pela data do protocolo, inclui fechamentos anteriores"
                icon={Stamp}
                tone="gold"
              />
              <PremiumKpi
                label="Aguardando Protocolo" info="Contratos fechados no período que ainda não foram protocolados."
                value={protocolos?.aguardando ?? 0}
                hint="fechados no período ainda sem protocolo"
                icon={Clock}
                tone="cyan"
              />
            </div>
          </div>

          {/* === QUALIFICAÇÃO === */}
          <div className="space-y-3">
            <h2 className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-[0.18em]">Qualificação</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <PremiumKpi
                label="Contratos Qualificados" info="Percentual de contratos qualificados entre os que já tiveram decisão (qualificado ou desqualificado) no período."
                value={`${(qualificacao?.pctQualificados ?? 0).toFixed(1).replace('.', ',')}%`}
                hint={`${qualificacao?.qualificados ?? 0} de ${qualificacao?.decididos ?? 0} decididos`}
                icon={Percent}
                tone="cyan"
                compact
              />
              <PremiumKpi
                label="Contratos Desqualificados" info="Contratos que caíram na validação (documentação inviável, desistência etc.). Não geram comissão."
                value={`${(qualificacao?.pctDesqualificados ?? 0).toFixed(1).replace('.', ',')}%`}
                hint={`${qualificacao?.desqualificados ?? 0} de ${qualificacao?.total ?? 0} contratos · ${qualificacao?.desistencias ?? 0} desist.`}
                icon={Percent}
                tone="gold"
                compact
              />
              <PremiumKpi
                label="Qualificados Protocolados" info="Entre os contratos qualificados, quantos já foram protocolados."
                value={`${(qualificacao?.pctProtocoladoDosQualif ?? 0).toFixed(1).replace('.', ',')}%`}
                hint={`${qualificacao?.qualifProtocolados ?? 0} de ${qualificacao?.qualificados ?? 0} qualificados`}
                icon={FileCheck2}
                tone="gold-strong"
                compact
              />
              <PremiumKpi
                label="Aguardando Qualificação" info="Contratos fechados no período que ainda estão pendentes de validação pelo time técnico."
                value={qualificacao?.pendentes ?? 0}
                hint="fechados no período ainda pendentes"
                icon={Clock}
                tone="cyan"
              />
            </div>
          </div>

          {/* === TENDÊNCIA DE FECHAMENTO + barra de progresso === */}
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-[0.18em]">Tendência de fechamento</h2>
              <span className="text-[11px] text-[#9CA3AF] tabular-nums">{Math.round(metaPct)}% da meta {periodKind === 'year' ? 'anual' : periodKind === 'all' ? 'total' : periodKind === 'range' ? 'do período' : 'mensal'}</span>
            </div>
            <MonthCountdown
              contratosFechados={data.contagens.mes}
              contratosMeta={data.metaContratos || META_CONTRATOS[divisao]}
              refDate={metaMonthRef}
            />
            <div className="h-1.5 w-full rounded-full bg-[#1F2937] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#F5C518] transition-all duration-700"
                style={{ width: `${metaPct}%` }}
              />
            </div>
            <PaceFechamentos
              divisao={divisao}
              ym={detectPeriodKind(metaMonth) === 'month' ? metaMonth : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
              meta={data.metaContratos || META_CONTRATOS[divisao]}
              incluirRetro={incluirRetro}
              closerId={closerFilter === 'all' ? undefined : closerFilter}
              productId={productFilter === 'all' ? undefined : productFilter}
              closerIds={closerFilter === 'all' ? closerIdsDoSquad : undefined}
            />
          </div>

          {/* === FUNIL PONDERADO === */}
          <FunilResumo divisao={divisao} monthRef={metaMonth} />

          {/* === SQUADS DE FECHAMENTO === */}
          <SquadsSection squads={data.squadsData.squads} stats={data.squadsData.stats} closersBySquad={data.squadsData.closersBySquad} />

          {/* === VENDAS POR PRODUTO === */}
          <div className="rounded-2xl bg-[#111827] border border-[#1F2937] p-6 shadow-lg">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#F5C518]" />
                <h3 className="text-sm font-semibold text-[#F9FAFB]">Vendas por Produto</h3>
              </div>
              <span className="text-[11px] text-[#9CA3AF] tabular-nums">
                {(vendasProduto ?? []).reduce((s, r) => s + r.total, 0)} contratos · {formatCurrency((vendasProduto ?? []).reduce((s, r) => s + r.valor, 0))}
              </span>
            </div>
            {(!vendasProduto || vendasProduto.length === 0) ? (
              <p className="text-[#9CA3AF] text-sm py-6 text-center">Sem vendas no período</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...vendasProduto.map(p => p.valor), 1);
                  return vendasProduto.map((p, i) => {
                    const pct = (p.valor / max) * 100;
                    return (
                      <div key={p.nome + i} className="px-3 py-2.5 rounded-xl hover:bg-[#1F2937]/60 transition-colors">
                        <div className="flex items-center gap-3 mb-1.5">
                          <p className="flex-1 min-w-0 text-sm font-medium text-[#F9FAFB] truncate">{p.nome}</p>
                          <span className="text-xs text-[#9CA3AF] tabular-nums whitespace-nowrap">{p.total} {p.total === 1 ? 'venda' : 'vendas'}</span>
                          <span className="text-sm font-semibold text-[#F5C518] tabular-nums whitespace-nowrap w-28 text-right">{formatCurrency(p.valor)}</span>
                          <span className="text-xs text-[#22C55E] tabular-nums whitespace-nowrap w-28 text-right hidden sm:inline" title="Recebido">{formatCurrency(p.recebido)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#1F2937] overflow-hidden">
                          <div className="h-full rounded-full bg-[#F5C518] transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>


          {/* === Card divisão + Contagem regressiva === */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GroupCard
              title={divisao === 'advogados' ? BRAND.divisionLabels.advogados : BRAND.divisionLabels.educacao}
              mes={data.contagens.mes}
              semana={data.contagens.semana}
              hoje={data.contagens.hoje}
              variant={divisao === 'advogados' ? 'gold' : 'purple'}
            />
            <div className="rounded-2xl bg-[#111827] border border-[#1F2937] p-6 shadow-lg flex flex-col items-center justify-center transition-all hover:border-gray-600">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">Contagem Regressiva</p>
              <p className="text-6xl font-bold text-[#00BCD4] tabular-nums leading-none mt-3">{regressiva}</p>
              <p className="text-[11px] text-[#9CA3AF] mt-2 uppercase tracking-wider">dias úteis</p>
            </div>
          </div>

          {/* === Bloco inferior: Ranking + Fechamento da Semana === */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl bg-[#111827] border border-[#1F2937] p-6 shadow-lg transition-all hover:border-gray-600">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#F5C518]" />
                  <h3 className="text-sm font-semibold text-[#F9FAFB]">Ranking de Vendas</h3>
                </div>
                <button className="text-[11px] text-[#9CA3AF] hover:text-[#F9FAFB] flex items-center gap-1 transition-colors">
                  Ver todos <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
              {data.ranking.length === 0 ? (
                <p className="text-[#9CA3AF] text-sm py-6 text-center">Sem dados ainda</p>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const max = Math.max(...data.ranking.map((r: any) => r.esperado ?? 0), 1);
                    return data.ranking.map((item: any, i) => {
                      const esperado = Number(item.esperado ?? 0);
                      const pct = (esperado / max) * 100;
                      return (
                        <div key={item.name} className="px-3 py-2.5 rounded-xl hover:bg-[#1F2937]/60 transition-colors">
                          <div className="flex items-center gap-3 mb-1.5">
                            <span className={cn(
                              'text-xs font-bold w-5 text-center tabular-nums',
                              i === 0 && 'text-[#F5C518]',
                              i === 1 && 'text-gray-300',
                              i === 2 && 'text-amber-700',
                              i > 2 && 'text-[#9CA3AF]',
                            )}>
                              {i + 1}
                            </span>
                            <p className="flex-1 min-w-0 text-sm font-medium text-[#F9FAFB] truncate">{item.name}</p>
                            <span className="text-sm font-semibold text-[#F5C518] tabular-nums whitespace-nowrap">{formatCurrency(esperado)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#1F2937] overflow-hidden ml-8">
                            <div
                              className="h-full rounded-full bg-[#F5C518] transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            <FechamentoDiaTable rows={data.fechamentoDia} />
          </div>

          {/* === CALENDÁRIO DE FECHAMENTOS (semanas × dias) === */}
          <FechamentoCalendarioMes
            divisao={divisao}
            ym={detectPeriodKind(metaMonth) === 'month' ? metaMonth : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
            incluirRetro={incluirRetro}
            closerId={closerFilter === 'all' ? undefined : closerFilter}
            productId={productFilter === 'all' ? undefined : productFilter}
            closerIds={closerFilter === 'all' ? closerIdsDoSquad : undefined}
          />

          {/* === MAPA DE FECHAMENTOS POR ESTADO (UF pelo DDD) === */}
          <MapaFechamentosEstado
            divisao={divisao}
            start={periodRange(metaMonth).start}
            end={periodRange(metaMonth).end}
            incluirRetro={incluirRetro}
            closerId={closerFilter === 'all' ? undefined : closerFilter}
            squadId={squadFilter === 'all' ? undefined : squadFilter}
            productId={productFilter === 'all' ? undefined : productFilter}
          />
        </>
      )}
    </div>
  );
};

export default Dashboard;
