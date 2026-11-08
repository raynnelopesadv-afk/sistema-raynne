import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendBadgeProps {
  /** Valor realizado/projetado */
  current: number;
  /** Meta */
  target: number;
  /** Rótulo opcional (ex.: "vs meta") */
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Badge de tendência baseado no atingimento da meta.
 * - vermelho + seta pra baixo: < 70% da meta
 * - amarelo + seta lateral: entre 70% e 99% da meta
 * - verde + seta pra cima: >= 100% da meta
 */
export function TrendBadge({ current, target, label = 'vs meta', className, size = 'md' }: TrendBadgeProps) {
  if (!target || target <= 0) return null;

  const pct = (current / target) * 100;
  const status: 'low' | 'near' | 'on' = pct >= 100 ? 'on' : pct >= 70 ? 'near' : 'low';

  const styles = {
    low: 'bg-destructive/10 text-destructive border-destructive/40',
    near: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/40',
    on: 'bg-success/10 text-success border-success/40',
  }[status];

  const glow = {
    low: 'shadow-[0_0_24px_-4px_hsl(var(--destructive)/0.55)]',
    near: 'shadow-[0_0_24px_-4px_hsl(48_96%_53%/0.55)]',
    on: 'shadow-[0_0_28px_-4px_hsl(var(--success)/0.55)]',
  }[status];

  const Icon = status === 'on' ? ArrowUp : status === 'near' ? Minus : ArrowDown;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] gap-1.5',
    md: 'px-2.5 py-1 text-xs gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
    xl: 'px-5 py-2.5 text-lg gap-2.5',
  }[size];

  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-5 h-5',
    xl: 'w-6 h-6',
  }[size];

  const isLarge = size === 'lg' || size === 'xl';
  const animate = status === 'low' ? 'animate-pulse' : '';

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border font-semibold',
        sizeClasses,
        styles,
        isLarge && glow,
        isLarge && animate,
        className
      )}
      title={`${pct.toFixed(1)}% da meta`}
    >
      <Icon className={cn(iconSize, isLarge && 'stroke-[2.5]')} strokeWidth={isLarge ? 2.5 : 2} />
      <span className={cn(isLarge && 'font-bold tracking-tight tabular-nums')}>{Math.round(pct)}%</span>
      {label && <span className="opacity-70 font-medium">{label}</span>}
    </div>
  );
}
