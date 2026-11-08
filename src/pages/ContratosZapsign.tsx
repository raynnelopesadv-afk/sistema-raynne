import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageCircle, ExternalLink, Check, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, differenceInCalendarDays, parseISO } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/juridico-db';
import { fmtData } from '@/lib/juridico';
import { KpiJuridico } from '@/components/juridico/UrgenciaBadge';

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
  const [busca, setBusca] = useState('');
  const qc = useQueryClient();
  const inicioMes = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['zapsign'],
    queryFn: async () => {
      const { data, error } = await db.from('zapsign_documentos').select('*').order('criado_em', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const docs = data ?? [];
  const assinadosMes = docs.filter(d => d.status === 'signed' && d.assinado_em && d.assinado_em >= inicioMes);
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
        <p className="text-sm text-muted-foreground">Assinados no mês e assinaturas pendentes, com o contato de cada cliente. Atualiza sozinho a cada 2 horas.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiJuridico label="Assinados este mês" value={assinadosMes.length} tone="gold" onClick={() => setAba('assinados')} />
        <KpiJuridico label="Aguardando assinatura" value={pendentes.length} tone={pendentes.length ? 'warning' : 'default'} onClick={() => setAba('pendentes')} />
        <KpiJuridico label="Pendentes há mais de 3 dias" value={pendentes.filter(d => d.criado_em && differenceInCalendarDays(new Date(), parseISO(d.criado_em)) > 3).length} tone="danger" onClick={() => setAba('pendentes')} />
        <KpiJuridico label="Recusados" value={recusados.length} onClick={() => setAba('recusados')} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([['pendentes', 'Aguardando assinatura'], ['assinados', 'Assinados este mês'], ['recusados', 'Recusados']] as [Aba, string][]).map(([v, l]) => (
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
                  <p className="text-xs text-muted-foreground truncate">{d.nome_documento}</p>
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
