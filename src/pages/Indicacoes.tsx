import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Gift, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/juridico-db';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import {
  PRODUTOS_INDICACAO, STATUS_INDICACAO, labelProduto, labelStatus, valorPadrao,
  resumoDoMes, doMes, type Indicacao, type ProdutoIndicacao, type StatusIndicacao,
} from '@/lib/indicacoes';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

function mesesRecentes(n = 12) {
  const out: { v: string; l: string }[] = [];
  const d = new Date(`${hoje().slice(0, 7)}-15T12:00:00`);
  for (let i = 0; i < n; i++) {
    const v = d.toISOString().slice(0, 7);
    out.push({ v, l: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function mascaraCelular(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function Indicacoes() {
  const { user } = useAuth();
  const { isGestor } = useUserRole();
  const qc = useQueryClient();
  const meses = useMemo(() => mesesRecentes(), []);
  const [mes, setMes] = useState(meses[0].v);

  const [cliente, setCliente] = useState('');
  const [telefone, setTelefone] = useState('');
  const [produto, setProduto] = useState<ProdutoIndicacao>('auxilio_acidente');
  const [data, setData] = useState(hoje());
  const [obs, setObs] = useState('');
  const [indicador, setIndicador] = useState<string>('');

  const lista = useQuery({
    queryKey: ['indicacoes'],
    queryFn: async () => {
      const { data, error } = await db.from('indicacoes').select('*').order('data_indicacao', { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as Indicacao[];
    },
  });

  const equipe = useQuery({
    queryKey: ['equipe-indicadores'],
    enabled: isGestor,
    queryFn: async () => {
      const { data, error } = await db.rpc('equipe_indicadores');
      if (error) throw error;
      return (data ?? []) as { user_id: string; nome: string }[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      if (!cliente.trim()) throw new Error('Informe o nome do cliente indicado.');
      const { error } = await db.from('indicacoes').insert({
        cliente_nome: cliente.trim(),
        telefone: telefone || null,
        produto,
        data_indicacao: data,
        observacao: obs.trim() || null,
        indicador_id: isGestor && indicador ? indicador : user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Indicação lançada! Aqui só tem os melhores.');
      setCliente(''); setTelefone(''); setObs('');
      qc.invalidateQueries({ queryKey: ['indicacoes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<Indicacao> }) => {
      const { error } = await db.from('indicacoes').update(campos).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['indicacoes'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('indicacoes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Indicação excluída.'); qc.invalidateQueries({ queryKey: ['indicacoes'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const todas = lista.data ?? [];
  const resumo = useMemo(() => resumoDoMes(todas, mes), [todas, mes]);
  const doMesLista = useMemo(() => doMes(todas, mes), [todas, mes]);
  const totais = resumo.reduce((s, r) => ({ fechadas: s.fechadas + r.fechadas, total: s.total + r.total, aPagar: s.aPagar + r.aPagar }), { fechadas: 0, total: 0, aPagar: 0 });

  function exportarCsv() {
    const linhas = [['Colaborador', 'Indicadas no mês', 'Viraram contrato', 'Comissão', 'Pago', 'A pagar']];
    for (const r of resumo) linhas.push([r.nome, String(r.indicadas), String(r.fechadas), r.total.toFixed(2).replace('.', ','), r.pago.toFixed(2).replace('.', ','), r.aPagar.toFixed(2).replace('.', ',')]);
    linhas.push([], ['Colaborador', 'Cliente', 'Telefone', 'Produto', 'Indicado em', 'Status', 'Fechou em', 'Valor', 'Pago']);
    for (const i of doMesLista) linhas.push([i.indicador_nome ?? '', i.cliente_nome, i.telefone ?? '', labelProduto(i.produto), fmt(i.data_indicacao), labelStatus(i.status), fmt(i.data_fechamento), String(i.valor ?? valorPadrao(i.produto)).replace('.', ','), i.pago ? 'sim' : 'não']);
    const csv = '﻿' + linhas.map(l => l.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `comissao-indicacoes-${mes}.csv`;
    a.click();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina text-3xl">Comissão por Indicação</h1>
          <p className="text-sm text-muted-foreground">
            Cliente de fora que você indicou e virou contrato = comissão no mês. R$ 45 auxílio-acidente, BPC e aposentadoria · R$ 40 salário-maternidade e auxílio-doença.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-48 capitalize"><SelectValue /></SelectTrigger>
            <SelectContent>{meses.map(m => <SelectItem key={m.v} value={m.v} className="capitalize">{m.l}</SelectItem>)}</SelectContent>
          </Select>
          {isGestor && <Button variant="outline" size="sm" onClick={exportarCsv}><Download className="w-4 h-4 mr-1" />Planilha</Button>}
        </div>
      </div>

      <section className="glass-card p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Gift className="w-4 h-4 text-primary" />Lançar indicação</h2>
        <div className="grid gap-3 md:grid-cols-6">
          {isGestor && (
            <div className="md:col-span-2">
              <Label>Quem indicou</Label>
              <Select value={indicador || user?.id || ''} onValueChange={setIndicador}>
                <SelectTrigger><SelectValue placeholder="Colaborador" /></SelectTrigger>
                <SelectContent>
                  {(equipe.data ?? []).map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="md:col-span-2"><Label>Cliente indicado</Label><Input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nome completo" /></div>
          <div><Label>Telefone</Label><Input value={telefone} onChange={e => setTelefone(mascaraCelular(e.target.value))} placeholder="(31) 99999-9999" /></div>
          <div>
            <Label>Produto</Label>
            <Select value={produto} onValueChange={v => setProduto(v as ProdutoIndicacao)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRODUTOS_INDICACAO.map(p => <SelectItem key={p.valor} value={p.valor}>{p.label}{p.comissao ? ` — ${brl(p.comissao)}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Data da indicação</Label><Input type="date" value={data} onChange={e => setData(e.target.value)} /></div>
          <div className="md:col-span-4"><Label>Observação</Label><Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: vizinha da Maria, já tem laudo" /></div>
          <div className="flex items-end"><Button className="w-full" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lançar'}</Button></div>
        </div>
      </section>

      <section className="glass-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Comissão do mês por colaborador</h2>
          <p className="text-sm text-muted-foreground">{totais.fechadas} indicações viraram contrato · total {brl(totais.total)} · a pagar <span className="font-semibold text-primary">{brl(totais.aPagar)}</span></p>
        </div>
        {lista.isLoading ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : lista.isError ? (
          <p className="text-sm text-destructive">O módulo de indicações ainda está sendo instalado no banco. Tente de novo em alguns minutos.</p>
        ) : resumo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma indicação neste mês ainda.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Colaborador</TableHead><TableHead className="text-right">Indicadas no mês</TableHead><TableHead className="text-right">Viraram contrato</TableHead>
              <TableHead className="text-right">Comissão</TableHead><TableHead className="text-right">Pago</TableHead><TableHead className="text-right">A pagar</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {resumo.map((r, idx) => (
                <TableRow key={r.indicadorId}>
                  <TableCell className="font-medium">{idx === 0 && r.fechadas > 0 ? '🏆 ' : ''}{r.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.indicadas}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.fechadas}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{brl(r.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(r.pago)}</TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-primary">{brl(r.aPagar)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="glass-card p-4">
        <h2 className="font-semibold mb-3">Indicações do mês</h2>
        {doMesLista.length === 0 ? <p className="text-sm text-muted-foreground">Nada lançado neste mês.</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Indicado em</TableHead><TableHead>Quem indicou</TableHead><TableHead>Cliente</TableHead><TableHead>Produto</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="text-center">Pago</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {doMesLista.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="whitespace-nowrap">{fmt(i.data_indicacao)}</TableCell>
                  <TableCell>{i.indicador_nome}</TableCell>
                  <TableCell>
                    <div className="font-medium">{i.cliente_nome}</div>
                    <div className="text-xs text-muted-foreground">{[i.telefone, i.observacao].filter(Boolean).join(' · ')}</div>
                  </TableCell>
                  <TableCell>{labelProduto(i.produto)}</TableCell>
                  <TableCell>
                    {isGestor ? (
                      <Select value={i.status} onValueChange={v => atualizar.mutate({ id: i.id, campos: { status: v as StatusIndicacao } })}>
                        <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS_INDICACAO.map(s => <SelectItem key={s.valor} value={s.valor}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : labelStatus(i.status)}
                    {i.status === 'fechado' && <div className="text-[11px] text-muted-foreground mt-0.5">fechou em {fmt(i.data_fechamento)}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {isGestor && i.status === 'fechado' ? (
                      <Input type="number" className="h-8 w-24 ml-auto text-right" defaultValue={i.valor ?? valorPadrao(i.produto)}
                        onBlur={e => { const v = Number(e.target.value); if (v !== Number(i.valor)) atualizar.mutate({ id: i.id, campos: { valor: v } }); }} />
                    ) : brl(Number(i.valor ?? valorPadrao(i.produto)))}
                  </TableCell>
                  <TableCell className="text-center">
                    {isGestor && i.status === 'fechado'
                      ? <Switch checked={i.pago} onCheckedChange={v => atualizar.mutate({ id: i.id, campos: { pago: v } })} />
                      : i.pago ? 'sim' : '—'}
                  </TableCell>
                  <TableCell>
                    {(isGestor || i.status === 'indicado') && (
                      <button className="text-muted-foreground hover:text-destructive" title="Excluir"
                        onClick={() => { if (confirm(`Excluir a indicação de ${i.cliente_nome}?`)) apagar.mutate(i.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
