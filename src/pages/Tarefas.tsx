import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Settings2, Search, ListTodo, AlertTriangle, CalendarCheck, CheckCircle2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ViewToggle, type ViewMode } from '@/components/ViewToggle';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { usePersistentState } from '@/hooks/usePersistentState';
import { db } from '@/lib/juridico-db';
import { fmtData, hojeISO } from '@/lib/juridico';
import { nomeAmigavel } from '@/lib/protocolos';
import {
  FAIXAS_ORDEM, FAIXA_LABEL, PRIORIDADE_COR, PRIORIDADE_LABEL, STATUS_COLUNAS,
  aberta, faixaPrazo, filtrarTarefas, ordenarTarefas, progressoChecklist,
  type Setor, type StatusTarefa, type Tarefa,
} from '@/lib/tarefas';
import { useColaboradores } from '@/components/protocolos/RegistroDiario';
import { useSetores, useSetorMembros, useTarefas } from '@/components/tarefas/dados';
import { TarefaSheet } from '@/components/tarefas/TarefaSheet';
import { SetoresDialog } from '@/components/tarefas/SetoresDialog';

function iniciais(n: string | null) {
  return nomeAmigavel(n).split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
}

function PrazoBadge({ t, hoje }: { t: Tarefa; hoje: string }) {
  if (!t.prazo) return null;
  const f = faixaPrazo(t, hoje);
  const cls = f === 'atrasada' ? 'bg-red-500/15 text-red-600 border-red-500/40'
    : f === 'hoje' ? 'bg-amber-500/15 text-amber-700 border-amber-500/40'
    : 'border-border text-muted-foreground';
  const txt = f === 'hoje' ? 'Hoje' : f === 'amanha' ? 'Amanhã' : fmtData(t.prazo, 'dd/MM');
  return <span className={`text-[11px] rounded-full border px-1.5 py-0.5 whitespace-nowrap ${cls}`}>{txt}{t.hora ? ` ${t.hora.slice(0, 5)}` : ''}</span>;
}

function TarefaCard({ t, setor, hoje, onOpen, onToggle, arrastavel }: {
  t: Tarefa; setor?: Setor; hoje: string; onOpen: () => void; onToggle?: (feito: boolean) => void; arrastavel?: boolean;
}) {
  const ck = progressoChecklist(t.checklist);
  const feito = t.status === 'concluida';
  return (
    <div
      draggable={arrastavel}
      onDragStart={e => e.dataTransfer.setData('text/plain', t.id)}
      onClick={onOpen}
      className="group rounded-lg border border-border bg-card px-3 py-2 cursor-pointer hover:border-primary/60 transition-colors"
      style={{ borderLeft: `3px solid ${setor?.cor ?? '#9CA3AF'}` }}
    >
      <div className="flex items-start gap-2">
        {onToggle && (
          <div onClick={e => e.stopPropagation()} className="pt-0.5">
            <Checkbox checked={feito} onCheckedChange={v => onToggle(!!v)} aria-label="Concluir tarefa" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium leading-snug ${feito ? 'line-through text-muted-foreground' : ''}`}>{t.titulo}</p>
          {(t.cliente_nome || t.processo_numero) && (
            <p className="text-xs text-muted-foreground truncate">{[t.cliente_nome, t.processo_numero].filter(Boolean).join(' · ')}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <PrazoBadge t={t} hoje={hoje} />
            {t.prioridade !== 'normal' && (
              <span className="text-[11px] rounded-full px-1.5 py-0.5 text-white" style={{ background: PRIORIDADE_COR[t.prioridade] }}>
                {PRIORIDADE_LABEL[t.prioridade]}
              </span>
            )}
            {setor && <span className="text-[11px] text-muted-foreground">{setor.nome}</span>}
            {ck.total > 0 && <span className="text-[11px] text-muted-foreground">☑ {ck.feitos}/{ck.total}</span>}
            {t.recorrencia !== 'nenhuma' && <span className="text-[11px] text-muted-foreground" title="Tarefa recorrente">↻</span>}
          </div>
        </div>
        <span
          title={t.responsavel_id ? nomeAmigavel(t.responsavel_nome) : 'Qualquer um do setor'}
          className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold border border-border bg-muted"
        >
          {t.responsavel_id ? iniciais(t.responsavel_nome) : '—'}
        </span>
      </div>
    </div>
  );
}

function Kpi({ icone: Icone, label, valor, destaque }: { icone: typeof ListTodo; label: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque && valor > 0 ? 'border-red-500/50 bg-red-500/5' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icone className="w-4 h-4" />{label}</div>
      <p className={`text-2xl font-bold mt-1 ${destaque && valor > 0 ? 'text-red-600' : ''}`}>{valor}</p>
    </div>
  );
}

export default function Tarefas() {
  const { user } = useAuth();
  const { isGestor } = useUserRole();
  const qc = useQueryClient();
  const hoje = hojeISO();
  const setores = useSetores();
  const membros = useSetorMembros();
  const colabs = useColaboradores();
  const tarefas = useTarefas();

  const [view, setView] = usePersistentState<ViewMode>('tarefas.view', 'list');
  const [setorId, setSetorId] = usePersistentState<string>('tarefas.setor', 'todos');
  const [resp, setResp] = usePersistentState<string>('tarefas.resp', '');
  const [concluidas, setConcluidas] = usePersistentState<boolean>('tarefas.concluidas', false);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<{ tarefa: Tarefa | null } | null>(null);
  const [setoresOpen, setSetoresOpen] = useState(false);
  const responsavel = resp || (isGestor ? 'todos' : 'minhas');

  const listaSetores = useMemo(() => setores.data ?? [], [setores.data]);
  const setorMap = useMemo(() => Object.fromEntries(listaSetores.map(s => [s.id, s])), [listaSetores]);
  const todas = useMemo(() => tarefas.data ?? [], [tarefas.data]);

  const filtradas = useMemo(() => ordenarTarefas(filtrarTarefas(todas, {
    setorId, responsavel, busca, mostrarConcluidas: concluidas || view === 'kanban', usuarioId: user?.id ?? null,
  })), [todas, setorId, responsavel, busca, concluidas, view, user?.id]);

  // contadores (respeitam o filtro de responsável, não o de setor)
  const doEscopo = useMemo(() => filtrarTarefas(todas, {
    setorId: 'todos', responsavel, busca: '', mostrarConcluidas: false, usuarioId: user?.id ?? null,
  }), [todas, responsavel, user?.id]);
  const porSetor = useMemo(() => {
    const m: Record<string, { abertas: number; atrasadas: number }> = {};
    for (const t of doEscopo) {
      const k = t.setor_id ?? 'sem';
      m[k] ??= { abertas: 0, atrasadas: 0 };
      m[k].abertas++;
      if (faixaPrazo(t, hoje) === 'atrasada') m[k].atrasadas++;
    }
    return m;
  }, [doEscopo, hoje]);

  const minhas = todas.filter(t => aberta(t) && t.responsavel_id === user?.id).length;
  const escopoSetor = doEscopo.filter(t => setorId === 'todos' || t.setor_id === setorId);
  const atrasadas = escopoSetor.filter(t => faixaPrazo(t, hoje) === 'atrasada').length;
  const paraHoje = escopoSetor.filter(t => faixaPrazo(t, hoje) === 'hoje').length;
  const semanaAtras = new Date(Date.now() - 7 * 86400000).toISOString();
  const feitas7 = todas.filter(t => t.status === 'concluida' && (t.concluida_em ?? '') >= semanaAtras
    && (setorId === 'todos' || t.setor_id === setorId)
    && (responsavel === 'todos' || (responsavel === 'minhas' ? t.responsavel_id === user?.id : t.responsavel_id === responsavel))).length;

  const mudarStatus = useMutation({
    mutationFn: async (p: { id: string; status: StatusTarefa }) => {
      const { error } = await db.from('tarefas').update({ status: p.status }).eq('id', p.id);
      if (error) throw error;
    },
    onMutate: async p => {
      await qc.cancelQueries({ queryKey: ['tarefas'] });
      const antes = qc.getQueryData<Tarefa[]>(['tarefas']);
      qc.setQueryData<Tarefa[]>(['tarefas'], l => (l ?? []).map(t => t.id === p.id
        ? { ...t, status: p.status, concluida_em: p.status === 'concluida' ? new Date().toISOString() : null } : t));
      return { antes };
    },
    onError: (e: Error, _p, ctx) => {
      if (ctx?.antes) qc.setQueryData(['tarefas'], ctx.antes);
      toast.error(e.message.includes('row-level') ? 'Você não tem permissão para alterar esta tarefa.' : e.message);
    },
    onSuccess: (_d, p) => { if (p.status === 'concluida') toast.success('Tarefa concluída!'); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tarefas'] }),
  });

  const grupos = useMemo(() => {
    const m = new Map<string, Tarefa[]>();
    for (const t of filtradas) {
      const f = faixaPrazo(t, hoje);
      m.set(f, [...(m.get(f) ?? []), t]);
    }
    return FAIXAS_ORDEM.filter(f => m.has(f)).map(f => ({ faixa: f, itens: m.get(f)! }));
  }, [filtradas, hoje]);

  const carregando = tarefas.isLoading || setores.isLoading;
  const semTabela = tarefas.error && String((tarefas.error as Error).message).includes('tarefas');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina text-3xl md:text-4xl">Tarefas</h1>
          <p className="text-sm text-muted-foreground mt-1">Cada setor com as suas tarefas: quem faz, até quando e o que falta.</p>
        </div>
        <div className="flex gap-2">
          {isGestor && (
            <Button variant="outline" onClick={() => setSetoresOpen(true)}><Settings2 className="w-4 h-4 mr-1" /> Setores</Button>
          )}
          <Button onClick={() => setAberto({ tarefa: null })}><Plus className="w-4 h-4 mr-1" /> Nova tarefa</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icone={ListTodo} label="Minhas abertas" valor={minhas} />
        <Kpi icone={AlertTriangle} label="Atrasadas" valor={atrasadas} destaque />
        <Kpi icone={CalendarCheck} label="Para hoje" valor={paraHoje} />
        <Kpi icone={CheckCircle2} label="Concluídas (7 dias)" valor={feitas7} />
      </div>

      {/* Setores */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {[{ id: 'todos', nome: 'Todos os setores', cor: '#111827' } as Pick<Setor, 'id' | 'nome' | 'cor'>, ...listaSetores.filter(s => s.ativo)].map(s => {
          const ativo = setorId === s.id;
          const c = s.id === 'todos'
            ? { abertas: doEscopo.length, atrasadas: doEscopo.filter(t => faixaPrazo(t, hoje) === 'atrasada').length }
            : porSetor[s.id] ?? { abertas: 0, atrasadas: 0 };
          return (
            <button key={s.id} type="button" onClick={() => setSetorId(s.id)}
              className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${ativo ? 'text-white' : 'text-muted-foreground hover:text-foreground'}`}
              style={ativo ? { background: s.cor, borderColor: s.cor } : undefined}>
              {s.id !== 'todos' && !ativo && <span className="w-2 h-2 rounded-full" style={{ background: s.cor }} />}
              {s.nome}
              <span className={`rounded-full px-1.5 ${ativo ? 'bg-white/25' : 'bg-muted'}`}>{c.abertas}</span>
              {c.atrasadas > 0 && <span className="rounded-full px-1.5 bg-red-600 text-white" title="Atrasadas">{c.atrasadas}</span>}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={responsavel} onValueChange={setResp}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="minhas">Minhas tarefas</SelectItem>
            <SelectItem value="todos">De todo mundo</SelectItem>
            <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
            {(colabs.data ?? []).filter(c => c.user_id !== user?.id).map(c => (
              <SelectItem key={c.user_id} value={c.user_id}>{nomeAmigavel(c.nome)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tarefa, cliente ou processo" className="pl-8 h-9" />
        </div>
        {view === 'list' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={concluidas} onCheckedChange={setConcluidas} /> Mostrar concluídas
          </label>
        )}
        <div className="ml-auto"><ViewToggle value={view} onChange={setView} /></div>
      </div>

      {semTabela ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 text-sm">
          O módulo de tarefas ainda não foi instalado no banco. Rode a migração
          <code className="mx-1">20261112090000_tarefas_setores.sql</code> no Supabase (SQL Editor) e recarregue.
        </div>
      ) : carregando ? (
        <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : view === 'list' ? (
        grupos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
            Nenhuma tarefa aqui. <button className="text-primary underline" onClick={() => setAberto({ tarefa: null })}>Criar uma</button>
          </div>
        ) : (
          <div className="space-y-5">
            {grupos.map(g => (
              <section key={g.faixa}>
                <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${g.faixa === 'atrasada' ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {FAIXA_LABEL[g.faixa]} · {g.itens.length}
                </h2>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {g.itens.map(t => (
                    <TarefaCard key={t.id} t={t} setor={t.setor_id ? setorMap[t.setor_id] : undefined} hoje={hoje}
                      onOpen={() => setAberto({ tarefa: t })}
                      onToggle={feito => mudarStatus.mutate({ id: t.id, status: feito ? 'concluida' : 'a_fazer' })} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-4">
          {STATUS_COLUNAS.map(col => {
            const itens = filtradas.filter(t => t.status === col.key);
            return (
              <div key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  const id = e.dataTransfer.getData('text/plain');
                  const t = todas.find(x => x.id === id);
                  if (t && t.status !== col.key) mudarStatus.mutate({ id, status: col.key });
                }}
                className="rounded-xl bg-muted/40 border border-border p-2 min-h-[200px]">
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.cor }} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{itens.length}</span>
                </div>
                <div className="space-y-2">
                  {itens.map(t => (
                    <TarefaCard key={t.id} t={t} setor={t.setor_id ? setorMap[t.setor_id] : undefined} hoje={hoje}
                      arrastavel onOpen={() => setAberto({ tarefa: t })} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <MessageSquare className="w-3 h-3" /> Abra a tarefa para ver checklist e comentários. No quadro, arraste o cartão para mudar a situação.
      </p>

      <TarefaSheet
        open={!!aberto}
        tarefa={aberto?.tarefa ?? null}
        padrao={{
          setor_id: setorId !== 'todos' ? setorId : undefined,
          responsavel_id: responsavel === 'minhas' ? user?.id : (!['todos', 'sem_responsavel'].includes(responsavel) ? responsavel : undefined),
          prazo: hoje,
        }}
        setores={listaSetores}
        colaboradores={colabs.data ?? []}
        onClose={() => setAberto(null)}
      />
      {isGestor && (
        <SetoresDialog open={setoresOpen} onClose={() => setSetoresOpen(false)}
          setores={listaSetores} membros={membros.data ?? []} colaboradores={colabs.data ?? []} />
      )}
    </div>
  );
}
