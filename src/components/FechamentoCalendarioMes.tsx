import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, TrendingDown, Minus, Timer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDuracao, duracaoEntre } from '@/lib/duracao';

type Divisao = 'advogados' | 'educacao';

const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Índice seg=0 ... dom=6 a partir de uma data AAAA-MM-DD. */
function dowIdx(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  return (d.getDay() + 6) % 7;
}

interface Props {
  divisao: Divisao;
  /** 'AAAA-MM' — mês exibido (se o período do painel não for mensal, usa o mês atual) */
  ym: string;
  incluirRetro: boolean;
  /** Filtros do painel (opcionais) */
  closerId?: string;
  productId?: string;
  closerIds?: string[];
}

/** Calendário de calor: fechamentos por dia, semanas × dias da semana. */
export function FechamentoCalendarioMes({ divisao, ym, incluirRetro, closerId, productId, closerIds }: Props) {
  const [year, month] = ym.split('-').map(Number);
  const inicioMes = new Date(year, month - 1, 1);
  const fimMes = new Date(year, month, 0);
  const inicioAnterior = new Date(year, month - 2, 1);
  const fimAnterior = new Date(year, month - 1, 0);

  const { data, isLoading } = useQuery({
    queryKey: ['fech-calendario', divisao, ym, incluirRetro, closerId ?? '', productId ?? '', (closerIds ?? []).join(',')],
    queryFn: async () => {
      let q = supabase
        .from('clientes_fechados')
        .select('data_fechamento, data_criacao_lead, criacao_lead_em, fechado_em, cadastro_retroativo')
        .eq('divisao', divisao)
        .not('data_fechamento', 'is', null)
        .eq('conta_fechamento', true);
      if (!incluirRetro) q = q.eq('cadastro_retroativo', false);
      if (closerId) q = q.eq('closer_id', closerId);
      else if (closerIds && closerIds.length) q = q.in('closer_id', closerIds);
      if (productId) q = q.eq('product_id', productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(r => {
        const x = r as { data_fechamento: string; data_criacao_lead?: string | null; criacao_lead_em?: string | null; fechado_em?: string | null };
        return { f: x.data_fechamento, e: x.criacao_lead_em ?? x.data_criacao_lead ?? null, fim: x.fechado_em ?? x.data_fechamento };
      });
    },
    refetchInterval: 60_000,
  });

  const calc = useMemo(() => {
    if (!data) return null;
    const datas = data.map(r => r.f);
    const doMes = datas.filter(d => d >= ymd(inicioMes) && d <= ymd(fimMes));
    const doAnterior = datas.filter(d => d >= ymd(inicioAnterior) && d <= ymd(fimAnterior));

    // contagem por dia do mês exibido
    const porDia = new Map<string, number>();
    doMes.forEach(d => porDia.set(d, (porDia.get(d) ?? 0) + 1));

    // grade: semanas (linhas) × dias da semana (colunas)
    // ciclo de venda (entrada do lead -> fechamento): média do mês e média por dia
    const ciclos: number[] = [];
    const ciclosPorDia = new Map<string, number[]>();
    for (const r of data) {
      if (!r.e || !r.f) continue;
      if (r.f < ymd(inicioMes) || r.f > ymd(fimMes)) continue;
      const ms = duracaoEntre(r.e, r.fim);
      if (ms === null) continue;
      ciclos.push(ms);
      const arr = ciclosPorDia.get(r.f) ?? [];
      arr.push(ms);
      ciclosPorDia.set(r.f, arr);
    }
    const cicloMedio = ciclos.length ? ciclos.reduce((x, y) => x + y, 0) / ciclos.length : null;
    const cicloQtd = ciclos.length;
    const cicloMedioPorDia = new Map<string, number>();
    ciclosPorDia.forEach((arr, dia) => cicloMedioPorDia.set(dia, arr.reduce((x, y) => x + y, 0) / arr.length));

    const semanas: Array<Array<{ dia: number; qtd: number; ciclo: number | null } | null>> = [];
    let linha: Array<{ dia: number; qtd: number; ciclo: number | null } | null> = new Array(dowIdx(ymd(inicioMes))).fill(null);
    for (let dia = 1; dia <= fimMes.getDate(); dia++) {
      const ds = `${ym}-${String(dia).padStart(2, '0')}`;
      linha.push({ dia, qtd: porDia.get(ds) ?? 0, ciclo: cicloMedioPorDia.get(ds) ?? null });
      if (linha.length === 7) { semanas.push(linha); linha = []; }
    }
    if (linha.length > 0) { while (linha.length < 7) linha.push(null); semanas.push(linha); }

    // totais por coluna (dia da semana) e por linha (semana)
    const totalPorDow = new Array(7).fill(0);
    doMes.forEach(d => { totalPorDow[dowIdx(d)] += 1; });
    const totalPorSemana = semanas.map(sem => sem.reduce((s, c) => s + (c?.qtd ?? 0), 0));

    // média histórica por dia da semana (toda a base até ontem)
    const hoje = new Date();
    const primeira = datas.length > 0 ? datas.reduce((a, b) => (a < b ? a : b)) : null;
    const mediaPorDow = new Array(7).fill(0);
    if (primeira) {
      const contPorDow = new Array(7).fill(0);
      const ocorrenciasDow = new Array(7).fill(0);
      datas.forEach(d => { contPorDow[dowIdx(d)] += 1; });
      const cursor = new Date(primeira + 'T12:00:00');
      while (cursor <= hoje) {
        ocorrenciasDow[(cursor.getDay() + 6) % 7] += 1;
        cursor.setDate(cursor.getDate() + 1);
      }
      for (let i = 0; i < 7; i++) mediaPorDow[i] = ocorrenciasDow[i] > 0 ? contPorDow[i] / ocorrenciasDow[i] : 0;
    }

    const max = Math.max(1, ...Array.from(porDia.values()));
    const totalMes = doMes.length;
    const totalAnterior = doAnterior.length;
    const variacao = totalAnterior > 0 ? ((totalMes - totalAnterior) / totalAnterior) * 100 : null;


    return { semanas, totalPorDow, totalPorSemana, mediaPorDow, max, totalMes, totalAnterior, variacao, cicloMedio, cicloQtd, cicloMedioPorDia };
  }, [data, ym]);

  if (isLoading || !calc) {
    return <div className="glass-card p-5 flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const nomeMes = inicioMes.toLocaleDateString('pt-BR', { month: 'long' });
  const nomeAnterior = inicioAnterior.toLocaleDateString('pt-BR', { month: 'long' });
  const VarIcon = calc.variacao == null ? Minus : calc.variacao >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h3 className="font-semibold text-foreground text-base tracking-wide">Fechamentos do Mês · dia a dia</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary font-semibold tabular-nums">
            {nomeMes}: {calc.totalMes}
          </span>
          <span className="px-2 py-1 rounded-lg bg-secondary/40 text-muted-foreground tabular-nums">
            {nomeAnterior}: {calc.totalAnterior}
          </span>
          {calc.variacao != null && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg tabular-nums font-semibold ${calc.variacao >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
              <VarIcon className="w-3.5 h-3.5" /> {calc.variacao >= 0 ? '+' : ''}{calc.variacao.toFixed(0)}%
            </span>
          )}
          {calc.cicloMedio != null && (
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/40 text-muted-foreground tabular-nums"
              title={`Tempo médio da entrada do lead até o fechamento, em ${calc.cicloQtd} contrato(s) deste mês`}
            >
              <Timer className="w-3.5 h-3.5" /> ciclo {formatDuracao(calc.cicloMedio)}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate" style={{ borderSpacing: '4px' }}>
          <thead>
            <tr className="text-cyan-400/80 text-[10px] uppercase tracking-wider">
              <th className="text-left font-medium w-20"></th>
              {DIAS.map(d => <th key={d} className="font-medium text-center min-w-[52px]">{d}</th>)}
              <th className="font-medium text-center text-primary">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {calc.semanas.map((sem, i) => (
              <tr key={i}>
                <td className="text-[11px] text-muted-foreground whitespace-nowrap pr-1">Semana {i + 1}</td>
                {sem.map((cel, j) => {
                  if (!cel) return <td key={j} />;
                  const intensidade = cel.qtd / calc.max;
                  return (
                    <td key={j}>
                      <div
                        className="relative rounded-lg h-12 flex items-center justify-center border border-border"
                        style={{ background: cel.qtd > 0 ? `rgba(245, 197, 24, ${0.12 + intensidade * 0.55})` : 'rgba(255,255,255,0.02)' }}
                        title={`Dia ${cel.dia}: ${cel.qtd} fechamento${cel.qtd === 1 ? '' : 's'}${cel.ciclo !== null ? ` · ciclo médio ${formatDuracao(cel.ciclo)}` : ''}`}
                      >
                        <span className="absolute top-0.5 left-1.5 text-[9px] text-muted-foreground">{cel.dia}</span>
                        <div className="flex flex-col items-center leading-none">
                          <span className={`text-base font-bold tabular-nums ${cel.qtd > 0 ? (intensidade > 0.6 ? 'text-black' : 'text-primary') : 'text-muted-foreground/40'}`}>
                            {cel.qtd > 0 ? cel.qtd : '·'}
                          </span>
                          {cel.ciclo !== null && (
                            <span className={`text-[9px] mt-0.5 ${intensidade > 0.6 ? 'text-black/70' : 'text-muted-foreground'}`}>
                              {formatDuracao(cel.ciclo)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  );
                })}
                <td className="text-center font-bold text-foreground tabular-nums">{calc.totalPorSemana[i]}</td>
              </tr>
            ))}
            <tr className="text-[11px]">
              <td className="text-muted-foreground pr-1 pt-1">Total dia</td>
              {calc.totalPorDow.map((t, i) => (
                <td key={i} className="text-center font-semibold text-foreground tabular-nums pt-1">{t}</td>
              ))}
              <td className="text-center font-bold text-primary tabular-nums pt-1">{calc.totalMes}</td>
            </tr>
            <tr className="text-[11px]">
              <td className="text-muted-foreground pr-1" title="Média histórica de fechamentos nesse dia da semana, considerando toda a base">Média hist.</td>
              {calc.mediaPorDow.map((m, i) => {
                const acima = calc.totalPorDow[i] / Math.max(1, calc.semanas.filter(s => s[i]).length) >= m;
                return (
                  <td key={i} className={`text-center tabular-nums ${acima ? 'text-success' : 'text-muted-foreground'}`}>
                    {m.toFixed(1)}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        Cor mais forte = mais fechamentos no dia. "Média hist." é a média de fechamentos naquele dia da semana em toda a base — verde quando a média deste mês está igual ou acima. O tempo abaixo do número é o ciclo médio (entrada do lead até o fechamento) dos contratos daquele dia.
      </p>
    </div>
  );
}
