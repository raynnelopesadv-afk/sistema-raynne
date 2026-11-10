import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, ExternalLink, Check, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, differenceInCalendarDays, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/juridico-db';
import { fmtData } from '@/lib/juridico';
import { KpiJuridico } from '@/components/juridico/UrgenciaBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useUserRole } from '@/hooks/useUserRole';
import { AREA_CONTRATO_LABEL, AREAS_CLIENTE, areaDoContrato, type AreaContrato } from '@/lib/zapsign-area';

interface Doc {
  token: string;
  nome_documento: string | null;
  status: string | null;
  criado_em: string | null;
  assinado_em: string | null;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  cliente_email: string | null;
  cliente_visualizacoes: number | null;
  cliente_ultima_visualizacao: string | null;
  link_assinatura: string | null;
  link_documento: string | null;
  cobrado_em: string | null;
}

type Aba = 'pendentes' | 'assinados' | 'recusados';

function whatsapp(tel: string | null, nome: string | null, link: string | null) {
  if (!tel) return null;
  const primeiro = (nome ?? '').split(' ')[0] ?? '';
  const msg = `Olá, ${primeiro}! Aqui é do escritório Raynne Lopes Advocacia. Seu contrato está pronto para assinatura${link ? `: ${link}` : ''}. Qualquer dúvida, estamos à disposição.`;
  return `https://wa.me/${tel.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}

export default function ContratosZapsign() {
  const [aba, setAba] = useState<Aba>('pendentes');
  const { isGestor } = useUserRole();
  const [filtroArea, setFiltroArea] = useState<AreaContrato | 'todas'>('todas');
  const [busca, setBusca] = useState('');
  const qc = useQueryClient();
  const [de, setDe] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [ate, setAte] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const noPeriodo = (iso: string | null) => {
    if (!iso) return false;
    const d = format(new Date(iso), 'yyyy-MM-dd'); // data no fuso do navegador (Brasília)
    return d >= de && d <= ate;
  };

  const { data, isLoading } = useQuery({
    queryKey: ['zapsign'],
    queryFn: async () => {
      const { data, error } = await db.from('zapsign_documentos').select('*').order('criado_em', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  // Correções manuais de área (só a gestora altera) — guardadas em config
  const correcoesQ = useQuery({
    queryKey: ['zapsign-areas'],
    queryFn: async () => {
      const { data } = await supabase.from('config').select('id, valor').eq('divisao', 'advogados').eq('chave', 'zapsign_areas').maybeSingle();
      return { id: (data as { id?: string } | null)?.id ?? null, mapa: ((data as { valor?: unknown } | null)?.valor ?? {}) as Record<string, AreaContrato> };
    },
  });
  const correcoes = correcoesQ.data?.mapa ?? {};
  const corrigirArea = useMutation({
    mutationFn: async ({ token, area }: { token: string; area: AreaContrato }) => {
      const valor = { ...correcoes, [token]: area };
      const id = correcoesQ.data?.id;
      const { error } = id
        ? await supabase.from('config').update({ valor }).eq('id', id)
        : await supabase.from('config').insert({ divisao: 'advogados', chave: 'zapsign_areas', valor });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zapsign-areas'] }); toast.success('Área atualizada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const todosDocs = (data ?? []).map(d => ({ ...d, area: areaDoContrato(d.token, d.nome_documento, correcoes) }));
  const docs = filtroArea === 'todas' ? todosDocs.filter(d => d.area !== 'interno') : todosDocs.filter(d => d.area === filtroArea);
  const hojeStr = format(new Date(), 'yyyy-MM-dd');
  const porArea = AREAS_CLIENTE.map(a => {
    const da = todosDocs.filter(d => d.area === a);
    const ateHoje = (iso: string | null) => !!iso && format(new Date(iso), 'yyyy-MM-dd') <= hojeStr;
    return {
      area: a,
      gerados: da.filter(d => ateHoje(d.criado_em)).length,
      assinados: da.filter(d => d.status === 'signed' && ateHoje(d.assinado_em)).length,
      geradosPeriodo: da.filter(d => noPeriodo(d.criado_em)).length,
      assinadosPeriodo: da.filter(d => d.status === 'signed' && noPeriodo(d.assinado_em)).length,
    };
  });
  const assinadosMes = docs.filter(d => d.status === 'signed' && noPeriodo(d.assinado_em));
  const enviadosPeriodo = docs.filter(d => noPeriodo(d.criado_em)).length;
  const atalho = (a: 'hoje' | 'ontem' | 'semana' | 'mes' | 'mes_passado') => {
    const h = new Date(); const f = (x: Date) => format(x, 'yyyy-MM-dd');
    if (a === 'hoje') { setDe(f(h)); setAte(f(h)); }
    if (a === 'ontem') { const o = new Date(h); o.setDate(h.getDate() - 1); setDe(f(o)); setAte(f(o)); }
    if (a === 'semana') { const s0 = new Date(h); s0.setDate(h.getDate() - ((h.getDay() + 6) % 7)); setDe(f(s0)); setAte(f(h)); }
    if (a === 'mes') { setDe(f(startOfMonth(h))); setAte(f(endOfMonth(h))); }
    if (a === 'mes_passado') { const m = new Date(h.getFullYear(), h.getMonth() - 1, 1); setDe(f(m)); setAte(f(endOfMonth(m))); }
  };
  const pendentes = docs.filter(d => d.status === 'pending');
  const recusados = docs.filter(d => d.status === 'refused');

  const lista = useMemo(() => {
    const base = aba === 'pendentes' ? pendentes : aba === 'assinados' ? assinadosMes : recusados;
    const t = busca.trim().toLowerCase();
    const td = t.replace(/\D/g, '');
    const l = !t ? base : base.filter(d =>
      [d.cliente_nome, d.nome_documento, d.cliente_email].some(x => x?.toLowerCase().includes(t)) ||
      (td.length >= 4 && (d.cliente_telefone ?? '').includes(td)));
    if (aba === 'assinados') return [...l].sort((a, b) => (b.assinado_em ?? '').localeCompare(a.assinado_em ?? ''));
    return [...l].sort((a, b) => (a.criado_em ?? '').localeCompare(b.criado_em ?? ''));
  }, [aba, busca, pendentes, assinadosMes, recusados]);

  const cobrar = useMutation({
    mutationFn: async (token: string) => {
      const { error } = await db.from('zapsign_documentos').update({ cobrado_em: new Date().toISOString() }).eq('token', token);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['zapsign'] }); toast.success('Marcado como cobrado hoje'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo-pagina text-3xl">Contratos (ZapSign)</h1>
        <p className="text-sm text-muted-foreground">Assinados, pendentes e o total por área (Aéreo, Maternidade, Previdenciário). A área é preenchida sozinha pelo nome do documento. Atualiza a cada 2 horas.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['mes_passado', 'Mês passado']] as const).map(([v, l]) => (
          <button key={v} onClick={() => atalho(v)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{l}</button>
        ))}
        <span className="flex items-center gap-1 text-xs">
          <Input type="date" value={de} onChange={e => setDe(e.target.value)} className="h-8 w-36" aria-label="De" />
          até
          <Input type="date" value={ate} onChange={e => setAte(e.target.value)} className="h-8 w-36" aria-label="Até" />
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiJuridico label="Assinados no período" value={assinadosMes.length} tone="gold" hint={`${enviadosPeriodo} enviados no período`} onClick={() => setAba('assinados')} />
        <KpiJuridico label="Aguardando assinatura" value={pendentes.length} tone={pendentes.length ? 'warning' : 'default'} onClick={() => setAba('pendentes')} />
        <KpiJuridico label="Pendentes há mais de 3 dias" value={pendentes.filter(d => d.criado_em && differenceInCalendarDays(new Date(), parseISO(d.criado_em)) > 3).length} tone="danger" onClick={() => setAba('pendentes')} />
        <KpiJuridico label="Recusados" value={recusados.length} onClick={() => setAba('recusados')} />
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Contratos por área</h2>
          <span className="text-xs text-muted-foreground">Total gerado até hoje ({fmtData(hojeStr)}) · entre parênteses, só o período escolhido · clique para filtrar</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {porArea.map(a => (
            <button key={a.area} onClick={() => setFiltroArea(filtroArea === a.area ? 'todas' : a.area)}
              className={`rounded-lg border p-3 text-left transition ${filtroArea === a.area ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'} ${a.area === 'a_classificar' && a.gerados ? 'border-amber-300' : ''}`}>
              <p className="text-xs text-muted-foreground">{AREA_CONTRATO_LABEL[a.area]}</p>
              <p className="text-2xl font-semibold">{a.gerados} <span className="text-xs font-normal text-muted-foreground">gerados ({a.geradosPeriodo})</span></p>
              <p className="text-sm text-emerald-700">{a.assinados} assinados <span className="text-xs text-muted-foreground">({a.assinadosPeriodo})</span></p>
            </button>
          ))}
        </div>
        {filtroArea !== 'todas' && <p className="text-xs mt-2">Filtrando: <b>{AREA_CONTRATO_LABEL[filtroArea]}</b> · <button className="underline" onClick={() => setFiltroArea('todas')}>mostrar todas</button></p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['pendentes', 'Aguardando assinatura'], ['assinados', 'Assinados no período'], ['recusados', 'Recusados']] as [Aba, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setAba(v)}
            className={`rounded-full border px-3 py-1 text-xs ${aba === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
        <Input placeholder="Buscar cliente, documento ou telefone" value={busca} onChange={e => setBusca(e.target.value)} className="max-w-xs ml-auto" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : lista.length === 0 ? (
        <p className="glass-card p-6 text-sm text-muted-foreground">
          {docs.length === 0 ? 'Ainda não chegou nada do ZapSign. A primeira sincronização aparece aqui em instantes.' : 'Nada nesta aba.'}
        </p>
      ) : (
        <div className="glass-card divide-y divide-border">
          {lista.map(d => {
            const dias = d.criado_em ? differenceInCalendarDays(new Date(), parseISO(d.criado_em)) : null;
            const wa = whatsapp(d.cliente_telefone, d.cliente_nome, d.link_assinatura);
            return (
              <div key={d.token} className="p-3 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{d.cliente_nome ?? '—'}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-2">
                    {isGestor ? (
                      <Select value={d.area} onValueChange={v => corrigirArea.mutate({ token: d.token, area: v as AreaContrato })}>
                        <SelectTrigger className={`h-6 w-auto gap-1 px-2 text-[11px] ${d.area === 'a_classificar' ? 'border-amber-400 text-amber-800' : ''}`}><SelectValue /></SelectTrigger>
                        <SelectContent>{(Object.keys(AREA_CONTRATO_LABEL) as AreaContrato[]).map(a => <SelectItem key={a} value={a}>{AREA_CONTRATO_LABEL[a]}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{AREA_CONTRATO_LABEL[d.area]}</span>}
                    <span className="truncate">{d.nome_documento}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {d.cliente_telefone ?? 'sem telefone'}{d.cliente_email ? ` · ${d.cliente_email}` : ''}
                  </p>
                  <p className="text-xs mt-1">
                    {d.status === 'signed'
                      ? <span className="text-emerald-700">Assinado em {fmtData(d.assinado_em, 'dd/MM/yyyy HH:mm')}</span>
                      : <span className={dias != null && dias > 3 ? 'text-red-700' : 'text-muted-foreground'}>
                          Enviado em {fmtData(d.criado_em)}{dias != null ? ` · há ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ''}
                        </span>}
                    {d.status === 'pending' && (
                      <span className="text-muted-foreground inline-flex items-center gap-1 ml-2">
                        <Eye className="w-3 h-3" />{d.cliente_visualizacoes ? `abriu ${d.cliente_visualizacoes}x` : 'ainda não abriu'}
                      </span>
                    )}
                    {d.cobrado_em && <span className="text-muted-foreground ml-2">· cobrado em {fmtData(d.cobrado_em, 'dd/MM HH:mm')}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {d.status === 'pending' && wa && (
                    <a href={wa} target="_blank" rel="noreferrer">
                      <Button size="sm"><MessageCircle className="w-4 h-4 mr-1" />Cobrar no WhatsApp</Button>
                    </a>
                  )}
                  {d.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => cobrar.mutate(d.token)}><Check className="w-4 h-4 mr-1" />Já cobrei</Button>
                  )}
                  {d.link_documento && (
                    <a href={d.link_documento} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost"><ExternalLink className="w-4 h-4 mr-1" />Documento</Button>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
