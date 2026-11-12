import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock, Coffee, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { db } from '@/lib/juridico-db';
import { fmtData, hojeISO } from '@/lib/juridico';
import type { Tarefa } from '@/lib/tarefas';
import { PLANO_DIA, EXPEDIENTE, META_PROTOCOLOS_DIA, META_COBRANCAS_DIA, recadoDoDia } from '../../../scripts/lib/plano-dia.mjs';
import { Megaphone } from 'lucide-react';

type Bloco = { hora: string; ate: string; titulo: string; detalhe: string };
type Plano = { nome: string; papel: string; setor: string; blocos: Bloco[] };
const PLANOS = PLANO_DIA as unknown as Record<string, Plano>;

/** "raynnelopes.adv+juridico01@gmail.com" → "juridico01" */
function loginDe(email: string | null | undefined): string | null {
  const m = (email ?? '').toLowerCase().match(/\+([a-z0-9]+)@/);
  return m ? m[1] : null;
}

function agoraHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function CartaoPessoa({ chave, plano, tarefas, protocolos, destaque }: {
  chave: string; plano: Plano; tarefas: Tarefa[]; protocolos: number; destaque: boolean;
}) {
  const qc = useQueryClient();
  const agora = agoraHHMM();
  const concluir = useMutation({
    mutationFn: async (p: { id: string; feito: boolean }) => {
      const { error } = await db.from('tarefas').update({ status: p.feito ? 'concluida' : 'a_fazer' }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plano-dia-tarefas'] }),
    onError: (e: Error) => toast.error(e.message.includes('row-level') ? 'Só a própria pessoa ou a líder marca este bloco.' : e.message),
  });
  const temMeta = chave === 'juridico01' || chave === 'juridico02';
  const feitos = plano.blocos.filter(b => tarefas.find(t => t.titulo.startsWith(b.hora) && t.status === 'concluida')).length;

  return (
    <div className={`glass-card p-5 space-y-3 ${destaque ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-lg">{plano.nome}</h3>
          <p className="text-xs text-muted-foreground">{plano.papel}</p>
        </div>
        <span className="text-xs rounded-full border border-border px-2 py-0.5">{feitos}/{plano.blocos.length} blocos</span>
      </div>
      {temMeta && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className={`rounded-lg border p-2 ${protocolos >= META_PROTOCOLOS_DIA ? 'border-green-500/50 bg-green-500/10' : 'border-border'}`}>
            <p className="text-[11px] text-muted-foreground">Protocolos hoje</p>
            <p className="font-bold text-lg">{protocolos} <span className="text-xs font-normal text-muted-foreground">/ meta {META_PROTOCOLOS_DIA}</span></p>
          </div>
          <div className="rounded-lg border border-border p-2">
            <p className="text-[11px] text-muted-foreground">Cobranças da fila</p>
            <p className="font-bold text-lg">{META_COBRANCAS_DIA} <span className="text-xs font-normal text-muted-foreground">clientes/dia</span></p>
          </div>
        </div>
      )}
      <ol className="space-y-1.5">
        {plano.blocos.map((b, i) => {
          const t = tarefas.find(x => x.titulo.startsWith(b.hora));
          const feito = t?.status === 'concluida';
          const agoraAqui = agora >= b.hora && agora < b.ate;
          const intervaloAntes = i > 0 && plano.blocos[i - 1].ate <= EXPEDIENTE.intervaloDe && b.hora >= EXPEDIENTE.intervaloAte;
          return (
            <li key={b.hora}>
              {intervaloAntes && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1 pl-1">
                  <Coffee className="w-3.5 h-3.5" /> {EXPEDIENTE.intervaloDe} às {EXPEDIENTE.intervaloAte} · intervalo
                </div>
              )}
              <div className={`flex gap-3 rounded-lg px-2 py-1.5 ${agoraAqui ? 'bg-primary/10' : ''}`}>
                <button type="button" disabled={!t || concluir.isPending}
                  onClick={() => t && concluir.mutate({ id: t.id, feito: !feito })}
                  title={t ? (feito ? 'Desmarcar' : 'Marcar como feito') : 'A tarefa deste bloco é criada às 8h50'}
                  className="pt-0.5 shrink-0">
                  {feito ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                </button>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${feito ? 'line-through text-muted-foreground' : ''}`}>
                    <span className="tabular-nums text-muted-foreground mr-1.5">{b.hora}–{b.ate}</span>{b.titulo}
                    {agoraAqui && <span className="ml-2 text-[10px] uppercase tracking-wide text-primary font-semibold">agora</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{b.detalhe}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PlanoDoDia() {
  const { user } = useAuth();
  const { isGestor } = useUserRole();
  const hoje = hojeISO();
  const meu = loginDe(user?.email);

  const tarefas = useQuery({
    queryKey: ['plano-dia-tarefas', hoje],
    queryFn: async () => {
      const { data, error } = await db.from('tarefas').select('*').eq('prazo', hoje).like('descricao', '%plano do dia%');
      if (error) throw error;
      return (data ?? []) as Tarefa[];
    },
    refetchInterval: 60_000,
  });
  const protocolos = useQuery({
    queryKey: ['plano-dia-protocolos', hoje],
    queryFn: async () => {
      const { data, error } = await db.from('protocolos_operacional').select('colaborador_nome').eq('data', hoje);
      if (error) throw error;
      return (data ?? []) as { colaborador_nome: string | null }[];
    },
    refetchInterval: 60_000,
  });

  const chaves = useMemo(() => {
    const todas = Object.keys(PLANOS);
    if (isGestor || meu === 'lider') return meu && todas.includes(meu) ? [meu, ...todas.filter(k => k !== meu)] : todas;
    return meu && todas.includes(meu) ? [meu] : todas;
  }, [isGestor, meu]);

  if (tarefas.isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="first-letter:uppercase">{fmtData(hoje, "EEEE, dd/MM")}</span>
        <span className="text-muted-foreground">· expediente {EXPEDIENTE.inicio} às {EXPEDIENTE.fim}, intervalo {EXPEDIENTE.intervaloDe} às {EXPEDIENTE.intervaloAte}</span>
      </div>
      <div className="rounded-xl border border-primary/40 bg-primary/10 p-4 flex gap-3">
        <Megaphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-xs uppercase tracking-wide text-primary font-semibold">Recado do dia</p>
          <p className="text-sm font-medium">{recadoDoDia(hoje)}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        As tarefas de cada bloco aparecem sozinhas às 8h50 (seg a sex) em Tarefas. Marque aqui ou lá quando terminar. A fila de clientes para cobrar e protocolar está na planilha FILA OPERACIONAL.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {chaves.map(k => {
          const plano = PLANOS[k];
          const ts = (tarefas.data ?? []).filter(t => (t.responsavel_nome ?? '').toLowerCase() === plano.nome.toLowerCase());
          const prot = (protocolos.data ?? []).filter(p => (p.colaborador_nome ?? '').toLowerCase() === plano.nome.toLowerCase()).length;
          return <CartaoPessoa key={k} chave={k} plano={plano} tarefas={ts} protocolos={prot} destaque={k === meu} />;
        })}
      </div>
    </div>
  );
}
