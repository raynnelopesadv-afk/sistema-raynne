import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PeriodKind = 'month' | 'year' | 'all' | 'range';

interface Props {
  value: string; // "YYYY-MM" | "YYYY" | "all" | "range:YYYY-MM-DD:YYYY-MM-DD"
  onChange: (v: string) => void;
  className?: string;
  triggerClassName?: string;
}

export function detectPeriodKind(v: string): PeriodKind {
  if (v === 'all') return 'all';
  if (v.startsWith('range:')) return 'range';
  if (/^\d{4}$/.test(v)) return 'year';
  return 'month';
}

export function parseRangeToken(v: string): { start: string; end: string } | null {
  if (!v.startsWith('range:')) return null;
  const [, start, end] = v.split(':');
  if (!start || !end) return null;
  return { start, end };
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function PeriodSelector({ value, onChange, className, triggerClassName }: Props) {
  const kind = detectPeriodKind(value);
  const now = new Date();
  const [openFrom, setOpenFrom] = useState(false);
  const [openTo, setOpenTo] = useState(false);

  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let i = -11; i <= 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lbl = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      opts.push({ value: v, label: lbl.charAt(0).toUpperCase() + lbl.slice(1) });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 4; y--) {
      opts.push({ value: String(y), label: String(y) });
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const range = parseRangeToken(value);
  const fromDate = range ? parseYmd(range.start) : undefined;
  const toDate = range ? parseYmd(range.end) : undefined;

  function setKind(k: PeriodKind) {
    if (k === kind) return;
    if (k === 'month') onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    else if (k === 'year') onChange(String(now.getFullYear()));
    else if (k === 'all') onChange('all');
    else {
      // padrão: últimos 30 dias
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      onChange(`range:${ymd(start)}:${ymd(end)}`);
    }
  }

  function updateRange(start: Date | undefined, end: Date | undefined) {
    const s = start ?? fromDate ?? new Date();
    const e = end ?? toDate ?? new Date();
    const a = s <= e ? s : e;
    const b = s <= e ? e : s;
    onChange(`range:${ymd(a)}:${ymd(b)}`);
  }

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      <div className="inline-flex rounded-full border border-border bg-card p-0.5">
        {([
          { k: 'month' as const, lbl: 'Mês' },
          { k: 'year' as const, lbl: 'Ano' },
          { k: 'range' as const, lbl: 'Personalizado' },
          { k: 'all' as const, lbl: 'Todo o período' },
        ]).map(opt => (
          <button
            key={opt.k}
            onClick={() => setKind(opt.k)}
            className={cn(
              'px-3 py-1 rounded-full text-[11px] font-medium transition-colors',
              kind === opt.k
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.lbl}
          </button>
        ))}
      </div>

      {kind === 'month' && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={cn('w-[200px] capitalize bg-card border-border', triggerClassName)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {kind === 'year' && (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={cn('w-[120px] bg-card border-border', triggerClassName)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {kind === 'range' && (
        <div className="flex items-center gap-1.5">
          <Popover open={openFrom} onOpenChange={setOpenFrom}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-9 px-3 text-xs font-normal bg-card border-border text-foreground hover:bg-card',
                  !fromDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                {fromDate ? format(fromDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={(d) => { if (d) { updateRange(d, toDate); setOpenFrom(false); } }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground text-xs">até</span>
          <Popover open={openTo} onOpenChange={setOpenTo}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'h-9 px-3 text-xs font-normal bg-card border-border text-foreground hover:bg-card',
                  !toDate && 'text-muted-foreground',
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
                {toDate ? format(toDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={(d) => { if (d) { updateRange(fromDate, d); setOpenTo(false); } }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}
