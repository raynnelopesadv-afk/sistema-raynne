import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2, Gavel, CalendarClock, FileWarning, RefreshCw } from 'lucide-react';
import { db } from '@/lib/juridico-db';
import {
  hojeISO, somaDias, fmtData, TIPO_AGENDA_LABEL,
  type ItemAgenda, type RequerimentoInss,
} from '@/lib/juridico';
import { UrgenciaBadge, KpiJuridico } from '@/components/juridico/UrgenciaBadge';

const FONTE_SYNC: Record<string, string> = {
  'tramitacao publicacoes': 'Tramitação',
  agenda: 'Agenda',
  'inss e-mails': 'E-mails INSS',
  'acoes equipe': 'Equipe',
  'djen 160914/MG': 'DJEN',
};

export default function PainelJuridico() {
  const nav = useNavigate();
  const hoje = hojeISO();
  const em7 = somaDias(hoje, 7);
  const em15 = somaDias(hoje, 15);

  const agenda = useQuery({
    queryKey: ['painel-agenda', hoje],
    queryFn: async () => {
      const { data, error } = await db.from('agenda_juridica')
        .select('*').eq('concluido', false).lte('data', em15).order('data').order('hora');
      if (error) throw error;
      return (data ?? []) as ItemAgenda[];
    },
  });

  const pubs = useQuery({
    queryKey: ['painel-pubs'],
    queryFn: async () => {
      const { count, error } = await db.from('publicacoes')
        .select('id', { count: 'exact', head: true }).eq('status', 'nao_lida');
      if (error) throw error;
      const { count: hojeCount } = await db.from('publicacoes')
        .select('id', { count: 'exact', head: true }).eq('data_disponibilizacao', hoje);
      return { naoLidas: count ?? 0, hoje: hojeCount ?? 0 };
    },
  });

  const inss = useQuery({
    queryKey: ['painel-inss'],
    queryFn: async () => {
      const { data, error } = await db.from('inss_requerimentos')
        .select('*').eq('cumprido', false).ilike('status', 'pendente%')
        .order('prazo_exigencia', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RequerimentoInss[];
    },
  });

  const sync = useQuery({
    queryKey: ['painel-sync'],
    queryFn: async () => {
      const { data } = await db.from('sync_juridico').select('fonte, iniciado_em, erro')
        .order('iniciado_em', { ascending: false }).limit(20);
      const ultimo: Record<string, { em: string; erro: string | null }> = {};
      for (const r of data ?? []) if (!ultimo[r.fonte]) ultimo[r.fonte] = { em: r.iniciado_em, erro: r.erro };
      return ultimo;
    },
  });

  const itens = agenda.data ?? [];
  const atrasados = itens.filter(i => i.data < hoje);
  const deHoje = itens.filter(i => i.data === hoje);
  const semana = itens.filter(i => i.data > hoje && i.data <= em7);
  const audiencias = itens.filter(i => ['audiencia', 'pericia'].includes(i.tipo) && i.data >= hoje);
  const prazosLista = itens.filter(i => !['audiencia', 'pericia'].includes(i.tipo));
  const exigencias = (inss.data ?? []).filter(r => !r.exigencia_automatica);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel Jurídico</h1>
          <p className="text-sm text-muted-foreground">Prazos, audiências, publicações e INSS — {fmtData(hoje, "EEEE, dd 'de' MMMM")}</p>
        </div>
        <div className="hidden md:flex flex-wrap gap-2 text-[11px] text-muted-foreground" title="Última atualização automática de cada fonte">
          {Object.entries(sync.data ?? {}).map(([fonte, s]) => (
            <span key={fonte} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${s.erro ? 'border-destructive/50 text-destructive' : 'border-border'}`}>
              <RefreshCw className="w-3 h-3" /> {FONTE_SYNC[fonte] ?? fonte}: {fmtData(s.em, 'dd/MM HH:mm')}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiJuridico label="Atrasados" value={atrasados.length} tone={atrasados.length ? 'danger' : 'default'} onClick={() => nav('/agenda-juridica?filtro=atrasados')} />
        <KpiJuridico label="Vencem hoje" value={deHoje.length} tone={deHoje.length ? 'warning' : 'default'} onClick={() => nav('/agenda-juridica?filtro=hoje')} />
        <KpiJuridico label="Próximos 7 dias" value={semana.length} tone="gold" onClick={() => nav('/agenda-juridica')} />
        <KpiJuridico label="Audiências / perícias" value={audiencias.length} hint="próximos 15 dias" onClick={() => nav('/agenda-juridica?tipo=audiencia')} />
        <KpiJuridico label="Publicações não lidas" value={pubs.data?.naoLidas ?? '—'} hint={pubs.data ? `${pubs.data.hoje} disponibilizadas hoje` : undefined} tone={(pubs.data?.naoLidas ?? 0) > 0 ? 'warning' : 'default'} onClick={() => nav('/publicacoes')} />
        <KpiJuridico label="Exigências INSS" value={exigencias.length} hint="pendentes, não cumpridas" tone={exigencias.length ? 'warning' : 'default'} onClick={() => nav('/inss')} />
      </div>

      {agenda.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="glass-card p-4">
            <h2 className="font-semibold flex items-center gap-2 mb-3"><CalendarClock className="w-4 h-4 text-primary" /> Prazos — atrasados, hoje e próximos</h2>
            <ListaAgenda itens={prazosLista} vazio="Nenhum prazo em aberto nos próximos 15 dias." />
          </section>
          <section className="glass-card p-4">
            <h2 className="font-semibold flex items-center gap-2 mb-3"><Gavel className="w-4 h-4 text-primary" /> Audiências e perícias</h2>
            <ListaAgenda itens={audiencias} vazio="Nenhuma audiência ou perícia nos próximos 15 dias." />
          </section>
          <section className="glass-card p-4 lg:col-span-2">
            <h2 className="font-semibold flex items-center gap-2 mb-3"><FileWarning className="w-4 h-4 text-primary" /> Exigências do INSS em aberto</h2>
            {exigencias.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma exigência pendente.</p>
            ) : (
              <div className="divide-y divide-border">
                {exigencias.slice(0, 12).map(r => (
                  <div key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <UrgenciaBadge data={r.prazo_exigencia} />
                    <span className="font-medium">{r.cliente ?? '—'}</span>
                    <span className="text-muted-foreground">{r.servico}</span>
                    <span className="text-xs text-muted-foreground ml-auto">Prot. {r.protocolo} · prazo {fmtData(r.prazo_exigencia)}</span>
                  </div>
                ))}
                {exigencias.length > 12 && (
                  <button className="pt-2 text-sm text-primary" onClick={() => nav('/inss')}>Ver todas ({exigencias.length})</button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ListaAgenda({ itens, vazio }: { itens: ItemAgenda[]; vazio: string }) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="divide-y divide-border max-h-[420px] overflow-y-auto pr-1">
      {itens.map(i => (
        <div key={i.id} className="py-2 flex items-start gap-3 text-sm">
          <UrgenciaBadge data={i.data} />
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{i.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {TIPO_AGENDA_LABEL[i.tipo]} · {fmtData(i.data)}{i.hora ? ` às ${i.hora.slice(0, 5)}` : ''}
              {i.numero_processo ? ` · ${i.numero_processo}` : ''}{i.responsavel_nome ? ` · ${i.responsavel_nome}` : ''}
            </p>
          </div>
          {i.link && <a href={i.link} target="_blank" rel="noreferrer" className="text-xs text-primary shrink-0">abrir</a>}
        </div>
      ))}
    </div>
  );
}
