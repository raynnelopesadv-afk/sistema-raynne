import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Divisao = 'advogados' | 'educacao';

const ETAPAS_PROTOCOLADAS = ['entrada', 'judicial', 'administrativo', 'fundo_investimento'];
const TAXA_PROTOCOLO = 0.50;
const TAXA_EXITO = 0.50;

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

interface Props {
  divisao: Divisao;
  monthRef: string; // YYYY-MM | YYYY | "all"
}

function computeRange(ref: string) {
  if (ref === 'all') return { start: '1970-01-01', end: '2999-12-31' };
  if (ref.startsWith('range:')) {
    const [, s, e] = ref.split(':');
    if (s && e) return { start: s, end: e };
  }
  if (/^\d{4}$/.test(ref)) {
    return { start: `${ref}-01-01`, end: `${ref}-12-31` };
  }
  const [y, m] = ref.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${y}-${String(m).padStart(2, '0')}-01`,
    end: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

/**
 * Resumo do funil ponderado para o painel geral.
 * Mostra potencial bruto vs receita esperada ponderada (70% protocolo × 50% êxito).
 */
export function FunilResumo({ divisao, monthRef }: Props) {
  const { start, end } = computeRange(monthRef);

  const { data } = useQuery({
    queryKey: ['funil-resumo', divisao, monthRef],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clientes_fechados')
        .select('valor, etapa_processo')
        .eq('divisao', divisao)
        .gte('data_fechamento', start)
        .lte('data_fechamento', end);
      if (error) throw error;
      const rows = data ?? [];
      const contratos = rows.length;
      const totalValor = rows.reduce((s, r) => s + (Number(r.valor) || 0), 0);
      const ticket = contratos > 0 ? totalValor / contratos : 0;
      const protocoladosReal = rows.filter(r => r.etapa_processo && ETAPAS_PROTOCOLADAS.includes(r.etapa_processo)).length;
      const protocolosEsp = contratos * TAXA_PROTOCOLO;
      const exitosEsp = protocolosEsp * TAXA_EXITO;
      return {
        contratos,
        ticket,
        protocoladosReal,
        protocolosEsp,
        exitosEsp,
        potencialBruto: contratos * ticket,
        potencialProtocolado: protocolosEsp * ticket,
        faturamentoEsperado: exitosEsp * ticket,
      };
    },
    refetchInterval: 30_000,
  });

  const d = data ?? { contratos: 0, ticket: 0, protocoladosReal: 0, protocolosEsp: 0, exitosEsp: 0, potencialBruto: 0, potencialProtocolado: 0, faturamentoEsperado: 0 };

  return (
    <div className="glass-card p-5 border border-primary/20">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Sparkles className="w-4 h-4" /></div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Funil Ponderado de Prev</h3>
            <p className="text-[11px] text-muted-foreground">
              Receita esperada = contratos × {(TAXA_PROTOCOLO * 100).toFixed(0)}% protocolo × {(TAXA_EXITO * 100).toFixed(0)}% êxito × ticket cheio
            </p>
          </div>
        </div>
        <Link to="/faturamento" className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Ver detalhe <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Contratos" value={String(d.contratos ?? 0)} />
        <Stat label="Protoc. esperados" value={(d.protocolosEsp ?? 0).toFixed(1)} sub={`Real: ${d.protocoladosReal ?? 0}`} />
        <Stat label="Êxitos esperados" value={(d.exitosEsp ?? 0).toFixed(1)} />
        <Stat label="Potencial Bruto" value={fmt(d.potencialBruto ?? 0)} />
        <Stat label="Faturamento Esperado" value={fmt(d.faturamentoEsperado ?? 0)} highlight />
      </div>
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/40'}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-base font-bold tabular-nums mt-0.5 ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
