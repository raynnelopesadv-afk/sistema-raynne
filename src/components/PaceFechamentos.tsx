import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import { TrendingUp } from 'lucide-react';

type Divisao = 'advogados' | 'educacao';

/**
 * Pace do mês: acumulado real de fechamentos × ritmo necessário para a meta
 * (linha ideal) × projeção no ritmo atual. Mostra se o time está adiantado
 * ou atrasado, dia a dia.
 */
export function PaceFechamentos({ divisao, ym, meta, incluirRetro, closerId, productId, closerIds }: {
  divisao: Divisao; ym: string; meta: number; incluirRetro: boolean;
  closerId?: string; productId?: string; closerIds?: string[];
}) {
  const [year, month] = ym.split('-').map(Number);
  const inicio = `${ym}-01`;
  const ultimoDia = new Date(year, month, 0).getDate();
  const fim = `${ym}-${String(ultimoDia).padStart(2, '0')}`;

  const { data } = useQuery({
    queryKey: ['pace-fech', divisao, ym, incluirRetro, closerId ?? '', productId ?? '', (closerIds ?? []).join(',')],
    queryFn: async () => {
      let q = supabase
        .from('clientes_fechados')
        .select('data_fechamento, cadastro_retroativo')
        .eq('divisao', divisao)
        .gte('data_fechamento', inicio)
        .lte('data_fechamento', fim)
        .eq('conta_fechamento', true);
      if (!incluirRetro) q = q.eq('cadastro_retroativo', false);
      if (closerId) q = q.eq('closer_id', closerId);
      else if (closerIds && closerIds.length) q = q.in('closer_id', closerIds);
      if (productId) q = q.eq('product_id', productId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(r => r.data_fechamento as string);
    },
    refetchInterval: 60_000,
  });

  const { serie, projecaoFinal, ritmoDia, diasRestantes } = useMemo(() => {
    const porDia = new Map<number, number>();
    for (const d of data ?? []) {
      if (!d) continue;
      const dia = Number(String(d).slice(8, 10));
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }
    const hoje = new Date();
    const ehMesAtual = hoje.getFullYear() === year && hoje.getMonth() + 1 === month;
    const diaHoje = ehMesAtual ? Math.min(hoje.getDate(), ultimoDia) : ultimoDia;

    const isUtil = (d: number) => { const wd = new Date(year, month - 1, d).getDay(); return wd !== 0 && wd !== 6; };
    const totalUteis = Array.from({ length: ultimoDia }, (_, i) => i + 1).filter(isUtil).length;

    // Para cada dia: acumulado real e a PROJEÇÃO como ela era naquele dia
    // (acumulado ÷ dias úteis decorridos × dias úteis do mês). Reconstruído
    // a partir das datas de fechamento — não precisa de histórico salvo.
    const MIN_UTEIS = 3; // ignora os primeiros dias (projeção muito instável)
    let acum = 0, uteis = 0, realHoje = 0, uteisHoje = 0, ultimaProj: number | null = null;
    const serie = Array.from({ length: ultimoDia }, (_, i) => {
      const dia = i + 1;
      if (dia <= diaHoje) {
        acum += porDia.get(dia) ?? 0;
        if (isUtil(dia)) uteis += 1;
        realHoje = acum; uteisHoje = uteis;
        if (uteis >= MIN_UTEIS) ultimaProj = Math.round((acum / uteis) * totalUteis);
        return { dia: String(dia).padStart(2, '0'), real: acum, projecao: ultimaProj };
      }
      // dias futuros: mantém a projeção atual (é o que se espera fechar no mês)
      return { dia: String(dia).padStart(2, '0'), real: null as number | null, projecao: ultimaProj };
    });

    const ritmoDia = uteisHoje > 0 ? realHoje / uteisHoje : 0;
    const projecaoFinal = ultimaProj ?? Math.round(ritmoDia * totalUteis);
    const uteisRest = Array.from({ length: ultimoDia }, (_, i) => i + 1).filter(d => d > diaHoje && isUtil(d)).length;
    return { serie, projecaoFinal, ritmoDia, diasRestantes: uteisRest };
  }, [data, year, month, ultimoDia]);

  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Pace do mês</h2>
          <p className="text-[11px] text-muted-foreground">Realizado acumulado e como a projeção de fechamento do mês evoluiu a cada dia</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Projeção</p>
            <p className={`text-lg font-bold tabular-nums ${meta > 0 && projecaoFinal >= meta ? 'text-emerald-400' : 'text-primary'}`}>{projecaoFinal}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ritmo</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{ritmoDia.toFixed(1)}<span className="text-[11px] font-medium text-muted-foreground ml-1">/dia útil</span></p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Faltam</p>
            <p className="text-lg font-bold tabular-nums text-muted-foreground">{diasRestantes}<span className="text-[11px] font-medium ml-1">dias úteis</span></p>
          </div>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="dia" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} interval={2} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              labelFormatter={(l) => `Dia ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {meta > 0 && meta >= projecaoFinal * 0.3 && <ReferenceLine y={meta} stroke="#F5C518" strokeDasharray="4 4" label={{ value: `meta ${meta}`, position: 'right', fill: '#F5C518', fontSize: 10 }} />}
            <Line name="Realizado" type="monotone" dataKey="real" stroke="#22C55E" strokeWidth={2.5} dot={false} connectNulls={false} />
            <Line name="Projeção do mês (dia a dia)" type="monotone" dataKey="projecao" stroke="#A855F7" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
