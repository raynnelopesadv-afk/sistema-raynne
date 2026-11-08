import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  value: number; // pct as 0-100
  invert?: boolean; // if true, negative is good
  className?: string;
  showSign?: boolean;
}

export function TrendBadge({ value, invert, className, showSign = true }: Props) {
  const flat = Math.abs(value) < 0.1;
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  const Icon = flat ? Minus : positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md',
        flat && 'bg-muted/40 text-muted-foreground',
        !flat && good && 'bg-bi-green/15 text-bi-green',
        !flat && !good && 'bg-bi-red/15 text-bi-red',
        className,
      )}
    >
      <Icon className="w-3 h-3" />
      {showSign && positive && !flat ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}
