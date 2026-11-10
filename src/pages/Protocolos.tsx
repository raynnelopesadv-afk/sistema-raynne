import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, FileCheck2, Percent, CalendarCheck, Stamp } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { ProductMultiFilter } from '@/components/ProductMultiFilter';
import { KPICard } from '@/components/bi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RegistroDiario } from '@/components/protocolos/RegistroDiario';
import { DesempenhoOperacional } from '@/components/protocolos/DesempenhoOperacional';

type Divisao = 'advogados' | 'educacao';

interface ContratoRow {
  id: string;
  protocolado: boolean;
  data_protocolo: string | null;
  data_fechamento: string | null;
  fechado_em: string | null;
  status_qualificacao: string;
  product_id: string | null;
}

interface MesStats {
  mes: string;         // YYYY-MM
  fechados: number;
  protocolados: number;
  taxa: number;        // 0-100
}

const mesLabel = (ym: string, curto = false) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  const lbl = d.toLocaleDateString('pt-BR', { month: curto ? 'short' : 'long', year: curto ? '2-digit' : 'numeric' });
  return lbl.charAt(0).toUpperCase() + lbl.slice(1);
};

function ContratosProtocolados() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const [productSelected, setProductSelected] = useState<string[]>([]);

  const { data: produtos } = useQuery({
    queryKey: ['produtos-filtro-protocolos', divisao],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, nome').eq('divisao', divisao).eq('ativo', true).order('nome');
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const { data: contratos, isLoading } = useQuery({
    queryKey: ['protocolos', divisao],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select('id, protocolado, data_protocolo, data_fechamento, fechado_em, status_qualificacao, product_id')
        .eq('divisao', divisao);
      if (error) throw error;
      return (data ?? []) as ContratoRow[];
    },
  });

  const stats = useMemo(() => {
    const productSet = new Set(productSelected);
    const rows = (contratos ?? []).filter(r => productSet.size === 0 || (r.product_id && productSet.has(r.product_id)));
    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // mês de fechamento (coorte): data_fechamento; se vazio, usa fechado_em
    const mesFechamento = (r: ContratoRow) =>
      (r.data_fechamento ?? r.fechado_em ?? '').slice(0, 7) || null;

    const byMes = new Map<string, { fechados: number; protocolados: number }>();
    let totalFechados = 0;
    let totalProtocolados = 0;
    let desqualificados = 0;
    let protocoladosNoMesVigente = 0;

    for (const r of rows) {
      const mes = mesFechamento(r);
      totalFechados += 1;
      if (r.protocolado) totalProtocolados += 1;
      if (r.status_qualificacao === 'desqualificado') desqualificados += 1;
      // protocolados NO mês vigente (pela data do protocolo, independente de quando fechou)
      if (r.protocolado && (r.data_protocolo ?? '').slice(0, 7) === mesAtual) {
        protocoladosNoMesVigente += 1;
      }
      if (mes) {
        const agg = byMes.get(mes) ?? { fechados: 0, protocolados: 0 };
        agg.fechados += 1;
        if (r.protocolado) agg.protocolados += 1;
        byMes.set(mes, agg);
      }
    }

    const meses: MesStats[] = Array.from(byMes.entries())
      .map(([mes, v]) => ({
        mes,
        fechados: v.fechados,
        protocolados: v.protocolados,
        taxa: v.fechados > 0 ? (v.protocolados / v.fechados) * 100 : 0,
      }))
      .sort((a, b) => b.mes.localeCompare(a.mes));

    const atual = meses.find(m => m.mes === mesAtual) ?? { mes: mesAtual, fechados: 0, protocolados: 0, taxa: 0 };
    const validos = totalFechados - desqualificados;
    const taxaGeral = totalFechados > 0 ? (totalProtocolados / totalFechados) * 100 : 0;
    const taxaValidos = validos > 0 ? (totalProtocolados / validos) * 100 : 0;

    return {
      mesAtual, meses, atual,
      totalFechados, totalProtocolados, desqualificados,
      taxaGeral, taxaValidos, protocoladosNoMesVigente,
    };
  }, [contratos, productSelected]);

  // gráfico: últimos 12 meses em ordem cronológica
  const chartData = useMemo(
    () => [...stats.meses].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12)
      .map(m => ({ ...m, label: mesLabel(m.mes, true) })),
    [stats.meses],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Protocolos</h1>
        <p className="text-sm text-muted-foreground mt-1">Taxa de protocolo dos contratos fechados</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DivisaoSelector value={divisao} onChange={setDivisao} />
        <ProductMultiFilter
          products={(produtos ?? []).map(p => ({ id: p.id, nome: p.nome }))}
          selected={productSelected}
          onChange={setProductSelected}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title={`Taxa de protocolo · ${mesLabel(stats.mesAtual)}`}
              info="Percentual dos contratos fechados neste mês que já foram protocolados."
              value={stats.atual.taxa}
              format="percent"
              icon={Percent}
              tone="gold"
              highlight
              subtitle={`${stats.atual.protocolados} de ${stats.atual.fechados} contratos fechados no mês`}
            />
            <KPICard
              title="Taxa de protocolo · geral"
              info="Percentual de todos os contratos fechados que foram protocolados, considerando o período inteiro da base."
              value={stats.taxaGeral}
              format="percent"
              icon={FileCheck2}
              tone="blue"
              subtitle={`${stats.totalProtocolados} de ${stats.totalFechados} fechados (todo o período)`}
            />
            <KPICard
              title="Protocolados no mês vigente"
              info="Protocolos feitos no mês atual, pela data do protocolo — mesmo que o contrato tenha sido fechado antes."
              value={stats.protocoladosNoMesVigente}
              icon={Stamp}
              tone="green"
              subtitle="Pela data do protocolo — inclui contratos fechados em meses anteriores"
            />
            <KPICard
              title="Fechados no mês"
              info="Contratos fechados no mês vigente. O subtítulo mostra os desqualificados e a taxa desconsiderando-os."
              value={stats.atual.fechados}
              icon={CalendarCheck}
              tone="purple"
              subtitle={`Desqualificados no período todo: ${stats.desqualificados} · taxa s/ desqualif.: ${stats.taxaValidos.toFixed(1)}%`}
            />
          </div>

          {/* Evolução mensal */}
          <div className="glass-card p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">Taxa de protocolo por mês de fechamento</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Percentual dos contratos fechados em cada mês que já foram protocolados (últimos 12 meses)
              </p>
            </div>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem dados para exibir</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                      formatter={(value: number, _name, item) => {
                        const p = item?.payload as MesStats | undefined;
                        return [`${value.toFixed(1)}% (${p?.protocolados ?? 0}/${p?.fechados ?? 0})`, 'Taxa de protocolo'];
                      }}
                    />
                    <Bar dataKey="taxa" fill="hsl(var(--bi-gold))" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      <LabelList dataKey="taxa" position="top" formatter={(v: number) => `${Math.round(v)}%`} style={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Tabela mês a mês */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 pb-3">
              <h3 className="font-semibold text-foreground">Detalhamento mês a mês</h3>
              <p className="text-xs text-muted-foreground mt-1">Coorte por mês de fechamento do contrato</p>
            </div>
            {stats.meses.length === 0 ? (
              <p className="text-sm text-muted-foreground p-8 text-center">Nenhum contrato fechado nesta divisão</p>
            ) : (
              <div className="divide-y divide-border">
                {stats.meses.map(m => {
                  const isAtual = m.mes === stats.mesAtual;
                  return (
                    <div key={m.mes} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${isAtual ? 'bg-primary/5' : ''}`}>
                      <div className="w-36 shrink-0">
                        <p className={`text-sm font-medium ${isAtual ? 'text-primary' : 'text-foreground'}`}>
                          {mesLabel(m.mes)}{isAtual && ' · atual'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{m.protocolados} de {m.fechados} protocolados</p>
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.min(100, m.taxa)}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-16 text-right">
                        <span className={`text-sm font-bold tabular-nums ${isAtual ? 'text-primary' : 'text-foreground'}`}>
                          {m.taxa.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Protocolos() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titulo-pagina text-3xl">Protocolos</h1>
        <p className="text-sm text-muted-foreground">Cada colaborador lança aqui o que protocolou no dia. O desempenho do operacional sai daqui.</p>
      </div>
      <Tabs defaultValue="registro">
        <TabsList>
          <TabsTrigger value="registro">Registro diário</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho da equipe</TabsTrigger>
          <TabsTrigger value="contratos">Contratos protocolados</TabsTrigger>
        </TabsList>
        <TabsContent value="registro" className="mt-4"><RegistroDiario /></TabsContent>
        <TabsContent value="desempenho" className="mt-4"><DesempenhoOperacional /></TabsContent>
        <TabsContent value="contratos" className="mt-4"><ContratosProtocolados /></TabsContent>
      </Tabs>
    </div>
  );
}
