import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ComissaoQualificacao } from '@/components/ComissaoQualificacao';
import { BonificacaoRecebimento } from '@/components/BonificacaoRecebimento';
import { tierPorOrdem, badgeStyleDoTier } from '@/lib/nivelTier';
import {
  calcularBonusCombo,
  calcularEstornosMes,
  calcularParcelasMes,
  DEFAULT_SETTINGS,
  ETAPAS,
  fatorMeta,
  isMisto,
  LABEL_ETAPA,
  metaDoCloser,
  RegrasIndex,
  ymOf,
  type ComissaoSettings,
  type ContratoRegras,
  type Etapa,
} from '@/lib/comissaoRegras';

type Divisao = 'advogados' | 'educacao';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface CloserRow { id: string; nome: string; career_level_id: string | null; operacao_product_ids: string[]; }

type ContratoRow = ContratoRegras & {
  cadastro_retroativo?: boolean | null;
  considerar_comissao_retroativa?: boolean | null;
  incompleto?: boolean | null;
};

export default function Comissoes() {
  const queryClient = useQueryClient();
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const today = new Date();
  const [mesRef, setMesRef] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-eventos'] });
      queryClient.invalidateQueries({ queryKey: ['comissoes-fech-meses'] });
      queryClient.invalidateQueries({ queryKey: ['comissao-regras'] });
    };
    const channel = supabase
      .channel(`comissoes-live-${divisao}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes_fechados', filter: `divisao=eq.${divisao}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'closers' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_commission_stages' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_metas' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [divisao, queryClient]);

  const [year, month0] = useMemo(() => {
    const [y, m] = mesRef.split('-').map(Number);
    return [y, (m || 1) - 1];
  }, [mesRef]);

  const startDate = `${year}-${String(month0 + 1).padStart(2, '0')}-01`;
  const endDate = formatDateKey(new Date(year, month0 + 1, 0));

  // ---- Regras: níveis, metas, valores, settings, produtos, closers ----
  const { data: regrasData } = useQuery({
    queryKey: ['comissao-regras', divisao],
    queryFn: async () => {
      const [levels, metas, stages, products, closers, settingsRow] = await Promise.all([
        supabase.from('career_levels').select('id, nome, ordem, bonus_combo').eq('ativo', true).order('ordem'),
        supabase.from('product_metas').select('product_id, career_level_id, meta_contratos'),
        supabase.from('product_commission_stages').select('product_id, career_level_id, etapa, variante, valor'),
        supabase.from('products').select('id, nome').eq('divisao', divisao),
        supabase.from('closers').select('id, nome, career_level_id, operacao_product_ids').eq('ativo', true).eq('divisao', divisao).order('nome'),
        supabase.from('config').select('valor').eq('divisao', divisao).eq('chave', 'comissao_settings').maybeSingle(),
      ]);
      const err = levels.error ?? metas.error ?? stages.error ?? products.error ?? closers.error;
      if (err) throw err;
      const sv = (settingsRow.data?.valor ?? null) as Partial<ComissaoSettings> | null;
      const settings: ComissaoSettings = {
        pisoPct: sv?.pisoPct ?? DEFAULT_SETTINGS.pisoPct,
        proporcional: sv?.proporcional ?? DEFAULT_SETTINGS.proporcional,
        multFds: sv?.multFds ?? DEFAULT_SETTINGS.multFds,
        iaMultFds: sv?.iaMultFds ?? DEFAULT_SETTINGS.iaMultFds,
      };
      return {
        levels: levels.data ?? [],
        metas: (metas.data ?? []) as { product_id: string; career_level_id: string; meta_contratos: number }[],
        stages: (stages.data ?? []) as { product_id: string; career_level_id: string; etapa: Etapa; variante: string | null; valor: number }[],
        products: (products.data ?? []) as { id: string; nome: string }[],
        closers: (closers.data ?? []) as CloserRow[],
        settings,
      };
    },
    refetchInterval: 30_000,
  });

  // ---- Contratos com alguma etapa no mês de referência ----
  const { data: eventos, isLoading } = useQuery({
    queryKey: ['comissoes-eventos', divisao, mesRef],
    queryFn: async () => {
      const cols = 'id, closer_id, product_id, variante, data_fechamento, data_protocolo, data_pagamento_confirmado, status_qualificacao, fechado_por_ia, cadastro_retroativo, considerar_comissao_retroativa, incompleto, conta_fechamento';
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select(cols)
        .eq('divisao', divisao)
        .or([
          `and(data_fechamento.gte.${startDate},data_fechamento.lte.${endDate})`,
          `and(data_protocolo.gte.${startDate},data_protocolo.lte.${endDate})`,
          `and(data_pagamento_confirmado.gte.${startDate},data_pagamento_confirmado.lte.${endDate})`,
        ].join(','));
      if (error) throw error;
      return ((data ?? []) as ContratoRow[]).filter(c => (!c.cadastro_retroativo || c.considerar_comissao_retroativa) && !c.incompleto && (c as { conta_fechamento?: boolean }).conta_fechamento !== false);
    },
    refetchInterval: 15_000,
  });

  // ---- Contagem de fechamentos por closer|produto|mês (para o fator de meta) ----
  const mesesFechamento = useMemo(() => {
    const set = new Set<string>();
    (eventos ?? []).forEach(c => {
      const ym = ymOf(c.data_fechamento);
      if (ym) set.add(ym);
    });
    return Array.from(set).sort();
  }, [eventos]);

  const { data: contagemFechamentos } = useQuery({
    queryKey: ['comissoes-fech-meses', divisao, mesesFechamento.join(',')],
    enabled: mesesFechamento.length > 0,
    queryFn: async () => {
      const out = new Map<string, number>();
      await Promise.all(mesesFechamento.map(async ym => {
        const [y, m] = ym.split('-').map(Number);
        const s = `${y}-${String(m).padStart(2, '0')}-01`;
        const e = formatDateKey(new Date(y, m, 0));
        const { data, error } = await supabase
          .from('clientes_fechados')
          .select('closer_id, product_id, cadastro_retroativo, considerar_comissao_retroativa, status_qualificacao, incompleto, conta_fechamento')
          .eq('divisao', divisao)
          .gte('data_fechamento', s)
          .lte('data_fechamento', e);
        if (error) throw error;
        (data ?? [])
          .filter((c: { cadastro_retroativo?: boolean | null; considerar_comissao_retroativa?: boolean | null; incompleto?: boolean | null; conta_fechamento?: boolean | null }) => (!c.cadastro_retroativo || c.considerar_comissao_retroativa) && !c.incompleto && c.conta_fechamento !== false)
          .forEach((c: { closer_id: string | null; product_id: string | null }) => {
            if (!c.closer_id || !c.product_id) return;
            const k = `${c.closer_id}|${c.product_id}|${ym}`;
            out.set(k, (out.get(k) ?? 0) + 1);
          });
      }));
      return out;
    },
    refetchInterval: 15_000,
  });

  // ---- Contratos desqualificados/desistência NO MÊS (para estorno) ----
  const { data: desqualificados } = useQuery({
    queryKey: ['comissoes-desq', divisao, mesRef],
    queryFn: async () => {
      const [y, m] = mesRef.split('-').map(Number);
      const ini = `${y}-${String(m).padStart(2, '0')}-01`;
      const fim = formatDateKey(new Date(y, m, 0));
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select('id, nome_cliente, closer_id, product_id, variante, data_fechamento, data_protocolo, data_pagamento_confirmado, status_qualificacao, fechado_por_ia, data_desqualificacao, cadastro_retroativo, considerar_comissao_retroativa, incompleto')
        .eq('divisao', divisao)
        .in('status_qualificacao', ['desqualificado', 'desistencia'])
        .gte('data_desqualificacao', ini)
        .lte('data_desqualificacao', fim);
      if (error) throw error;
      return ((data ?? []) as Array<ContratoRow & { data_desqualificacao?: string | null; nome_cliente?: string | null }>)
        .filter(c => (!c.cadastro_retroativo || c.considerar_comissao_retroativa) && !c.incompleto);
    },
    refetchInterval: 15_000,
  });

  // ---- Cálculo ----
  const calc = useMemo(() => {
    if (!regrasData || !eventos) return null;
    const regras = new RegrasIndex(regrasData.stages, regrasData.metas);
    const nivelPorCloser = new Map(regrasData.closers.map(c => [c.id, c.career_level_id]));
    const operacaoPorCloser = new Map(regrasData.closers.map(c => [c.id, new Set(c.operacao_product_ids ?? [])]));
    const parcelas = calcularParcelasMes({
      ymRef: mesRef,
      contratosEvento: eventos,
      contagemFechamentos: contagemFechamentos ?? new Map(),
      nivelPorCloser,
      regras,
      settings: regrasData.settings,
      operacaoPorCloser,
    });
    const bonusPorNivel = new Map((regrasData.levels as Array<{ id: string; bonus_combo?: number }>).map(l => [l.id, Number(l.bonus_combo) || 0]));
    const bonusCombo = calcularBonusCombo({
      ymRef: mesRef,
      closers: regrasData.closers,
      operacaoPorCloser,
      contagemFechamentos: contagemFechamentos ?? new Map(),
      regras,
      bonusPorNivel,
    });
    const estornos = calcularEstornosMes({
      ymRef: mesRef,
      contratosDesqualificados: (desqualificados ?? []) as never,
      contagemFechamentos: contagemFechamentos ?? new Map(),
      nivelPorCloser,
      regras,
      settings: regrasData.settings,
      operacaoPorCloser,
    });
    return { regras, nivelPorCloser, operacaoPorCloser, parcelas, bonusCombo, estornos };
  }, [regrasData, eventos, contagemFechamentos, mesRef, desqualificados]);

  const productMap = useMemo(() => new Map((regrasData?.products ?? []).map(p => [p.id, p.nome])), [regrasData]);
  const levelMap = useMemo(() => new Map((regrasData?.levels ?? []).map(l => [l.id, l.nome])), [regrasData]);
  const levelOrdemMap = useMemo(() => new Map(((regrasData?.levels ?? []) as Array<{ id: string; ordem: number }>).map(l => [l.id, l.ordem])), [regrasData]);

  interface LinhaCloser {
    closer: CloserRow;
    misto: boolean;
    bonusCombo: number;
    fechadosMes: number;
    porEtapa: Record<Etapa, number>;
    descontos: number;                       // total estornado no mês (valor negativo)
    detalheDescontos: Array<{ cliente: string; produto: string; etapa: Etapa; valor: number }>;
    total: number;
    produtos: Array<{
      productId: string;
      nome: string;
      fechadosMes: number;
      meta: number;
      pct: number;
      fator: number;
      porEtapa: Record<Etapa, number>;
      total: number;
      semRegras: boolean;
    }>;
  }

  const linhas: LinhaCloser[] = useMemo(() => {
    if (!calc || !regrasData) return [];
    const { regras, parcelas } = calc;
    const settings = regrasData.settings;

    return regrasData.closers.map(closer => {
      const minhasParcelas = parcelas.filter(p => p.closer_id === closer.id);
      const meusFechadosMes = (eventos ?? []).filter(c => c.closer_id === closer.id && ymOf(c.data_fechamento) === mesRef);
      const operacao = calc.operacaoPorCloser.get(closer.id);
      const misto = isMisto(operacao);
      const bonusCombo = calc.bonusCombo.get(closer.id) ?? 0;

      // produtos relevantes: com parcela no mês ou com fechamento no mês
      const prodIds = new Set<string>();
      minhasParcelas.forEach(p => prodIds.add(p.product_id));
      meusFechadosMes.forEach(c => { if (c.product_id) prodIds.add(c.product_id); });

      const produtos = Array.from(prodIds).map(pid => {
        const fechados = meusFechadosMes.filter(c => c.product_id === pid).length;
        const meta = metaDoCloser({ regras, productId: pid, levelId: closer.career_level_id, operacao });
        const pct = meta > 0 ? (fechados / meta) * 100 : 0;
        const fator = meta > 0 ? fatorMeta(pct, settings) : 0;
        const porEtapa = { fechamento: 0, protocolo: 0, pagamento: 0 } as Record<Etapa, number>;
        minhasParcelas.filter(p => p.product_id === pid).forEach(p => { porEtapa[p.etapa] += p.valor; });
        const total = porEtapa.fechamento + porEtapa.protocolo + porEtapa.pagamento;
        return {
          productId: pid,
          nome: productMap.get(pid) ?? '—',
          fechadosMes: fechados,
          meta,
          pct,
          fator,
          porEtapa,
          total,
          semRegras: !regras.temRegras(pid, closer.career_level_id),
        };
      }).sort((a, b) => b.total - a.total);

      const porEtapa = { fechamento: 0, protocolo: 0, pagamento: 0 } as Record<Etapa, number>;
      minhasParcelas.forEach(p => { porEtapa[p.etapa] += p.valor; });

      // descontos (estornos) do mês: contratos desqualificados após já terem comissionado
      const meusEstornos = (calc.estornos ?? []).filter(e => e.closer_id === closer.id);
      const descontos = meusEstornos.reduce((sum, e) => sum + e.valor, 0);
      const detalheDescontos = meusEstornos.map(e => ({
        cliente: e.cliente ?? '—',
        produto: productMap.get(e.product_id) ?? '—',
        etapa: e.etapa,
        valor: e.valor,
      }));

      return {
        closer,
        misto,
        bonusCombo,
        fechadosMes: meusFechadosMes.length,
        porEtapa,
        descontos,
        detalheDescontos,
        total: porEtapa.fechamento + porEtapa.protocolo + porEtapa.pagamento + bonusCombo + descontos,
        produtos,
      };
    }).sort((a, b) => b.total - a.total);
  }, [calc, regrasData, eventos, mesRef, productMap]);

  const totais = useMemo(() => {
    return linhas.reduce(
      (acc, l) => {
        acc.fechados += l.fechadosMes;
        acc.fechamento += l.porEtapa.fechamento;
        acc.protocolo += l.porEtapa.protocolo;
        acc.pagamento += l.porEtapa.pagamento;
        acc.combo += l.bonusCombo;
        acc.descontos += l.descontos;
        acc.total += l.total;
        return acc;
      },
      { fechados: 0, fechamento: 0, protocolo: 0, pagamento: 0, combo: 0, descontos: 0, total: 0 },
    );
  }, [linhas]);

  const avisos = useMemo(() => {
    const out: string[] = [];
    if (!regrasData) return out;
    const semNivel = regrasData.closers.filter(c => !c.career_level_id);
    if (semNivel.length > 0) {
      out.push(`Closers sem nível de carreira (não comissionam): ${semNivel.map(c => c.nome).join(', ')}. Defina em Config → Comissões.`);
    }
    const produtosSemRegra = new Set<string>();
    linhas.forEach(l => l.produtos.forEach(p => { if (p.semRegras && l.closer.career_level_id) produtosSemRegra.add(p.nome); }));
    if (produtosSemRegra.size > 0) {
      out.push(`Produtos sem regras de comissão para o nível dos closers: ${Array.from(produtosSemRegra).join(', ')}. Configure na aba Produtos.`);
    }
    return out;
  }, [regrasData, linhas]);

  const mesesOpcoes = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const base = new Date();
    base.setDate(1);
    for (let i = -1; i <= 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      opts.push({ value: ym, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    if (!opts.find(o => o.value === mesRef)) {
      const [y, m] = mesRef.split('-').map(Number);
      const d = new Date(y, (m || 1) - 1, 1);
      opts.unshift({ value: mesRef, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
    }
    return opts;
  }, [mesRef]);

  const settings = regrasData?.settings ?? DEFAULT_SETTINGS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comissões</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Variável por produto × nível × etapa · piso {settings.pisoPct}% da meta{settings.proporcional ? ' · proporcional até 99%' : ''} · sáb/dom {settings.multFds}×
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Mês de referência:</span>
          <Select value={mesRef} onValueChange={setMesRef}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-80">
              {mesesOpcoes.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)} className="w-40" />
        </div>
      </div>

      <DivisaoSelector value={divisao} onChange={setDivisao} />

      <Tabs defaultValue="vendas" className="w-full">
        <TabsList>
          <TabsTrigger value="vendas">Comissão de Vendas</TabsTrigger>
          <TabsTrigger value="qualificacao">Comissão de Qualificação</TabsTrigger>
          <TabsTrigger value="bonificacoes">Bonificações</TabsTrigger>
        </TabsList>

        <TabsContent value="qualificacao" className="mt-4">
          <ComissaoQualificacao divisao={divisao} mesRef={mesRef} />
        </TabsContent>

        <TabsContent value="bonificacoes" className="mt-4">
          <BonificacaoRecebimento divisao={divisao} mesRef={mesRef} />
        </TabsContent>

        <TabsContent value="vendas" className="mt-4 space-y-6">
          {avisos.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 space-y-1">
              {avisos.map((a, i) => (
                <p key={i} className="text-xs text-warning flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {a}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <KPI label="Contratos fechados no mês" value={String(totais.fechados)} />
            <KPI label="Parcelas de fechamento" value={brl(totais.fechamento)} />
            <KPI label="Parcelas de protocolo" value={brl(totais.protocolo)} />
            <KPI label="Parcelas de pagamento" value={brl(totais.pagamento)} />
            <KPI label="Bônus de combo" value={brl(totais.combo)} />
            <KPI label="Descontos (estornos)" value={brl(totais.descontos)} />
            <KPI label="Variável total do mês" value={brl(totais.total)} />
          </div>

          {isLoading || !regrasData ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : linhas.length === 0 ? (
            <div className="glass-card p-12 text-center"><p className="text-muted-foreground">Sem closers ativos nessa divisão.</p></div>
          ) : (
            <div className="glass-card overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Closer</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead className="text-center">Fechados no mês</TableHead>
                    <TableHead className="text-right">Fechamento</TableHead>
                    <TableHead className="text-right">Protocolo</TableHead>
                    <TableHead className="text-right">Pagamento</TableHead>
                    <TableHead className="text-right">Combo</TableHead>
                    <TableHead className="text-right">Descontos</TableHead>
                    <TableHead className="text-right">Total do mês</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map(l => (
                    <>
                      <TableRow key={l.closer.id} className="cursor-pointer" onClick={() => setExpanded(e => ({ ...e, [l.closer.id]: !e[l.closer.id] }))}>
                        <TableCell>{expanded[l.closer.id] ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}</TableCell>
                        <TableCell className="font-medium">{l.closer.nome}</TableCell>
                        <TableCell>
                          {l.closer.career_level_id
                            ? (() => {
                                const tier = tierPorOrdem(levelOrdemMap.get(l.closer.career_level_id!));
                                return (
                                  <span
                                    className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={tier ? badgeStyleDoTier(tier) : undefined}
                                  >
                                    {tier ? `${tier.nome} · ` : ''}{levelMap.get(l.closer.career_level_id) ?? '—'}
                                  </span>
                                );
                              })()
                            : <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">Sem nível</span>}
                          {l.misto && <span className="ml-1 inline-flex px-2 py-0.5 rounded-full text-xs bg-purple-500/15 text-purple-400" title="Opera 2+ produtos: metas reduzidas em 1/3 e direito ao bônus de combo">Misto</span>}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{l.fechadosMes}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(l.porEtapa.fechamento)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(l.porEtapa.protocolo)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(l.porEtapa.pagamento)}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.bonusCombo > 0 ? <span className="text-success font-semibold">{brl(l.bonusCombo)}</span> : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.descontos < 0
                            ? <span className="text-destructive font-semibold" title="Estorno de comissão de contratos desqualificados/desistência em meses anteriores">{brl(l.descontos)}</span>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{brl(l.total)}</TableCell>
                      </TableRow>
                      {expanded[l.closer.id] && l.produtos.length > 0 && (
                        <TableRow key={`${l.closer.id}-det`}>
                          <TableCell colSpan={10} className="bg-white/[0.02] p-0">
                            <div className="px-10 py-3">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Produto</TableHead>
                                    <TableHead className="text-center">Fechados</TableHead>
                                    <TableHead className="text-center">Meta</TableHead>
                                    <TableHead className="text-center">% Meta</TableHead>
                                    <TableHead className="text-center">Fator aplicado</TableHead>
                                    {ETAPAS.map(e => <TableHead key={e} className="text-right">{LABEL_ETAPA[e]}</TableHead>)}
                                    <TableHead className="text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {l.produtos.map(p => (
                                    <TableRow key={p.productId}>
                                      <TableCell className="font-medium">
                                        {p.nome}
                                        {p.semRegras && <span className="ml-2 text-[10px] text-warning">sem regras p/ este nível</span>}
                                      </TableCell>
                                      <TableCell className="text-center tabular-nums">{p.fechadosMes}</TableCell>
                                      <TableCell className="text-center tabular-nums">{p.meta || '—'}</TableCell>
                                      <TableCell className="text-center tabular-nums">{p.meta > 0 ? `${p.pct.toFixed(0)}%` : '—'}</TableCell>
                                      <TableCell className="text-center tabular-nums">{(p.fator * 100).toFixed(0)}%</TableCell>
                                      {ETAPAS.map(e => <TableCell key={e} className="text-right tabular-nums">{brl(p.porEtapa[e])}</TableCell>)}
                                      <TableCell className="text-right tabular-nums font-semibold">{brl(p.total)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              <p className="text-[11px] text-muted-foreground mt-2">
                                Parcelas creditadas neste mês conforme a etapa (fechamento, protocolo ou pagamento confirmado).
                                O fator de meta é sempre o do mês de fechamento do contrato. Contratos de sáb/dom valem {settings.multFds}×.
                              </p>

                              {l.detalheDescontos.length > 0 && (
                                <div className="mt-4 rounded-xl border border-destructive/30 overflow-hidden">
                                  <div className="px-3 py-2 bg-destructive/10">
                                    <p className="text-xs font-semibold text-destructive">Descontos do mês — contratos desqualificados/desistência</p>
                                    <p className="text-[11px] text-muted-foreground">Comissão já creditada em meses anteriores e devolvida agora.</p>
                                  </div>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Cliente</TableHead>
                                        <TableHead>Produto</TableHead>
                                        <TableHead>Etapa estornada</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {l.detalheDescontos.map((d, i) => (
                                        <TableRow key={i}>
                                          <TableCell className="font-medium">{d.cliente}</TableCell>
                                          <TableCell>{d.produto}</TableCell>
                                          <TableCell className="text-muted-foreground">{LABEL_ETAPA[d.etapa]}</TableCell>
                                          <TableCell className="text-right tabular-nums text-destructive font-semibold">{brl(d.valor)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground mt-1 tabular-nums">{value}</p>
    </div>
  );
}
