import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, BadgeCheck, Hourglass } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

interface Props { divisao: 'advogados' | 'educacao'; mesRef: string; }

interface Row {
  id: string;
  closer_id: string | null;
  protocolado: boolean;
  data_recebimento: string | null;
  valor_honorarios_recebidos: number;
  valor: number;
  data_fechamento: string | null;
}

export function ComissaoQualificacao({ divisao, mesRef }: Props) {
  const [year, month0] = mesRef.split('-').map(Number);
  const startDate = `${year}-${String(month0).padStart(2, '0')}-01`;
  const endDateObj = new Date(year, month0, 0);
  const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;

  const { data, isLoading } = useQuery({
    queryKey: ['comissao-qualificacao', divisao, mesRef],
    queryFn: async () => {
      const [{ data: rows, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
        supabase
          .from('clientes_fechados')
          .select('id, closer_id, protocolado, data_recebimento, valor_honorarios_recebidos, valor, data_fechamento')
          .eq('divisao', divisao)
          .gte('data_fechamento', startDate)
          .lte('data_fechamento', endDate),
        supabase
          .from('profiles')
          .select('user_id, display_name, email, percentual_comissao_qualificacao'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return {
        rows: (rows ?? []) as Row[],
        profiles: profiles ?? [],
      };
    },
    refetchInterval: 30_000,
  });

  const resumo = useMemo(() => {
    if (!data) return [];
    const profMap = new Map(
      (data.profiles ?? []).map((p) => [
        p.user_id,
        {
          nome: p.display_name || p.email || '—',
          pct: Number((p as { percentual_comissao_qualificacao?: number }).percentual_comissao_qualificacao ?? 0),
        },
      ]),
    );
    const grupos = new Map<string, Row[]>();
    data.rows.forEach((r) => {
      if (!r.closer_id) return;
      const arr = grupos.get(r.closer_id) ?? [];
      arr.push(r);
      grupos.set(r.closer_id, arr);
    });
    return Array.from(grupos.entries())
      .map(([closer_id, rows]) => {
        const fechados = rows.length;
        const qualificados = rows.filter((r) => r.protocolado);
        const pagos = qualificados.filter((r) => !!r.data_recebimento);
        const baseComissao = qualificados.reduce(
          (acc, r) => acc + (Number(r.valor_honorarios_recebidos) || Number(r.valor) || 0),
          0,
        );
        const prof = profMap.get(closer_id);
        const pct = prof?.pct ?? 0;
        const comissao = (baseComissao * pct) / 100;
        return {
          closer_id,
          nome: prof?.nome ?? '—',
          pct,
          fechados,
          qualificados: qualificados.length,
          pctQualif: fechados > 0 ? (qualificados.length / fechados) * 100 : 0,
          comissao,
          status: pagos.length === qualificados.length && qualificados.length > 0 ? 'pago' : 'pendente',
        };
      })
      .sort((a, b) => b.comissao - a.comissao);
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden overflow-x-auto">
      <div className="px-5 pt-4 pb-2">
        <h3 className="font-semibold text-foreground">Comissão de Qualificação</h3>
        <p className="text-xs text-muted-foreground">
          Baseada nos contratos protocolados do mês · % configurável por closer em Configurações
        </p>
      </div>
      {resumo.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6 text-center">Sem dados no mês.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Closer</TableHead>
              <TableHead className="text-center">Fechados</TableHead>
              <TableHead className="text-center">Qualificados</TableHead>
              <TableHead className="text-center">% Qualificação</TableHead>
              <TableHead className="text-center">% Comissão</TableHead>
              <TableHead className="text-right">Comissão de qualificação</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumo.map((r) => (
              <TableRow key={r.closer_id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell className="text-center tabular-nums">{r.fechados}</TableCell>
                <TableCell className="text-center tabular-nums">{r.qualificados}</TableCell>
                <TableCell className="text-center tabular-nums">{r.pctQualif.toFixed(0)}%</TableCell>
                <TableCell className="text-center tabular-nums">{r.pct.toFixed(1)}%</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{brl(r.comissao)}</TableCell>
                <TableCell>
                  {r.status === 'pago' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-success/15 text-success">
                      <BadgeCheck className="w-3 h-3" /> Pago
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-warning/15 text-warning">
                      <Hourglass className="w-3 h-3" /> Pendente
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
