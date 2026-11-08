import { cn } from '@/lib/utils';
import { diasAte, urgencia, URGENCIA_STYLE } from '@/lib/juridico';

export function UrgenciaBadge({ data, feito = false, className }: { data: string | null; feito?: boolean; className?: string }) {
  const u = urgencia(data, feito);
  const s = URGENCIA_STYLE[u];
  const d = diasAte(data);
  let extra = '';
  if (!feito && d !== null) {
    if (d < 0) extra = ` · ${Math.abs(d)}d`;
    else if (d > 1) extra = ` · ${d}d`;
  }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', s.cls, className)}>
      {s.label}{extra}
    </span>
  );
}

export function KpiJuridico({
  label, value, tone = 'default', hint, onClick,
}: { label: string; value: number | string; tone?: 'default' | 'danger' | 'warning' | 'gold'; hint?: string; onClick?: () => void }) {
  const toneCls = {
    default: 'text-foreground',
    danger: 'text-red-700',
    warning: 'text-orange-700',
    gold: 'text-primary',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('glass-card p-4 text-left transition-colors', onClick ? 'hover:border-[hsl(41_45%_70%)] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary' : 'cursor-default')}
    >
      <p className="text-[13px] text-muted-foreground font-medium">{label}</p>
      <p className={cn('titulo-pagina text-4xl mt-1 tabular-nums', toneCls)}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </button>
  );
}
