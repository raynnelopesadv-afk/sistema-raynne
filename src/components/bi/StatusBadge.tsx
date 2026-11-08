import { cn } from '@/lib/utils';

type Variant = 'pending' | 'protocol' | 'success' | 'awaiting' | 'paid' | 'cancelled' | 'negative' | 'info';

const STYLES: Record<Variant, string> = {
  pending:   'bg-bi-orange/15 text-bi-orange ring-bi-orange/30',
  protocol:  'bg-bi-blue/15 text-bi-blue ring-bi-blue/30',
  success:   'bg-bi-green/15 text-bi-green ring-bi-green/30',
  awaiting:  'bg-bi-purple/15 text-bi-purple ring-bi-purple/30',
  paid:      'bg-bi-teal/15 text-bi-teal ring-bi-teal/30',
  cancelled: 'bg-muted/40 text-muted-foreground ring-border',
  negative:  'bg-bi-red/15 text-bi-red ring-bi-red/30',
  info:      'bg-bi-blue/10 text-bi-blue ring-bi-blue/20',
};

export function StatusBadge({ variant, children, className }: { variant: Variant; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset', STYLES[variant], className)}>
      {children}
    </span>
  );
}
