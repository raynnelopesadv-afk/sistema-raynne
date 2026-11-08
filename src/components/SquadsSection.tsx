import { TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';
import dragonImg from '@/assets/squad-dragon.jpeg';
import falconImg from '@/assets/squad-falcon.jpeg';
import foxImg from '@/assets/squad-fox.jpeg';
import { cn } from '@/lib/utils';

interface Squad {
  name: string;
  motto: string;
  img: string;
  accent?: string;
  barClass?: string;
  fechados: number;
  meta: number;
}

interface SquadsSectionProps {
  squads?: Squad[];
  stats?: Record<string, { fechados: number; meta: number }>;
  /** Optional ranking of closers per squad: { 'Dragon': [{name, total}, ...] } */
  closersBySquad?: Record<string, { name: string; total: number }[]>;
}

const DEFAULT_SQUADS: Squad[] = [
  { name: 'Dragon', motto: 'Fogo constante, faturamento crescente', img: dragonImg, accent: 'text-primary', barClass: 'bg-primary', fechados: 0, meta: 0 },
  { name: 'Falcon', motto: 'Viu a oportunidade, atacou.', img: falconImg, accent: 'text-cyan-400', barClass: 'bg-cyan-400', fechados: 0, meta: 0 },
  { name: 'Fox Squad', motto: 'Rápidos. Implacáveis.', img: foxImg, accent: 'text-accent', barClass: 'bg-accent', fechados: 0, meta: 0 },
];

const DEFAULT_FLAG_BY_NAME: Record<string, string> = {
  Dragon: dragonImg,
  Falcon: falconImg,
  'Fox Squad': foxImg,
};

const RANK_BADGE = ['bg-primary/15 text-primary border-primary/30', 'bg-secondary text-foreground border-border', 'bg-secondary/60 text-muted-foreground border-border'];

function SquadRow({ squad, rank, closers }: { squad: Squad; rank: number; closers?: { name: string; total: number }[] }) {
  const pct = squad.meta > 0 ? Math.min(100, (squad.fechados / squad.meta) * 100) : 0;
  const accent = squad.accent ?? 'text-primary';
  const barClass = squad.barClass ?? 'bg-primary';
  const trend = pct >= 100 ? 'up' : pct >= 60 ? 'flat' : 'down';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="glass-card p-3 flex items-center gap-3">
      {/* Rank */}
      <div className={cn('flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold shrink-0', RANK_BADGE[rank] ?? RANK_BADGE[2])}>
        {rank + 1}
      </div>

      {/* Flag thumb */}
      <div className="relative w-36 h-36 rounded-xl overflow-hidden bg-background/40 shrink-0 border border-border/40">
        <img src={squad.img || DEFAULT_FLAG_BY_NAME[squad.name] || dragonImg} alt={`Bandeira ${squad.name}`} className="w-full h-full object-cover" loading="lazy" />
      </div>

      {/* Name + progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={cn('font-serif italic text-base font-bold truncate', accent)}>{squad.name}</h3>
          <div className="flex items-center gap-1.5 text-xs tabular-nums shrink-0">
            <span className={cn('font-bold', accent)}>{squad.fechados}</span>
            <span className="text-muted-foreground">/ {squad.meta}</span>
            <TrendIcon className={cn('w-3.5 h-3.5', trendColor)} />
          </div>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-secondary overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-700', barClass)} style={{ width: `${pct}%` }} />
        </div>
        {closers && closers.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground truncate">
            <Trophy className="w-3 h-3 text-primary shrink-0" />
            <span className="truncate">
              {closers.slice(0, 2).map((c, i) => `${c.name.split(' ')[0]} ${c.total}`).join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* Pct */}
      <div className="text-right shrink-0 w-12">
        <p className={cn('text-lg font-bold tabular-nums leading-none', accent)}>{Math.round(pct)}%</p>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">meta</p>
      </div>
    </div>
  );
}

export function SquadsSection({ squads, stats, closersBySquad }: SquadsSectionProps) {
  const list = (squads ?? DEFAULT_SQUADS)
    .map((s) => {
      const o = stats?.[s.name];
      return o ? { ...s, img: s.img || DEFAULT_FLAG_BY_NAME[s.name] || dragonImg, fechados: o.fechados, meta: o.meta } : { ...s, img: s.img || DEFAULT_FLAG_BY_NAME[s.name] || dragonImg };
    })
    .sort((a, b) => b.fechados - a.fechados);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold text-foreground">Squads de Fechamento</h2>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ranking · Mês</p>
      </div>
      <div className="space-y-2">
        {list.map((s, i) => (
          <SquadRow key={s.name} squad={s} rank={i} closers={closersBySquad?.[s.name]} />
        ))}
      </div>
    </section>
  );
}
