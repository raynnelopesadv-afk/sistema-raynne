import { LucideIcon, AlertTriangle, Info } from 'lucide-react';
import CountUp from 'react-countup';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendBadge } from './TrendBadge';
import { SparklineChart } from './SparklineChart';

type Tone = 'gold' | 'purple' | 'green' | 'blue' | 'orange' | 'red' | 'teal';

const TONE: Record<Tone, { text: string; bg: string; ring: string; spark: string }> = {
  gold:   { text: 'text-bi-gold',   bg: 'bg-bi-gold/10',   ring: 'ring-bi-gold/30',   spark: 'hsl(var(--bi-gold))' },
  purple: { text: 'text-bi-purple', bg: 'bg-bi-purple/10', ring: 'ring-bi-purple/30', spark: 'hsl(var(--bi-purple))' },
  green:  { text: 'text-bi-green',  bg: 'bg-bi-green/10',  ring: 'ring-bi-green/30',  spark: 'hsl(var(--bi-green))' },
  blue:   { text: 'text-bi-blue',   bg: 'bg-bi-blue/10',   ring: 'ring-bi-blue/30',   spark: 'hsl(var(--bi-blue))' },
  orange: { text: 'text-bi-orange', bg: 'bg-bi-orange/10', ring: 'ring-bi-orange/30', spark: 'hsl(var(--bi-orange))' },
  red:    { text: 'text-bi-red',    bg: 'bg-bi-red/10',    ring: 'ring-bi-red/30',    spark: 'hsl(var(--bi-red))' },
  teal:   { text: 'text-bi-teal',   bg: 'bg-bi-teal/10',   ring: 'ring-bi-teal/30',   spark: 'hsl(var(--bi-teal))' },
};

interface Props {
  title: string;
  value: number;
  format?: 'number' | 'currency' | 'percent' | 'decimal';
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon?: LucideIcon;
  tone?: Tone;
  trend?: number;
  trendInvert?: boolean;
  trendLabel?: string;
  subtitle?: string;
  alert?: string;
  sparkline?: number[];
  highlight?: boolean;
  className?: string;
  /** Explicação exibida em tooltip ao passar o cursor no ícone ⓘ */
  info?: string;
}

export function KPICard({
  title, value, format = 'number', decimals, prefix, suffix, icon: Icon,
  tone = 'gold', trend, trendInvert, trendLabel = 'vs período anterior',
  subtitle, alert, sparkline, highlight, className, info,
}: Props) {
  const t = TONE[tone];

  let dec = decimals;
  let pre = prefix;
  let suf = suffix;
  if (format === 'currency') { dec = dec ?? 0; pre = pre ?? 'R$ '; }
  if (format === 'percent') { dec = dec ?? 1; suf = suf ?? '%'; }
  if (format === 'decimal') { dec = dec ?? 1; }
  if (format === 'number') { dec = dec ?? 0; }

  return (
    <div
      className={cn(
        'premium-card p-4 group relative overflow-hidden',
        highlight && 'ring-1', highlight && t.ring,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div className={cn('p-1.5 rounded-lg', t.bg, t.text)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="label-eyebrow leading-tight">{title}</span>
          {info && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground/60 hover:text-muted-foreground shrink-0" aria-label={`O que é ${title}?`}>
                  <Info className="w-3.5 h-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
                {info}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {typeof trend === 'number' && <TrendBadge value={trend} invert={trendInvert} />}
      </div>

      <div className={cn('text-2xl font-bold tabular-nums tracking-tight', highlight ? t.text : 'text-foreground')}>
        <CountUp
          end={value}
          duration={1.0}
          decimals={dec}
          decimal=","
          separator="."
          prefix={pre}
          suffix={suf}
          preserveValue
        />
      </div>

      {subtitle && (
        <p className="text-[11px] text-muted-foreground mt-1 truncate">{subtitle}</p>
      )}

      {alert && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-bi-orange">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="leading-tight">{alert}</span>
        </div>
      )}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mx-1">
          <SparklineChart data={sparkline} color={t.spark} height={36} />
        </div>
      )}

      {trendLabel && typeof trend === 'number' && !sparkline && (
        <p className="text-[10px] text-muted-foreground mt-2">{trendLabel}</p>
      )}
    </div>
  );
}
