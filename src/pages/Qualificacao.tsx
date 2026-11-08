import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Percent, TrendingDown, UserCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { KPICard } from '@/components/bi';
import { PeriodSelector, detectPeriodKind, parseRangeToken } from '@/components/PeriodSelector';
import { getEffectiveStatus } from '@/lib/contrato-status';
import { useMotivosDesqualificacao, MOTIVO_DIVERSO } from '@/lib/desqualificacao';

type Divisao = 'advogados' | 'educacao';

interface Row {
  status_qualificacao: string;
  protocolado: boolean | null;
  teve_exito: boolean | null;
  closer_id: string | null;
  motivo_desqualificacao: string | null;
  data_fechamento: string | null;
  fechado_em: string | null;
}

type Grupo = 'qualificado' | 'desqualificado' | 'desistencia' | 'pendente';
function grupoDe(r: Row): Grupo {
  const eff = getEffectiveStatus(r);
  if (eff === 'qualificado' || eff === 'exito' || eff === 'sem_exito') return 'qualificado';
  if (eff === 'desqualificado') return 'desqualificado';
  if (eff === 'desistencia') return 'desistencia';
  return 'pendente';
}

function inPeriodo(r: Row, period: string): boolean {
  const kind = detectPeriodKind(period);
  if (kind === 'all') return true;
  const d = (r.data_fechamento ?? (r.fechado_em ? r.fechado_em.slice(0, 10) : '')) || '';
  if (!d) return false;
  if (kind === 'month') return d.slice(0, 7) === period;
  if (kind === 'year') return d.slice(0, 4) === period;
  if (kind === 'range') { const rg = parseRangeToken(period); return rg ? d >= rg.start && d <= rg.end : true; }
  return true;
}

export default function Qualificacao() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['qualificacao', divisao],
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes_fechados')
        .select('status_qualificacao, protocolado, teve_exito, closer_id, motivo_desqualificacao, data_fechamento, fechado_em')
        .eq('divisao', divisao);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: closers } = useQuery({
    queryKey: ['closers-nomes'],
    queryFn: async () => (await supabase.from('closers').select('id, nome')).data as { id: string; nome: string }[] ?? [],
  });

  const motivosLista = useMotivosDesqualificacao(divisao);

  const stats = useMemo(() => {
    const filtered = (rows ?? []).filter(r => inPeriodo(r, period));
    const counts = { qualificado: 0, desqualificado: 0, desistencia: 0, pendente: 0 };
    const porCloser = new Map<string, { qualificado: number; desqualificado: number; desistencia: number; pendente: number }>();
    const porMotivo = new Map<string, number>();
    const nomeCloser = new Map((closers ?? []).map(c => [c.id, c.nome]));

    for (const r of filtered) {
      const g = grupoDe(r);
      counts[g] += 1;
      const cid = r.closer_id ?? '—';
      const cur = porCloser.get(cid) ?? { qualificado: 0, desqualificado: 0, desistencia: 0, pendente: 0 };
      cur[g] += 1;
      porCloser.set(cid, cur);
      if (g === 'desqualificado') {
        // agrupa pelo motivo canônico (o texto pode ser "Motivo diverso: ...")
        const raw = (r.motivo_desqualificacao ?? '').trim();
        const canon = motivosLista.find(m => raw === m || raw.startsWith(m)) ?? (raw ? MOTIVO_DIVERSO : 'Não informado');
        porMotivo.set(canon, (porMotivo.get(canon) ?? 0) + 1);
      }
    }

    const perdas = counts.desqualificado + counts.desistencia;
    const decididos = counts.qualificado + perdas;
    const taxaQualif = decididos > 0 ? (counts.qualificado / decididos) * 100 : 0;
    const taxaPerda = decididos > 0 ? (perdas / decididos) * 100 : 0;

    const closerTable = Array.from(porCloser.entries())
      .map(([id, v]) => {
        const dec = v.qualificado + v.desqualificado + v.desistencia;
        return {
          nome: nomeCloser.get(id) ?? '(sem closer)',
          ...v,
          decididos: dec,
          taxaQualif: dec > 0 ? (v.qualificado / dec) * 100 : 0,
          taxaPerda: dec > 0 ? ((v.desqualificado + v.desistencia) / dec) * 100 : 0,
        };
      })
      .filter(c => c.decididos > 0)
      .sort((a, b) => b.taxaQualif - a.taxaQualif);

    const motivos: { motivo: string; qtd: number }[] = motivosLista
      .map(m => ({ motivo: m as string, qtd: porMotivo.get(m) ?? 0 }))
      .concat(porMotivo.has('Não informado') ? [{ motivo: 'Não informado', qtd: porMotivo.get('Não informado')! }] : [])
      .filter(x => x.qtd > 0)
      .sort((a, b) => b.qtd - a.qtd);

    return { total: filtered.length, counts, perdas, decididos, taxaQualif, taxaPerda, closerTable, motivos };
  }, [rows, closers, period, motivosLista]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">% Aproveitamento</h1>
        <p className="text-sm text-muted-foreground mt-1">Taxa de protocolo, perdas e motivos de desqualificação</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DivisaoSelector value={divisao} onChange={setDivisao} />
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="Taxa de protocolo" info="Contratos protocolados ÷ contratos decididos (protocolados + desqualificados + desistências) no período." value={stats.taxaQualif} format="percent" icon={Percent} tone="green" highlight
              subtitle={`${stats.counts.qualificado} de ${stats.decididos} decididos`} />
            <KPICard title="Taxa de perda" info="Contratos perdidos (desqualificados + desistências) ÷ contratos decididos no período." value={stats.taxaPerda} format="percent" icon={TrendingDown} tone="red"
              subtitle={`${stats.perdas} perdidos (desq. + desist.)`} />
            <KPICard title="Desqualificados" info="Contratos reprovados na validação. Não comissionam." value={stats.counts.desqualificado} icon={Users} tone="orange" />
            <KPICard title="Desistências" info="Clientes que desistiram após o fechamento. Não comissionam." value={stats.counts.desistencia} icon={Users} tone="orange" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="Contratos no período" info="Todos os contratos fechados no período filtrado." value={stats.total} icon={Users} tone="blue" />
            <KPICard title="Protocolados" info="Contratos protocolados (o protocolo qualifica automaticamente)." value={stats.counts.qualificado} icon={UserCheck} tone="green" />
            <KPICard title="Pendentes" info="Contratos aguardando decisão de qualificação." value={stats.counts.pendente} icon={Users} tone="gold" subtitle="ainda sem decisão" />
            <KPICard title="Decididos" info="Contratos que já saíram de pendente. É o denominador das taxas de protocolo e perda." value={stats.decididos} icon={Users} tone="teal" subtitle="base das taxas" />
          </div>

          {/* Taxa por closer */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 pb-3">
              <h3 className="font-semibold text-foreground">Aproveitamento por closer</h3>
              <p className="text-xs text-muted-foreground mt-1">% de protocolados sobre os contratos já decididos de cada closer</p>
            </div>
            {stats.closerTable.length === 0 ? (
              <p className="text-sm text-muted-foreground p-8 text-center">Sem contratos decididos no período</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left px-5 py-2 font-medium">Closer</th>
                      <th className="text-right px-3 py-2 font-medium">Protoc.</th>
                      <th className="text-right px-3 py-2 font-medium">Desq.</th>
                      <th className="text-right px-3 py-2 font-medium">Desist.</th>
                      <th className="text-right px-3 py-2 font-medium">Decididos</th>
                      <th className="text-left px-5 py-2 font-medium w-56">Taxa de protocolo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {stats.closerTable.map(c => (
                      <tr key={c.nome} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-2.5 font-medium text-foreground">{c.nome}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-bi-green">{c.qualificado}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-bi-red">{c.desqualificado}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums text-bi-orange">{c.desistencia}</td>
                        <td className="text-right px-3 py-2.5 tabular-nums">{c.decididos}</td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-bi-green" style={{ width: `${c.taxaQualif}%` }} />
                            </div>
                            <span className="text-xs font-semibold tabular-nums w-12 text-right">{c.taxaQualif.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Motivos de desqualificação */}
          <div className="glass-card p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground">Motivos de desqualificação</h3>
              <p className="text-xs text-muted-foreground mt-1">Distribuição dos contratos desqualificados por motivo</p>
            </div>
            {stats.motivos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhuma desqualificação no período</p>
            ) : (
              <div className="space-y-2">
                {stats.motivos.map(m => {
                  const pct = stats.counts.desqualificado > 0 ? (m.qtd / stats.counts.desqualificado) * 100 : 0;
                  return (
                    <div key={m.motivo} className="flex items-center gap-3">
                      <span className="text-sm text-foreground w-72 truncate">{m.motivo}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-bi-red/70" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold tabular-nums w-16 text-right">{m.qtd} ({pct.toFixed(0)}%)</span>
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
