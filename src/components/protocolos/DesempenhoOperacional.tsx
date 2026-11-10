import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Download, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/juridico-db';
import { fmtData, hojeISO } from '@/lib/juridico';
import { useUserRole } from '@/hooks/useUserRole';
import { KpiJuridico } from '@/components/juridico/UrgenciaBadge';
import {
  calcularDesempenho, diasUteis, seriePorDia, TIPO_PROTOCOLO_CURTO, TIPO_PROTOCOLO_LABEL,
  type Protocolo, type TipoProtocolo,
} from '@/lib/protocolos';

const CORES = ['hsl(41 69% 39%)', 'hsl(216 13% 22%)', 'hsl(152 45% 35%)', 'hsl(212 55% 45%)', 'hsl(0 55% 48%)', 'hsl(280 30% 45%)'];

type Atalho = 'hoje' | 'semana' | 'mes' | 'mes_passado' | 'livre';

function periodo(a: Atalho, de: string, ate: string): [string, string] {
  const hoje = new Date();
  const f = (d: Date) => format(d, 'yyyy-MM-dd');
  if (a === 'hoje') return [f(hoje), f(hoje)];
  if (a === 'semana') return [f(startOfWeek(hoje, { weekStartsOn: 1 })), f(endOfWeek(hoje, { weekStartsOn: 1 }))];
  if (a === 'mes') return [f(startOfMonth(hoje)), f(endOfMonth(hoje))];
  if (a === 'mes_passado') { const m = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); return [f(m), f(endOfMonth(m))]; }
  return [de, ate];
}

export function DesempenhoOperacional() {
  const { isGestor } = useUserRole();
  const qc = useQueryClient();
  const [atalho, setAtalho] = useState<Atalho>('mes');
  const [livreDe, setLivreDe] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [livreAte, setLivreAte] = useState(hojeISO());
  const [de, ate] = periodo(atalho, livreDe, livreAte);
  const [editMeta, setEditMeta] = useState(false);
  const [metaTxt, setMetaTxt] = useState('');

  const { data: lista, isLoading } = useQuery({
    queryKey: ['protocolos-periodo', de, ate],
    queryFn: async () => {
      const { data, error } = await db.from('protocolos_operacional').select('*').gte('data', de).lte('data', ate).order('data', { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as Protocolo[];
    },
  });

  const meta = useQuery({
    queryKey: ['meta-protocolos-dia'],
    queryFn: async () => {
      const { data } = await supabase.from('config').select('id, valor').eq('divisao', 'advogados').eq('chave', 'meta_protocolos_dia').maybeSingle();
      return { id: data?.id ?? null, meta: Number((data?.valor as { meta?: number } | null)?.meta ?? 5) || 5 };
    },
  });

  const contratos = useQuery({
    queryKey: ['contratos-periodo-zapsign', de, ate],
    queryFn: async () => {
      const { count } = await db.from('zapsign_documentos').select('token', { count: 'exact', head: true })
        .eq('status', 'signed').gte('assinado_em', `${de}T00:00:00-03:00`).lte('assinado_em', `${ate}T23:59:59-03:00`);
      return count ?? 0;
    },
  });

  const salvarMeta = useMutation({
    mutationFn: async (n: number) => {
      const valor = { meta: n };
      const r = meta.data?.id
        ? await supabase.from('config').update({ valor }).eq('id', meta.data.id)
        : await supabase.from('config').insert({ divisao: 'advogados', chave: 'meta_protocolos_dia', valor });
      if (r.error) throw r.error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['meta-protocolos-dia'] }); setEditMeta(false); toast.success('Meta atualizada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const protocolos = lista ?? [];
  const desempenho = useMemo(() => calcularDesempenho(protocolos, de, ate), [protocolos, de, ate]);
  const serie = useMemo(() => seriePorDia(protocolos, de, ate), [protocolos, de, ate]);
  const uteis = diasUteis(de, ate);
  const m = meta.data?.meta ?? 5;
  const metaPeriodo = m * uteis;
  const tipos = (Object.keys(TIPO_PROTOCOLO_LABEL) as TipoProtocolo[]).filter(t => protocolos.some(p => p.tipo === t));

  const exportar = () => {
    const linhas = [['Data', 'Colaborador', 'Tipo', 'Área', 'Cliente', 'Benefício/assunto', 'Nº', 'Órgão', 'O que foi feito']]
      .concat(protocolos.map(p => [p.data, p.colaborador_nome ?? '', TIPO_PROTOCOLO_LABEL[p.tipo], p.area ?? '', p.cliente_nome, p.beneficio ?? '', p.numero ?? '', p.orgao ?? '', p.descricao ?? '']));
    const csv = linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `protocolos_${de}_a_${ate}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([['hoje', 'Hoje'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['livre', 'Escolher datas']] as [Atalho, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setAtalho(v)}
            className={`rounded-full border px-3 py-1 text-xs ${atalho === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
        {atalho === 'livre' && (
          <span className="flex items-center gap-1 text-xs">
            <Input type="date" value={livreDe} onChange={e => setLivreDe(e.target.value)} className="h-8 w-36" />
            até
            <Input type="date" value={livreAte} onChange={e => setLivreAte(e.target.value)} className="h-8 w-36" />
          </span>
        )}
        <span className="text-xs text-muted-foreground">{fmtData(de)} a {fmtData(ate)} · {uteis} {uteis === 1 ? 'dia útil' : 'dias úteis'}</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={exportar} disabled={!protocolos.length}><Download className="w-4 h-4 mr-1" />Baixar planilha</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiJuridico label="Protocolos no período" value={protocolos.length} tone="gold" />
        <KpiJuridico label="Média por dia útil (setor)" value={(Math.round((protocolos.length / uteis) * 10) / 10).toLocaleString('pt-BR')} />
        <KpiJuridico label="Contratos assinados (ZapSign)" value={contratos.data ?? '—'} hint="no mesmo período" />
        <KpiJuridico label="Meta por colaborador" value={`${m}/dia`} hint={`${metaPeriodo} no período`} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : desempenho.length === 0 ? (
        <p className="glass-card p-6 text-sm text-muted-foreground">Nenhum protocolo lançado neste período. Os lançamentos são feitos na aba Registro diário.</p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {desempenho.map(c => {
              const pct = Math.min(100, Math.round((c.total / metaPeriodo) * 100));
              return (
                <div key={c.colaborador_id} className="glass-card p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold">{c.nome}</p>
                    <p className="titulo-pagina text-3xl tabular-nums">{c.total}</p>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-600' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{pct}% da meta do período ({metaPeriodo})</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><dt className="text-[11px] text-muted-foreground">Hoje</dt><dd className="font-semibold tabular-nums">{c.hoje}<span className="text-muted-foreground font-normal">/{m}</span></dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Média/dia útil</dt><dd className="font-semibold tabular-nums">{c.mediaDiaUtil.toLocaleString('pt-BR')}</dd></div>
                    <div><dt className="text-[11px] text-muted-foreground">Dias com lançamento</dt><dd className="font-semibold tabular-nums">{c.diasComLancamento}</dd></div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(Object.entries(c.porTipo) as [TipoProtocolo, number][]).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                      <span key={t} className="text-[11px] rounded bg-secondary px-1.5 py-0.5">{TIPO_PROTOCOLO_CURTO[t]} <b>{n}</b></span>
                    ))}
                  </div>
                  {c.melhorDia && <p className="text-[11px] text-muted-foreground mt-2">Melhor dia: {fmtData(c.melhorDia.data)} ({c.melhorDia.qtd})</p>}
                </div>
              );
            })}
          </div>

          <section className="glass-card p-4">
            <h2 className="font-semibold mb-3">Protocolos por dia</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie.linhas} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(80 7% 87%)" vertical={false} />
                  <XAxis dataKey="data" tickFormatter={d => fmtData(String(d), 'dd/MM')} fontSize={11} stroke="#6B7076" />
                  <YAxis allowDecimals={false} fontSize={11} stroke="#6B7076" />
                  <Tooltip labelFormatter={d => fmtData(String(d), 'EEE dd/MM')} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {serie.nomes.map((n, i) => <Bar key={n} dataKey={n} name={n} stackId="a" isAnimationActive={false} fill={CORES[i % CORES.length]} radius={i === serie.nomes.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="glass-card p-4 overflow-x-auto">
            <h2 className="font-semibold mb-3">Por tipo de protocolo</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
                  {tipos.map(t => <TableHead key={t} className="text-right whitespace-nowrap">{TIPO_PROTOCOLO_CURTO[t]}</TableHead>)}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {desempenho.map(c => (
                  <TableRow key={c.colaborador_id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    {tipos.map(t => <TableCell key={t} className="text-right tabular-nums">{c.porTipo[t] ?? 0}</TableCell>)}
                    <TableCell className="text-right tabular-nums font-bold text-primary">{c.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}

      {isGestor && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {editMeta ? (
            <>
              <span>Meta de protocolos por colaborador, por dia útil:</span>
              <Input type="number" min={1} value={metaTxt} onChange={e => setMetaTxt(e.target.value)} className="h-8 w-20" autoFocus />
              <button className="inline-flex items-center gap-1 text-primary font-medium" onClick={() => {
                const n = Number(metaTxt);
                if (!n || n < 1) return toast.error('Informe um número a partir de 1.');
                salvarMeta.mutate(n);
              }}><Check className="w-3.5 h-3.5" />Salvar</button>
            </>
          ) : (
            <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setMetaTxt(String(m)); setEditMeta(true); }}>
              <Pencil className="w-3.5 h-3.5" />Alterar meta diária de protocolos
            </button>
          )}
        </div>
      )}
    </div>
  );
}
