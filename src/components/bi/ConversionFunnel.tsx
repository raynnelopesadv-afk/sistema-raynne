import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FunnelStage {
  label: string;
  count: number;
  value?: number;
  tone: 'gold' | 'purple' | 'green' | 'teal' | 'blue';
}

const TONE = {
  gold:   { from: 'hsl(var(--bi-gold) / 0.85)',   to: 'hsl(var(--bi-gold))',   text: 'text-bi-gold' },
  purple: { from: 'hsl(var(--bi-purple) / 0.85)', to: 'hsl(var(--bi-purple))', text: 'text-bi-purple' },
  green:  { from: 'hsl(var(--bi-green) / 0.85)',  to: 'hsl(var(--bi-green))',  text: 'text-bi-green' },
  teal:   { from: 'hsl(var(--bi-teal) / 0.85)',   to: 'hsl(var(--bi-teal))',   text: 'text-bi-teal' },
  blue:   { from: 'hsl(var(--bi-blue) / 0.85)',   to: 'hsl(var(--bi-blue))',   text: 'text-bi-blue' },
};

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

interface Props {
  stages: FunnelStage[];
  className?: string;
}

export function ConversionFunnel({ stages, className }: Props) {
  const max = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className={cn('space-y-3', className)}>
      {stages.map((s, i) => {
        const widthPct = (s.count / max) * 100;
        const t = TONE[s.tone];
        const prev = i > 0 ? stages[i - 1] : null;
        const conv = prev && prev.count > 0 ? (s.count / prev.count) * 100 : null;
        const lost = prev ? Math.max(prev.count - s.count, 0) : 0;
        const lostValue = prev?.value && s.value ? Math.max(prev.value - s.value, 0) : 0;

        return (
          <div key={s.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-foreground truncate">{s.label}</span>
                {conv !== null && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                    <ArrowRight className="w-2.5 h-2.5" />
                    {conv.toFixed(0)}%
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2 shrink-0">
                <span className={cn('text-sm font-bold tabular-nums', t.text)}>
                  {s.count.toFixed(s.count % 1 === 0 ? 0 : 1)}
                </span>
                {typeof s.value === 'number' && (
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtMoney(s.value)}</span>
                )}
              </div>
            </div>

            <div className="relative h-9 rounded-lg bg-muted/30 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-700 ease-out"
                style={{
                  width: `${Math.max(widthPct, 1.5)}%`,
                  background: `linear-gradient(90deg, ${t.from}, ${t.to})`,
                }}
              />
              <div className="absolute inset-0 flex items-center justify-between px-3 text-[11px] font-medium">
                <span className="text-background/90 mix-blend-difference">
                  {((s.count / max) * 100).toFixed(0)}% do topo
                </span>
                {lost > 0 && (
                  <span className="text-bi-red/80 tabular-nums">
                    -{lost.toFixed(lost % 1 === 0 ? 0 : 1)} {lostValue ? `· -${fmtMoney(lostValue)}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
