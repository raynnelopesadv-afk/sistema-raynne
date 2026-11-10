import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/juridico-db';
import { nomeAmigavel } from '@/lib/protocolos';
import { fmtData, hojeISO, somaDias, acaoLabel, type AcaoColaborador } from '@/lib/juridico';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PERIODOS = [
  { v: 0, l: 'Hoje' },
  { v: 7, l: '7 dias' },
  { v: 30, l: '30 dias' },
  { v: 90, l: '90 dias' },
];

function categoria(acao: string): 'protocolos' | 'publicacoes' | 'prazos' | 'audiencias' | 'inss' | 'outros' {
  if (acao.startsWith('protocolou_')) return 'protocolos';
  if (acao.startsWith('publicacao_tratada')) return 'publicacoes';
  if (acao === 'cumpriu_exigencia_inss') return 'inss';
  if (acao === 'concluiu_audiencia' || acao === 'concluiu_pericia') return 'audiencias';
  if (acao.startsWith('concluiu_')) return 'prazos';
  return 'outros';
}

export default function Equipe() {
  const [dias, setDias] = useState(30);
  const desde = somaDias(hojeISO(), -dias);

  const acoes = useQuery({
    queryKey: ['equipe-acoes', dias],
    queryFn: async () => {
      const { data, error } = await db.from('colaborador_acoes').select('*')
        .gte('em', desde).order('em', { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as AcaoColaborador[];
    },
  });

  const contratos = useQuery({
    queryKey: ['equipe-contratos', dias],
    queryFn: async () => {
      const [{ data: cf, error }, { data: cl }] = await Promise.all([
        supabase.from('clientes_fechados').select('id, closer_id, nome_cliente, data_fechamento, valor').gte('data_fechamento', desde),
        supabase.from('closers').select('id, nome'),
      ]);
      if (error) throw error;
      const nomes = Object.fromEntries((cl ?? []).map(c => [c.id, c.nome]));
      const m: Record<string, { nome: string; qtd: number; valor: number }> = {};
      for (const c of cf ?? []) {
        const k = c.closer_id ?? 'sem';
        m[k] ??= { nome: c.closer_id ? (nomes[c.closer_id] ?? '—') : 'Sem responsável', qtd: 0, valor: 0 };
        m[k].qtd += 1;
        m[k].valor += Number(c.valor ?? 0);
      }
      return Object.values(m).sort((a, b) => b.qtd - a.qtd);
    },
  });

  const resumo = useMemo(() => {
    const m: Record<string, { nome: string; protocolos: number; publicacoes: number; prazos: number; audiencias: number; inss: number; outros: number; total: number }> = {};
    for (const a of acoes.data ?? []) {
      const nome = nomeAmigavel(a.usuario_nome);
      m[nome] ??= { nome, protocolos: 0, publicacoes: 0, prazos: 0, audiencias: 0, inss: 0, outros: 0, total: 0 };
      m[nome][categoria(a.acao)] += 1;
      m[nome].total += 1;
    }
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [acoes.data]);

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina text-3xl">Equipe</h1>
          <p className="text-sm text-muted-foreground">O que cada colaborador fez e os contratos fechados por pessoa</p>
        </div>
        <div className="flex gap-2">
          {PERIODOS.map(p => (
            <button key={p.v} onClick={() => setDias(p.v)}
              className={`rounded-full border px-3 py-1 text-xs ${dias === p.v ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}>{p.l}</button>
          ))}
        </div>
      </div>

      <section className="glass-card p-4">
        <h2 className="font-semibold mb-3">Produtividade por colaborador</h2>
        {acoes.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : resumo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma ação registrada no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead className="text-right">Protocolos</TableHead>
                <TableHead className="text-right">Publicações tratadas</TableHead>
                <TableHead className="text-right">Prazos/tarefas concluídos</TableHead>
                <TableHead className="text-right">Audiências/perícias</TableHead>
                <TableHead className="text-right">Exigências INSS</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumo.map(r => (
                <TableRow key={r.nome}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.protocolos}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.publicacoes}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.prazos}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.audiencias}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.inss}</TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-primary">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="glass-card p-4">
        <h2 className="font-semibold mb-3">Contratos fechados por pessoa</h2>
        {contratos.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : (contratos.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum contrato lançado em Fechamento no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Responsável</TableHead><TableHead className="text-right">Contratos</TableHead><TableHead className="text-right">Valor</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {(contratos.data ?? []).map(c => (
                <TableRow key={c.nome}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.qtd}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(c.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="glass-card p-4">
        <h2 className="font-semibold mb-3">Últimas ações</h2>
        <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
          {(acoes.data ?? []).slice(0, 200).map(a => (
            <div key={a.id} className="py-2 text-sm flex flex-wrap gap-x-3">
              <span className="text-muted-foreground text-xs w-28 shrink-0">{fmtData(a.em, 'dd/MM HH:mm')}</span>
              <span className="font-medium">{nomeAmigavel(a.usuario_nome)}</span>
              <span>{acaoLabel(a.acao)}</span>
              <span className="text-muted-foreground truncate">{a.descricao}</span>
              {a.fonte === 'tramitacao' && <span className="text-[11px] text-muted-foreground">(Tramitação)</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
