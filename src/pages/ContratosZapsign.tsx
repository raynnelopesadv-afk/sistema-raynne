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
import { AREA_CONTRATO_LABEL, areasComHeranca, tabelaMesArea, unicosPorCliente, MESES, type AreaContrato } from '@/lib/zapsign-area';

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

function whatsapp(tel: string | null, nome: string | null, link: string | null, abriu = false) {
  if (!tel) return null;
  const primeiro = (nome ?? '').split(' ')[0] ?? '';
  const l = link ? `\n\n👉 ${link}` : '';
  const msg = abriu
    ? `Oi, ${primeiro}! Aqui é do escritório da Dra. Raynne Lopes. Vi que você abriu o contrato, mas a assinatura ainda não foi concluída. Ficou alguma dúvida? É rapidinho: abre o link, confere seus dados e assina com o dedo na tela, leva 1 minuto. Assim que assinar, a gente já começa o seu processo.${l}`
    : `Oi, ${primeiro}! Aqui é do escritório da Dra. Raynne Lopes. Seu contrato está pronto, só falta a sua assinatura para a gente começar o seu processo. É rapidinho, pelo celular mesmo: abre o link e assina com o dedo na tela.${l}`;
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
      // o banco entrega no máximo 1000 por vez: busca em páginas até trazer tudo
      const todos: Doc[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await db.from('zapsign_documentos').select('*').order('criado_em', { ascending: false }).order('token').range(de, de + 999);
        if (error) throw error;
        todos.push(...((data ?? []) as Doc[]));
        if (!data || data.length < 1000) break;
      }
      return todos;
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

  const todosDocs = areasComHeranca(data ?? [], correcoes);
  const docs = filtroArea === 'todas' ? todosDocs.filter(d => d.area !== 'interno') : todosDocs.filter(d => d.area === filtroArea);
  const hojeDt = new Date();
  const ano = hojeDt.getFullYear();
  const tab = tabelaMesArea(todosDocs, ano, hojeDt.getMonth() + 1);
  const unicos = unicosPorCliente(todosDocs.filter(d => d.area !== 'interno'));
  const assinadosMes = docs.filter(d => d.status === 'signed' && noPeriodo(d.assinado_em));
  const assinadosUnicos = unicos.filter(d => d.status === 'signed' && noPeriodo(d.assinado_em) && (filtroArea === 'todas' || d.area === filtroArea)).length;
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
        <h1 className="titulo-pagina text-3xl">Contratos Fechados</h1>
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
        <KpiJuridico label="Contratos fechados no período" value={assinadosUnicos} tone="gold" hint={`${enviadosPeriodo} enviados no período`} onClick={() => setAba('assinados')} />
        <KpiJuridico label="Aguardando assinatura" value={pendentes.length} tone={pendentes.length ? 'warning' : 'default'} onClick={() => setAba('pendentes')} />
        <KpiJuridico label="Pendentes há mais de 3 dias" value={pendentes.filter(d => d.criado_em && differenceInCalendarDays(new Date(), parseISO(d.criado_em)) > 3).length} tone="danger" onClick={() => setAba('pendentes')} />
        <KpiJuridico label="Recusados" value={recusados.length} onClick={() => setAba('recusados')} />
      </div>

      <div className="glass-card p-4 overflow-x-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="font-semibold">Contratos por área — {ano} (jan a {MESES[hojeDt.getMonth()].toLowerCase()})</h2>
          <span className="text-xs text-muted-foreground">Mês em que o contrato foi gerado · <b className="text-emerald-700">assinados</b> / <b className="text-amber-700">pendentes</b> · mesmo cliente na mesma área conta 1 vez · clique na área para filtrar a lista</span>
        </div>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left py-2 pr-2 font-medium">Mês</th>
              {tab.areas.map(a => (
                <th key={a} className="py-2 px-2 font-medium text-center">
                  <button onClick={() => setFiltroArea(filtroArea === a ? 'todas' : a)} className={`rounded px-2 py-0.5 ${filtroArea === a ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{AREA_CONTRATO_LABEL[a].replace(' (cível/trabalhista)', '')}</button>
                </th>
              ))}
              <th className="py-2 px-2 font-medium text-center">Total</th>
            </tr>
          </thead>
          <tbody>
            {tab.linhas.map(l => {
              const ts = tab.areas.reduce((s, a) => s + l.cel[a].assinados, 0), tp = tab.areas.reduce((s, a) => s + l.cel[a].pendentes, 0);
              return (
                <tr key={l.mes} className="border-b border-border/60">
                  <td className="py-1.5 pr-2 font-medium">{MESES[l.mes]}</td>
                  {tab.areas.map(a => (
                    <td key={a} className="py-1.5 px-2 text-center tabular-nums">
                      <span className="text-emerald-700 font-semibold">{l.cel[a].assinados}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-amber-700">{l.cel[a].pendentes}</span>
                    </td>
                  ))}
                  <td className="py-1.5 px-2 text-center tabular-nums"><b className="text-emerald-700">{ts}</b> / <span className="text-amber-700">{tp}</span></td>
                </tr>
              );
            })}
            <tr className="font-semibold bg-muted/40">
              <td className="py-2 pr-2">Total {ano}</td>
              {tab.areas.map(a => (
                <td key={a} className="py-2 px-2 text-center tabular-nums">
                  <span className="text-emerald-700">{tab.total[a].assinados}</span> / <span className="text-amber-700">{tab.total[a].pendentes}</span>
                </td>
              ))}
              <td className="py-2 px-2 text-center tabular-nums">
                <span className="text-emerald-700">{tab.areas.reduce((s, a) => s + tab.total[a].assinados, 0)}</span> / <span className="text-amber-700">{tab.areas.reduce((s, a) => s + tab.total[a].pendentes, 0)}</span>
              </td>
            </tr>
          </tbody>
        </table>
        {filtroArea !== 'todas' && <p className="text-xs mt-2">Filtrando a lista: <b>{AREA_CONTRATO_LABEL[filtroArea]}</b> · <button className="underline" onClick={() => setFiltroArea('todas')}>mostrar todas</button></p>}
        {tab.total.a_classificar.assinados + tab.total.a_classificar.pendentes > 0 && (
          <p className="text-xs mt-2 text-amber-800">Os da coluna "A classificar" têm nome de arquivo sem a área (ex.: "Contrato.docx"). Escolha a área na caixinha de cada contrato abaixo e eles passam para a coluna certa.</p>
        )}
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
            const wa = whatsapp(d.cliente_telefone, d.cliente_nome, d.link_assinatura, (d.cliente_visualizacoes ?? 0) > 0);
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
                    {d.areaHerdada && <span className="text-[10px] text-muted-foreground" title="Área deduzida de outro documento do mesmo cliente">(pelo cliente)</span>}
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
