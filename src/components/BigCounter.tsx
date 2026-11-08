import { cn } from '@/lib/utils';

interface BigCounterProps {
  label: string;
  value: number | string;
  variant?: 'gold' | 'purple' | 'cyan';
}

const variantMap = {
  gold: {
    border: 'border-primary/40',
    glow: 'shadow-[0_0_30px_-8px_hsl(var(--primary)/0.6)]',
    text: 'text-primary',
    label: 'text-primary/70',
  },
  purple: {
    border: 'border-accent/40',
    glow: 'shadow-[0_0_30px_-8px_hsl(var(--accent)/0.6)]',
    text: 'text-accent',
    label: 'text-accent/70',
  },
  cyan: {
    border: 'border-cyan-400/40',
    glow: 'shadow-[0_0_30px_-8px_hsl(190_90%_55%/0.6)]',
    text: 'text-cyan-400',
    label: 'text-cyan-400/70',
  },
} as const;

export function BigCounter({ label, value, variant = 'cyan' }: BigCounterProps) {
  const v = variantMap[variant];
  return (
    <div
      className={cn(
        'relative rounded-2xl border-2 bg-background/40 backdrop-blur-sm px-6 py-4 flex flex-col items-center justify-center min-w-[110px]',
        v.border,
        v.glow,
      )}
    >
      <p className={cn('text-[11px] uppercase tracking-[0.2em] font-semibold', v.label)}>{label}</p>
      <p className={cn('text-5xl sm:text-6xl font-black leading-none mt-1 tabular-nums drop-shadow-[0_0_12px_currentColor]', v.text)}>
        {value}
      </p>
    </div>
  );
}
