import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingUp, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Divisao = 'advogados' | 'educacao';

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

interface ProdutoProj {
  id: string;
  nome: string;
  exito_tipo: 'fixo' | 'percentual';
  exito_valor: number;
  exito_probabilidade: number | null;
  projecao_soma_inicial: boolean;
}

interface ContratoProj {
  product_id: string | null;
  valor: number;
  teve_exito: boolean | null;
  valor_exito: number;
  status_qualificacao: string;
}

export function ProjecaoExito({ divisao }: { divisao: Divisao }) {
  const { data, isLoading } = useQuery({
    queryKey: ['projecao-exito', divisao],
    queryFn: async () => {
      const [products, contratos] = await Promise.all([
        supabase
          .from('products')
          .select('id, nome, exito_tipo, exito_valor, exito_probabilidade, projecao_soma_inicial')
          .eq('divisao', divisao)
          .eq('ativo', true),
        supabase
          .from('clientes_fechados')
          .select('product_id, valor, teve_exito, valor_exito, status_qualificacao')
          .eq('divisao', divisao),
      ]);
      const err = products.error ?? contratos.error;
      if (err) throw err;
      return {
        products: (products.data ?? []) as ProdutoProj[],
        contratos: (contratos.data ?? []) as ContratoProj[],
      };
    },
    refetchInterval: 60_000,
  });

  const proj = useMemo(() => {
    if (!data) return null;

    // histórico por produto: taxa de êxito e média do valor de êxito
    const hist = new Map<string, { decididos: number; exitos: number; somaExito: number }>();
    for (const c of data.contratos) {
      if (!c.product_id || c.teve_exito === null) continue;
      const h = hist.get(c.product_id) ?? { decididos: 0, exitos: 0, somaExito: 0 };
      h.decididos += 1;
      if (c.teve_exito) {
        h.exitos += 1;
        h.somaExito += Number(c.valor_exito) || 0;
      }
      hist.set(c.product_id, h);
    }

    const porProduto = data.products.map(p => {
      const h = hist.get(p.id);
      const taxaHist = h && h.decididos > 0 ? h.exitos / h.decididos : 1;
      const mediaHist = h && h.exitos > 0 ? h.somaExito / h.exitos : 0;
      const probConfig = Number(p.exito_probabilidade) || 0;
      const prob = probConfig > 0 ? probConfig / 100 : taxaHist;
      const usaHistProb = probConfig <= 0 && !!h && h.decididos > 0;

      const andamento = data.contratos.filter(c =>
        c.product_id === p.id &&
        c.teve_exito === null &&
        c.status_qualificacao !== 'desqualificado' &&
        c.status_qualificacao !== 'desistencia',
      );

      let exitoProjetado = 0;
      let inicialSomada = 0;
      let usouMediaHist = false;
      for (const c of andamento) {
        let base = p.exito_tipo === 'percentual'
          ? (Number(c.valor) || 0) * (Number(p.exito_valor) || 0) / 100
          : Number(p.exito_valor) || 0;
        if (base <= 0) { base = mediaHist; if (mediaHist > 0) usouMediaHist = true; }
        exitoProjetado += base * prob;
        if (p.projecao_soma_inicial) inicialSomada += Number(c.valor) || 0;
      }

      return {
        id: p.id,
        nome: p.nome,
        contratos: andamento.length,
        prob,
        usaHistProb,
        usouMediaHist,
        exitoProjetado,
        inicialSomada,
        total: exitoProjetado + inicialSomada,
      };
    }).filter(r => r.contratos > 0).sort((a, b) => b.total - a.total);

    const totais = porProduto.reduce(
      (acc, r) => {
        acc.contratos += r.contratos;
        acc.exito += r.exitoProjetado;
        acc.inicial += r.inicialSomada;
        acc.total += r.total;
        return acc;
      },
      { contratos: 0, exito: 0, inicial: 0, total: 0 },
    );

    return { porProduto, totais };
  }, [data]);

  if (isLoading || !proj) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.18em] flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5" /> Projeção de êxito · contratos em andamento
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Contratos em andamento" value={String(proj.totais.contratos)} info="Contratos sem resultado registrado, excluindo desqualificados e desistências. São a base da projeção." />
        <Kpi label="Êxito projetado (ponderado)" value={brl(proj.totais.exito)} info="Soma do êxito esperado de cada contrato em andamento × probabilidade de êxito. As regras ficam no cadastro de cada produto; sem regra, usa o histórico." />
        <Kpi label="Honorários iniciais somados" value={brl(proj.totais.inicial)} info="Valor dos contratos cujo produto tem a chave 'Somar honorários iniciais à projeção' ligada." />
        <Kpi label="Total projetado" value={brl(proj.totais.total)} highlight info="Êxito projetado ponderado + honorários iniciais somados. É a receita futura estimada dos contratos em andamento." />
      </div>

      {proj.porProduto.length > 0 && (
        <div className="glass-card overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-center">Em andamento</TableHead>
                <TableHead className="text-center">Probabilidade</TableHead>
                <TableHead className="text-right">Êxito projetado</TableHead>
                <TableHead className="text-right">Iniciais somados</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proj.porProduto.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.nome}
                    {(r.usaHistProb || r.usouMediaHist) && (
                      <span className="block text-[10px] text-muted-foreground">
                        {r.usaHistProb && 'probabilidade pela taxa histórica'}
                        {r.usaHistProb && r.usouMediaHist && ' · '}
                        {r.usouMediaHist && 'valor pela média histórica de êxito'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{r.contratos}</TableCell>
                  <TableCell className="text-center tabular-nums">{(r.prob * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(r.exitoProjetado)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.inicialSomada > 0 ? brl(r.inicialSomada) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{brl(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground px-5 py-2 border-t border-border">
            Regras por produto (aba Produtos): êxito fixo ou % do contrato × probabilidade. Sem configuração, o sistema usa o histórico do produto.
            Contratos desqualificados/desistência e com resultado já registrado ficam de fora.
          </p>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, highlight, info }: { label: string; value: string; highlight?: boolean; info?: string }) {
  return (
    <div className={`glass-card p-4 ${highlight ? 'border border-primary/40' : ''}`}>
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {info && (
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <span className="cursor-help text-muted-foreground/60 hover:text-muted-foreground shrink-0" aria-label={`O que é ${label}?`}>
                <Info className="w-3 h-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">{info}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className={`text-xl font-bold mt-1 tabular-nums ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
