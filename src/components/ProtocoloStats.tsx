import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CalendarRange } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  CheckCircle2,
  Percent,
  Trophy,
  Wallet,
  Sparkles,
  Clock,
  HourglassIcon,
  Users,
} from 'lucide-react';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

interface StatRow {
  protocolado?: boolean | null;
  status_qualificacao?: string | null;
  teve_exito?: boolean | null;
  valor?: number | null;
  valor_exito?: number | null;
  valor_honorarios_recebidos?: number | null;
  data_protocolo?: string | null;
  data_recebimento?: string | null;
  data_fechamento?: string | null;
}

interface Props {
  divisao: 'advogados' | 'educacao';
  /** If provided, stats are computed over these rows (allows external filters to apply). */
  rows?: StatRow[];
  /** Optional subtitle to indicate active filters. */
  subtitle?: string;
}

// Um contrato é considerado "protocolado" para fins de estatística quando estiver
// marcado como protocolado OU já tiver sido qualificado (sincronia automática).
function isProtocolado(r: StatRow): boolean {
  return !!r.protocolado || r.status_qualificacao === 'qualificado';
}

export function ProtocoloStats({ divisao, rows: rowsProp, subtitle }: Props) {
  // monthRef pode ser: 'all' | 'YYYY-MM' | 'year:YYYY' | 'range:YYYY-MM-DD:YYYY-MM-DD'
  const [monthRef, setMonthRef] = useState<string>('all');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [rangeOpen, setRangeOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['protocolo-stats', divisao],
    enabled: !rowsProp,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select('id, protocolado, status_qualificacao, teve_exito, valor, valor_exito, valor_honorarios_recebidos, data_protocolo, data_recebimento, data_fechamento')
        .eq('divisao', divisao);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  // Listas de meses e anos disponíveis a partir de data_fechamento.
  const { monthOptions, yearOptions } = useMemo(() => {
    const base = (rowsProp ?? data ?? []) as StatRow[];
    const months = new Set<string>();
    const years = new Set<string>();
    base.forEach((r) => {
      if (r.data_fechamento) {
        months.add(r.data_fechamento.slice(0, 7));
        years.add(r.data_fechamento.slice(0, 4));
      }
    });
    return {
      monthOptions: Array.from(months).sort((a, b) => b.localeCompare(a)),
      yearOptions: Array.from(years).sort((a, b) => b.localeCompare(a)),
    };
  }, [data, rowsProp]);

  const filteredRows = useMemo(() => {
    const base = (rowsProp ?? data ?? []) as StatRow[];
    if (monthRef === 'all') return base;
    if (monthRef.startsWith('year:')) {
      const y = monthRef.slice(5);
      return base.filter((r) => (r.data_fechamento ?? '').slice(0, 4) === y);
    }
    if (monthRef.startsWith('range:')) {
      const [, s, e] = monthRef.split(':');
      return base.filter((r) => {
        const d = r.data_fechamento ?? '';
        return d && d >= s && d <= e;
      });
    }
    return base.filter((r) => (r.data_fechamento ?? '').slice(0, 7) === monthRef);
  }, [data, rowsProp, monthRef]);

  const s = useMemo(() => {
    const rows = filteredRows;
    const total = rows.length;
    const protocolados = rows.filter(isProtocolado);
    const qtdProt = protocolados.length;
    const exitoSim = protocolados.filter((r) => r.teve_exito === true);
    const emAberto = protocolados.filter((r) => r.teve_exito === null || r.teve_exito === undefined);
    const fatReal = rows.reduce((acc, r) => acc + (Number(r.valor_honorarios_recebidos) || 0), 0);
    // Faturamento esperado = soma do ticket (valor) de TODOS os processos protocolados.
    // Se houver valor_exito informado manualmente, ele tem prioridade sobre o ticket.
    const fatExp = protocolados.reduce(
      (acc, r) => acc + (Number(r.valor_exito) || Number(r.valor) || 0),
      0,
    );
    
    const taxaExito = qtdProt > 0 ? (exitoSim.length / qtdProt) * 100 : 0;
    const pctProt = total > 0 ? (qtdProt / total) * 100 : 0;
    const tempos: number[] = [];
    rows.forEach((r) => {
      if (r.data_protocolo && r.data_recebimento) {
        const d1 = new Date(r.data_protocolo).getTime();
        const d2 = new Date(r.data_recebimento).getTime();
        if (d2 >= d1) tempos.push((d2 - d1) / 86_400_000);
      }
    });
    const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : 0;
    return { total, qtdProt, pctProt, taxaExito, fatReal, fatExp, tempoMedio, emAberto: emAberto.length };
  }, [filteredRows]);

  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    const dt = new Date(Number(y), Number(mo) - 1, 1);
    return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const filterLabel = (ref: string) => {
    if (ref === 'all') return 'Todos os períodos';
    if (ref.startsWith('year:')) return `Ano de ${ref.slice(5)}`;
    if (ref.startsWith('range:')) {
      const [, s, e] = ref.split(':');
      const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
      return `${f(s)} → ${f(e)}`;
    }
    return monthLabel(ref);
  };

  const applyRange = () => {
    if (!rangeStart || !rangeEnd) return;
    const [s, e] = rangeStart <= rangeEnd ? [rangeStart, rangeEnd] : [rangeEnd, rangeStart];
    setMonthRef(`range:${s}:${e}`);
    setRangeOpen(false);
  };

  const cards = [
    { icon: Users, label: 'Total de fechamentos', value: String(s.total), tone: 'gold' },
    { icon: CheckCircle2, label: 'Protocolados', value: String(s.qtdProt), tone: 'cyan' },
    { icon: Percent, label: '% de protocolação', value: `${s.pctProt.toFixed(1)}%`, tone: 'cyan' },
    { icon: Trophy, label: 'Taxa de êxito', value: `${s.taxaExito.toFixed(1)}%`, tone: 'gold' },
    { icon: Wallet, label: 'Faturamento real', value: brl(s.fatReal), tone: 'gold' },
    { icon: Sparkles, label: 'Faturamento esperado (êxito)', value: brl(s.fatExp), tone: 'gold' },
    { icon: Clock, label: 'Tempo médio até recebimento', value: `${s.tempoMedio.toFixed(0)} dias`, tone: 'cyan' },
    { icon: HourglassIcon, label: 'Processos em aberto', value: String(s.emAberto), tone: 'cyan' },
  ] as const;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-foreground">Estatísticas de Protocolo</h3>
          <span className="text-xs text-muted-foreground">
            {subtitle ?? (monthRef === 'all' ? 'Visão consolidada da divisão' : `Filtrado por ${filterLabel(monthRef)}`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={monthRef.startsWith('range:') ? '__range__' : monthRef} onValueChange={(v) => { if (v !== '__range__') setMonthRef(v); }}>
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder="Filtrar período">{filterLabel(monthRef)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os períodos</SelectItem>
              {yearOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Por ano</SelectLabel>
                  {yearOptions.map((y) => (
                    <SelectItem key={`y-${y}`} value={`year:${y}`}>Ano de {y}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              {monthOptions.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Por mês</SelectLabel>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <CalendarRange className="w-3.5 h-3.5" />
                Período
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Início</Label>
                <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fim</Label>
                <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-8" />
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setRangeStart(''); setRangeEnd(''); setMonthRef('all'); setRangeOpen(false); }}>
                  Limpar
                </Button>
                <Button size="sm" onClick={applyRange} disabled={!rangeStart || !rangeEnd}>
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">

        {cards.map((c) => {
          const Icon = c.icon;
          const accent =
            c.tone === 'gold'
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
          return (
            <div key={c.label} className={`glass-card p-4 border ${accent.split(' ')[2]}`}>
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <Icon className={`w-4 h-4 ${accent.split(' ')[0]}`} />
              </div>
              <p className="text-lg font-bold text-foreground mt-2 tabular-nums">{c.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
