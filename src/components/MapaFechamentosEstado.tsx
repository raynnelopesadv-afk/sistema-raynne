import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ufFromTelefone } from '@/lib/ddd-uf';
import { MapPin } from 'lucide-react';
import brazilMap from '@svg-maps/brazil';

type Divisao = 'advogados' | 'educacao';
const brasil = brazilMap as unknown as { viewBox: string; locations: { id: string; name: string; path: string }[] };

// Centróides (centro real) de cada estado no viewBox 0 0 613 639, para posicionar o número.
const LABEL_POS: Record<string, [number, number]> = {
  AC:[55.3,227],AL:[583.6,230.3],AP:[343.5,59.4],AM:[145.2,147.3],BA:[504.3,277.5],CE:[537.2,161.5],
  DF:[409.4,329.8],ES:[520.5,391.8],GO:[381.2,333.9],MA:[448.3,162.2],MT:[282.5,285.4],MS:[299.5,404.7],
  MG:[458,373.9],PA:[333,144.6],PB:[580.6,192.8],PE:[562.4,211.7],PI:[484.6,197.2],PR:[349.6,476.7],
  RJ:[489.4,435.3],RN:[582.8,172.9],RS:[323.1,566.1],RO:[174.5,252.6],RR:[197,50],SC:[364.8,520.6],
  SP:[395,436.6],SE:[570.8,247.1],TO:[401.1,240.1],
};

/** Mapa geográfico de fechamentos por estado. A UF vem da UF salva ou do DDD. */
export function MapaFechamentosEstado({ divisao, start, end, incluirRetro, closerId, squadId, productId }: { divisao: Divisao; start: string; end: string; incluirRetro: boolean; closerId?: string; squadId?: string; productId?: string }) {
  const { data } = useQuery({
    queryKey: ['mapa-estado', divisao, start, end, incluirRetro, closerId ?? '', squadId ?? '', productId ?? ''],
    queryFn: async () => {
      let q = supabase
        .from('clientes_fechados')
        .select('telefone, uf, cadastro_retroativo, closer_id, product_id')
        .eq('divisao', divisao)
        .gte('data_fechamento', start)
        .lte('data_fechamento', end)
        .eq('conta_fechamento', true);
      if (!incluirRetro) q = q.eq('cadastro_retroativo', false);
      if (closerId) q = q.eq('closer_id', closerId);
      if (productId) q = q.eq('product_id', productId);
      if (squadId && !closerId) {
        const { data: sc } = await supabase.from('closers').select('id').eq('squad_id', squadId);
        const ids = (sc ?? []).map(r => r.id as string);
        if (ids.length === 0) return [];
        q = q.in('closer_id', ids);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(r => ({ telefone: r.telefone as string | null, uf: (r as { uf?: string | null }).uf ?? null }));
    },
    refetchInterval: 60_000,
  });

  const calc = useMemo(() => {
    const counts: Record<string, number> = {};
    let semUf = 0, total = 0;
    for (const r of data ?? []) {
      total += 1;
      const uf = r.uf || ufFromTelefone(r.telefone);
      if (!uf) { semUf += 1; continue; }
      counts[uf] = (counts[uf] ?? 0) + 1;
    }
    const max = Math.max(1, ...Object.values(counts));
    return { counts, max, semUf, total, comUf: total - semUf };
  }, [data]);

  return (
    <div className="glass-card p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Fechamentos por estado</h2>
        <p className="text-[11px] text-muted-foreground">Estado pela UF salva ou pelo DDD do telefone · {calc.comUf} de {calc.total} identificados</p>
      </div>

      <div className="mx-auto" style={{ maxWidth: 460 }}>
        <svg viewBox={brasil.viewBox} className="w-full h-auto" role="img" aria-label="Mapa do Brasil com fechamentos por estado">
          {brasil.locations.map(loc => {
            const uf = loc.id.toUpperCase();
            const n = calc.counts[uf] ?? 0;
            const a = n > 0 ? 0.22 + 0.78 * Math.sqrt(n / calc.max) : 0;
            return (
              <path
                key={loc.id}
                d={loc.path}
                fill={n > 0 ? `rgba(37, 99, 235, ${a})` : 'rgba(148, 163, 184, 0.12)'}
                stroke="hsl(var(--background))"
                strokeWidth={0.8}
                strokeLinejoin="round"
              >
                <title>{`${uf}: ${n} fechamento(s)`}</title>
              </path>
            );
          })}
          {Object.entries(calc.counts).map(([uf, n]) => {
            const pos = LABEL_POS[uf];
            if (!pos || !n) return null;
            return (
              <text key={`t-${uf}`} x={pos[0]} y={pos[1]} textAnchor="middle" dominantBaseline="central"
                style={{ fontSize: 13, fontWeight: 700, fill: '#fff', paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 2.2 }}>
                {n}
              </text>
            );
          })}
        </svg>
      </div>

      {calc.semUf > 0 && (
        <p className="text-[11px] text-muted-foreground text-center">{calc.semUf} sem estado identificado (telefone ausente ou DDD inválido).</p>
      )}
    </div>
  );
}
