import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Send, X, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { db } from '@/lib/juridico-db';
import { fmtData } from '@/lib/juridico';
import { nomeAmigavel } from '@/lib/protocolos';
import {
  MODELOS_TAREFA, PRIORIDADE_LABEL, RECORRENCIA_LABEL, STATUS_LABEL,
  type Comentario, type ItemChecklist, type Prioridade, type Recorrencia, type Setor, type StatusTarefa, type Tarefa,
} from '@/lib/tarefas';
import type { Colaborador } from '@/components/protocolos/RegistroDiario';

const SEM = '__nenhum__';

type Form = {
  titulo: string; descricao: string; setor_id: string; responsavel_id: string; prioridade: Prioridade;
  status: StatusTarefa; prazo: string; hora: string; cliente_nome: string; processo_numero: string;
  checklist: ItemChecklist[]; recorrencia: Recorrencia;
};

function formDe(t: Tarefa | null, padrao: Partial<Form>): Form {
  return {
    titulo: t?.titulo ?? '', descricao: t?.descricao ?? '', setor_id: t?.setor_id ?? padrao.setor_id ?? '',
    responsavel_id: t ? (t.responsavel_id ?? '') : (padrao.responsavel_id ?? ''),
    prioridade: t?.prioridade ?? 'normal', status: t?.status ?? 'a_fazer',
    prazo: t?.prazo ?? padrao.prazo ?? '', hora: t?.hora?.slice(0, 5) ?? '',
    cliente_nome: t?.cliente_nome ?? '', processo_numero: t?.processo_numero ?? '',
    checklist: t?.checklist ?? [], recorrencia: t?.recorrencia ?? 'nenhuma',
  };
}

interface Props {
  open: boolean;
  tarefa: Tarefa | null;           // null = nova
  padrao?: Partial<Form>;
  setores: Setor[];
  colaboradores: Colaborador[];
  onClose: () => void;
}

export function TarefaSheet({ open, tarefa, padrao = {}, setores, colaboradores, onClose }: Props) {
  const { user } = useAuth();
  const { isGestor } = useUserRole();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => formDe(tarefa, padrao));
  const [novoItem, setNovoItem] = useState('');
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    if (open) { setForm(formDe(tarefa, padrao)); setNovoItem(''); setComentario(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tarefa?.id]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => ({ ...f, [k]: v }));
  const setorNome = setores.find(s => s.id === form.setor_id)?.nome ?? '';
  const modelos = MODELOS_TAREFA[setorNome] ?? [];

  const comentarios = useQuery({
    queryKey: ['tarefa-comentarios', tarefa?.id],
    enabled: open && !!tarefa?.id,
    queryFn: async () => {
      const { data, error } = await db.from('tarefa_comentarios').select('*').eq('tarefa_id', tarefa!.id).order('criado_em');
      if (error) throw error;
      return (data ?? []) as Comentario[];
    },
  });

  const payload = (f: Form) => ({
    titulo: f.titulo.trim(), descricao: f.descricao.trim() || null,
    setor_id: f.setor_id || null, responsavel_id: f.responsavel_id || null,
    prioridade: f.prioridade, status: f.status, prazo: f.prazo || null, hora: f.hora || null,
    cliente_nome: f.cliente_nome.trim() || null, processo_numero: f.processo_numero.trim() || null,
    checklist: f.checklist, recorrencia: f.recorrencia,
  });

  const salvar = useMutation({
    mutationFn: async (f: Form) => {
      if (!f.titulo.trim()) throw new Error('Dê um título para a tarefa.');
      if (tarefa) {
        const { error } = await db.from('tarefas').update(payload(f)).eq('id', tarefa.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('tarefas').insert(payload(f));
        if (error) throw error;
      }
    },
    onSuccess: (_d, f) => {
      qc.invalidateQueries({ queryKey: ['tarefas'] });
      toast.success(tarefa ? (f.status === 'concluida' && tarefa.status !== 'concluida' ? 'Tarefa concluída!' : 'Tarefa salva') : 'Tarefa criada');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message.includes('row-level') ? 'Você não tem permissão para alterar esta tarefa.' : e.message),
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('tarefas').delete().eq('id', tarefa!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tarefas'] }); toast.success('Tarefa excluída'); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const comentar = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('tarefa_comentarios').insert({ tarefa_id: tarefa!.id, texto: comentario.trim() });
      if (error) throw error;
    },
    onSuccess: () => { setComentario(''); qc.invalidateQueries({ queryKey: ['tarefa-comentarios', tarefa?.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeExcluir = !!tarefa && (isGestor || tarefa.criado_por === user?.id);
  const addItem = () => {
    const txt = novoItem.trim();
    if (!txt) return;
    set('checklist', [...form.checklist, { texto: txt, feito: false }]);
    setNovoItem('');
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="bg-card border-l border-border w-full sm:max-w-[560px] p-0 overflow-hidden flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="text-xl font-bold">{tarefa ? 'Tarefa' : 'Nova tarefa'}</SheetTitle>
          {tarefa && (
            <p className="text-xs text-muted-foreground mt-1">
              Criada por {nomeAmigavel(tarefa.criado_por_nome)} em {fmtData(tarefa.criado_em.slice(0, 10))}
              {tarefa.concluida_em && <> · concluída em {fmtData(tarefa.concluida_em.slice(0, 10))}</>}
            </p>
          )}
        </div>

        <form
          className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
          onSubmit={e => { e.preventDefault(); salvar.mutate(form); }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label>Setor</Label>
              <Select value={form.setor_id || SEM} onValueChange={v => set('setor_id', v === SEM ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Sem setor</SelectItem>
                  {setores.filter(s => s.ativo || s.id === form.setor_id).map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: s.cor }} />{s.nome}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Responsável</Label>
              <Select value={form.responsavel_id || SEM} onValueChange={v => set('responsavel_id', v === SEM ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM}>Qualquer um do setor</SelectItem>
                  {colaboradores.map(c => <SelectItem key={c.user_id} value={c.user_id}>{nomeAmigavel(c.nome)}{c.user_id === user?.id ? ' (eu)' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>O que precisa ser feito</Label>
            <Input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex.: Cobrar documentos do cliente" autoFocus={!tarefa} />
            {!tarefa && modelos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {modelos.map(m => (
                  <button type="button" key={m} onClick={() => set('titulo', m)}
                    className="text-[11px] rounded-full border border-border px-2 py-0.5 text-muted-foreground hover:text-foreground hover:border-primary">
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cliente</Label>
              <Input value={form.cliente_nome} onChange={e => set('cliente_nome', e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div>
              <Label>Nº do processo / protocolo</Label>
              <Input value={form.processo_numero} onChange={e => set('processo_numero', e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <Label>Prazo</Label>
              <Input type="date" value={form.prazo} onChange={e => set('prazo', e.target.value)} />
            </div>
            <div>
              <Label>Hora</Label>
              <Input type="time" value={form.hora} onChange={e => set('hora', e.target.value)} />
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={v => set('prioridade', v as Prioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORIDADE_LABEL) as Prioridade[]).map(p => <SelectItem key={p} value={p}>{PRIORIDADE_LABEL[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Situação</Label>
              <Select value={form.status} onValueChange={v => set('status', v as StatusTarefa)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as StatusTarefa[]).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Repetir</Label>
              <Select value={form.recorrencia} onValueChange={v => set('recorrencia', v as Recorrencia)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(RECORRENCIA_LABEL) as Recorrencia[]).map(r => <SelectItem key={r} value={r}>{RECORRENCIA_LABEL[r]}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.recorrencia !== 'nenhuma' && (
                <p className="text-[11px] text-muted-foreground mt-1">Ao concluir, o sistema cria a próxima sozinho (fim de semana passa para segunda).</p>
              )}
            </div>
          </div>

          <div>
            <Label>Detalhes</Label>
            <Textarea rows={3} value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Orientações, links, o que falta…" />
          </div>

          <div>
            <Label>Checklist</Label>
            <div className="space-y-1.5 mt-1">
              {form.checklist.map((it, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <Checkbox checked={it.feito} onCheckedChange={v => set('checklist', form.checklist.map((x, j) => j === i ? { ...x, feito: !!v } : x))} />
                  <span className={`text-sm flex-1 ${it.feito ? 'line-through text-muted-foreground' : ''}`}>{it.texto}</span>
                  <button type="button" className="opacity-60 hover:opacity-100" onClick={() => set('checklist', form.checklist.filter((_, j) => j !== i))} aria-label="Remover item">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={novoItem} onChange={e => setNovoItem(e.target.value)} placeholder="Adicionar item"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} className="h-8" />
                <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>

          {tarefa && (
            <div className="border-t border-border pt-4">
              <Label>Comentários</Label>
              <div className="space-y-2 mt-2">
                {comentarios.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {(comentarios.data ?? []).map(c => (
                  <div key={c.id} className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{nomeAmigavel(c.autor_nome)} · {new Date(c.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
                    <p className="text-sm whitespace-pre-wrap">{c.texto}</p>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Textarea rows={2} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Escreva um comentário…" />
                  <Button type="button" variant="outline" size="icon" disabled={!comentario.trim() || comentar.isPending} onClick={() => comentar.mutate()} aria-label="Enviar comentário">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </form>

        <div className="px-6 py-3 border-t border-border flex items-center gap-2">
          {podeExcluir && (
            <Button variant="ghost" size="sm" className="text-destructive" disabled={excluir.isPending}
              onClick={() => { if (confirm('Excluir esta tarefa?')) excluir.mutate(); }}>
              <Trash2 className="w-4 h-4 mr-1" /> Excluir
            </Button>
          )}
          <div className="flex-1" />
          {tarefa && form.status !== 'concluida' && (
            <Button variant="outline" size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate({ ...form, status: 'concluida' })}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Concluir
            </Button>
          )}
          {tarefa && tarefa.status === 'concluida' && (
            <Button variant="outline" size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate({ ...form, status: 'a_fazer' })}>
              <RotateCcw className="w-4 h-4 mr-1" /> Reabrir
            </Button>
          )}
          <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate(form)}>
            {salvar.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
