import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ContratoParcelas } from '@/components/ContratoParcelas';
import { ContratoCamposPersonalizados, camposObrigatoriosFaltando, type ValoresCampos } from '@/components/ContratoCamposPersonalizados';
import { ContratoHistorico } from '@/components/ContratoHistorico';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Loader2, Lock, Trash2, X, ScrollText, XCircle, CheckCircle2, MinusCircle, ArrowRight } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { getEffectiveStatus, STATUS_LABEL, type EffectiveStatus } from '@/lib/contrato-status';
import { isValidTransition } from '@/components/KanbanBoard';
import { maskCPF } from '@/lib/cliente-search';
import { dataComissionada } from '@/lib/travas';
import { SolicitarAlteracaoDialog } from '@/components/SolicitarAlteracaoDialog';
import { useUserRole } from '@/hooks/useUserRole';

type Divisao = 'advogados' | 'educacao';

export interface ProcessoEditable {
  id: string;
  nome_cliente: string;
  cpf: string | null;
  telefone: string | null;
  product_id: string | null;
  closer_id: string | null;
  valor: number;
  data_fechamento: string | null;
  fechado_em: string | null;
  status_qualificacao: 'pendente' | 'qualificado' | 'desqualificado';
  protocolado: boolean | null;
  data_protocolo: string | null;
  tipo_processo: string | null;
  teve_exito: boolean | null;
  valor_exito: number;
  data_recebimento: string | null;
  valor_honorarios_recebidos: number;
  data_pagamento_confirmado?: string | null;
  motivo_desqualificacao: string | null;
  divisao: Divisao;
  created_at?: string;
  updated_at?: string;
  qualificado_em?: string | null;
}

interface Props {
  contrato: ProcessoEditable | null;
  onClose: () => void;
  closers: { id: string; nome: string }[];
  products: { id: string; nome: string; tem_honorarios_iniciais?: boolean }[];
  /** Callbacks que abrem os diálogos de transição já existentes */
  onTransition: (row: ProcessoEditable, to: EffectiveStatus) => void;
  /** Permissões */
  canEditAll: boolean;        // operador técnico ou gestor
  canEditClient: boolean;     // closer (somente em pendente) | operador | gestor
  canChangeCloser: boolean;   // gestor
  canDelete: boolean;         // gestor
  canChangeStatus: boolean;   // operador técnico ou gestor
  readOnly?: boolean;         // visão closer fora de pendente
}

function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—';
  const d = s.length <= 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function onlyDigits(s: string) { return s.replace(/\D/g, ''); }

export function ProcessoEditSheet({
  contrato,
  onClose,
  closers,
  products,
  onTransition,
  canEditAll,
  canEditClient,
  canChangeCloser,
  canDelete,
  canChangeStatus,
  readOnly,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<ProcessoEditable>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [solicitarOpen, setSolicitarOpen] = useState(false);
  const [camposValores, setCamposValores] = useState<ValoresCampos>({});
  const { isGestor } = useUserRole();
  const travada = (campo: 'data_fechamento' | 'data_protocolo' | 'data_pagamento_confirmado' | 'data_recebimento') =>
    !isGestor && dataComissionada((contrato?.[campo] ?? null) as string | null);
  const camposTravados = contrato ? ([
    ...(dataComissionada(contrato.data_fechamento) ? [{ campo: 'data_fechamento', valorAtual: contrato.data_fechamento }] : []),
    ...(dataComissionada(contrato.data_protocolo) ? [{ campo: 'data_protocolo', valorAtual: contrato.data_protocolo }] : []),
    ...(dataComissionada(contrato.data_pagamento_confirmado ?? null) ? [{ campo: 'data_pagamento_confirmado', valorAtual: contrato.data_pagamento_confirmado ?? null }] : []),
    ...(dataComissionada(contrato.data_recebimento) ? [{ campo: 'data_recebimento', valorAtual: contrato.data_recebimento }] : []),
  ]) : [];

  const eff: EffectiveStatus | null = contrato ? getEffectiveStatus(contrato) : null;
  const isPendente = eff === 'pendente';

  // Protocol/result fields are editable only by técnico/admin
  const canEditProtocolo = canEditAll;
  const canEditResultado = canEditAll;

  useEffect(() => {
    if (contrato) {
      setForm({
        nome_cliente: contrato.nome_cliente,
        cpf: contrato.cpf ?? '',
        telefone: contrato.telefone ?? '',
        product_id: contrato.product_id,
        closer_id: contrato.closer_id,
        valor: contrato.valor,
        data_fechamento: contrato.data_fechamento ?? '',
        tipo_processo: contrato.tipo_processo ?? 'judicial',
        data_protocolo: contrato.data_protocolo ?? '',
        teve_exito: contrato.teve_exito,
        valor_exito: contrato.valor_exito,
        data_recebimento: contrato.data_recebimento ?? '',
        valor_honorarios_recebidos: contrato.valor_honorarios_recebidos,
        data_pagamento_confirmado: contrato.data_pagamento_confirmado ?? '',
        motivo_desqualificacao: contrato.motivo_desqualificacao ?? '',
      });
      setCamposValores(((contrato as { campos_personalizados?: ValoresCampos }).campos_personalizados ?? {}) as ValoresCampos);
      setDirty(false);
      setErrors({});
    }
  }, [contrato]);

  function update<K extends keyof ProcessoEditable>(key: K, value: ProcessoEditable[K]) {
    setForm(s => ({ ...s, [key]: value }));
    setDirty(true);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.nome_cliente || !String(form.nome_cliente).trim()) e.nome_cliente = 'Cliente é obrigatório';
    if (form.cpf) {
      const d = onlyDigits(String(form.cpf));
      if (d && d.length !== 11) e.cpf = 'CPF deve ter 11 dígitos';
    }
    if ((Number(form.valor) || 0) <= 0) e.valor = 'Valor deve ser maior que zero';
    if (form.data_recebimento && form.data_protocolo && form.data_recebimento < form.data_protocolo) {
      e.data_recebimento = 'Recebimento não pode ser anterior ao protocolo';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      if (!validate()) throw new Error('Verifique os campos do formulário');
      const payload: Record<string, unknown> = {
        nome_cliente: String(form.nome_cliente).trim(),
        cpf: form.cpf ? onlyDigits(String(form.cpf)) : null,
        telefone: form.telefone || null,
        valor: Number(form.valor) || 0,
        data_fechamento: form.data_fechamento || null,
        tipo_processo: form.tipo_processo || null,
        data_pagamento_confirmado: form.data_pagamento_confirmado || null,
        campos_personalizados: camposValores,
      };
      if (canEditClient) {
        payload.product_id = form.product_id ?? null;
      }
      if (canChangeCloser) {
        payload.closer_id = form.closer_id ?? null;
      }
      if (canEditProtocolo) {
        payload.data_protocolo = form.data_protocolo || null;
      }
      if (canEditResultado) {
        payload.valor_exito = Number(form.valor_exito) || 0;
        payload.data_recebimento = form.data_recebimento || null;
        payload.valor_honorarios_recebidos = Number(form.valor_honorarios_recebidos) || 0;
        payload.motivo_desqualificacao = form.motivo_desqualificacao || null;
      }
      const { error } = await supabase.from('clientes_fechados').update(payload as never).eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contrato atualizado com sucesso');
      qc.invalidateQueries({ queryKey: ['processos-contratos'] });
      qc.invalidateQueries({ queryKey: ['fechamento'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['protocolo-stats'] });
      setDirty(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      const { error } = await supabase.from('clientes_fechados').delete().eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contrato excluído');
      qc.invalidateQueries({ queryKey: ['processos-contratos'] });
      qc.invalidateQueries({ queryKey: ['fechamento'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleClose() {
    if (dirty && !confirm('Há alterações não salvas. Deseja descartar?')) return;
    onClose();
  }

  const transitions = useMemo<{ to: EffectiveStatus; label: string; color: string; icon: React.ElementType }[]>(() => {
    if (!eff) return [];
    return [
      { to: 'qualificado' as const, label: 'Qualificar', color: '#00BCD4', icon: ScrollText },
      { to: 'exito' as const, label: 'Marcar Êxito', color: '#22C55E', icon: CheckCircle2 },
      { to: 'sem_exito' as const, label: 'Sem Êxito', color: '#6B7280', icon: MinusCircle },
      { to: 'desqualificado' as const, label: 'Desqualificar', color: '#EF4444', icon: XCircle },
    ];
  }, [eff]);

  return (
    <Sheet open={!!contrato} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="right"
        className="bg-[#0A0B0F] border-l border-[#1F2937] w-full sm:max-w-[520px] p-0 overflow-hidden flex flex-col"
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            save.mutate();
          }
        }}
      >
        {contrato && eff && (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-[#1F2937] bg-[#0F1117]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-white truncate">{contrato.nome_cliente}</h2>
                  {contrato.cpf && (
                    <p className="font-mono text-xs text-muted-foreground mt-1">{maskCPF(contrato.cpf)}</p>
                  )}
                  {contrato.closer_id && (
                    <p className="text-xs text-muted-foreground mt-1">Vendedor: <span className="text-foreground font-medium">{closers.find(c => c.id === contrato.closer_id)?.nome ?? '—'}</span></p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <StatusBadge contrato={contrato} size="md" />
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => { if (confirm('Excluir este contrato?')) remove.mutate(); }}
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose} title="Fechar">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {readOnly && (
                <p className="text-[11px] text-muted-foreground mt-2 italic">Visualização somente leitura</p>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {/* Seção 1 — Dados do Contrato */}
              <Section title="Dados do contrato">
                <FieldRow>
                  <FieldWrap label="Cliente" required error={errors.nome_cliente} locked={!canEditClient}>
                    <Input value={form.nome_cliente ?? ''} onChange={(e) => update('nome_cliente', e.target.value)} disabled={!canEditClient} />
                  </FieldWrap>
                </FieldRow>
                <FieldRow cols={2}>
                  <FieldWrap label="CPF" error={errors.cpf} locked={!canEditClient}>
                    <Input
                      value={form.cpf ? maskCPF(String(form.cpf)) : ''}
                      onChange={(e) => update('cpf', onlyDigits(e.target.value).slice(0, 11))}
                      disabled={!canEditClient}
                      className="font-mono"
                      placeholder="000.000.000-00"
                    />
                  </FieldWrap>
                  <FieldWrap label="Telefone" locked={!canEditClient}>
                    <Input value={form.telefone ?? ''} onChange={(e) => update('telefone', e.target.value)} disabled={!canEditClient} placeholder="(11) 99999-0000" />
                  </FieldWrap>
                </FieldRow>
                <FieldRow cols={2}>
                  <FieldWrap label="Produto" locked={!canEditClient}>
                    <Select value={form.product_id ?? ''} onValueChange={(v) => update('product_id', v)} disabled={!canEditClient}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {products.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FieldWrap>
                  <FieldWrap label="Tipo" locked={!canEditAll}>
                    <Select value={form.tipo_processo ?? 'judicial'} onValueChange={(v) => update('tipo_processo', v)} disabled={!canEditAll}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="judicial">Judicial</SelectItem>
                        <SelectItem value="administrativo">Administrativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldWrap>
                </FieldRow>
                <FieldRow cols={2}>
                  <FieldWrap label="Valor (R$)" required error={errors.valor} locked={!canEditClient}>
                    <Input type="number" step="0.01" value={form.valor ?? 0} onChange={(e) => update('valor', Number(e.target.value))} disabled={!canEditClient} />
                  </FieldWrap>
                  <FieldWrap label="Data do fechamento (assinatura)" locked={!canEditAll || travada('data_fechamento')}>
                    <Input type="date" value={form.data_fechamento ?? ''} onChange={(e) => update('data_fechamento', e.target.value)} disabled={!canEditAll || travada('data_fechamento')} />
                  </FieldWrap>
                </FieldRow>
                {!!products.find(p => p.id === form.product_id)?.tem_honorarios_iniciais && (
                  <FieldRow>
                    <FieldWrap label="Recebimento dos honorários iniciais" locked={!canEditAll}>
                      <Input type="date" value={form.data_pagamento_confirmado ?? ''} onChange={(e) => update('data_pagamento_confirmado', e.target.value)} disabled={!canEditAll || travada('data_pagamento_confirmado')} />
                      <p className="text-[11px] text-muted-foreground mt-1">Pode ser depois da assinatura (ex.: pagamento em até 30 dias). Libera a etapa de comissão correspondente.</p>
                    </FieldWrap>
                  </FieldRow>
                )}

                <div className="rounded-xl border border-border p-3 space-y-2">
                  <ContratoParcelas contratoId={contrato.id} valorContrato={Number(contrato.valor) || 0} canEdit={canEditAll} />
                </div>

                <ContratoCamposPersonalizados
                  productId={(form.product_id as string) ?? contrato.product_id}
                  valores={camposValores}
                  onChange={(v) => { setCamposValores(v); setDirty(true); }}
                  disabled={!canEditAll}
                />

                <ContratoHistorico contratoId={contrato.id} isGestor={isGestor} />
                <FieldRow>
                  <FieldWrap label="Closer responsável" locked={!canChangeCloser}>
                    <Select value={form.closer_id ?? ''} onValueChange={(v) => update('closer_id', v)} disabled={!canChangeCloser}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {closers.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FieldWrap>
                </FieldRow>
              </Section>

              {/* Seção 2 — Protocolo */}
              <Section title="Protocolo">
                <FieldRow>
                  <FieldWrap label="Data do protocolo" locked={!canEditProtocolo}>
                    <Input type="date" value={form.data_protocolo ?? ''} onChange={(e) => update('data_protocolo', e.target.value)} disabled={!canEditProtocolo || travada('data_protocolo')} />
                  </FieldWrap>
                </FieldRow>
              </Section>

              {/* Seção 3 — Resultado */}
              <Section title="Resultado">
                <FieldRow cols={2}>
                  <FieldWrap label="Valor do êxito (R$)" locked={!canEditResultado}>
                    <Input type="number" step="0.01" value={form.valor_exito ?? 0} onChange={(e) => update('valor_exito', Number(e.target.value))} disabled={!canEditResultado} />
                  </FieldWrap>
                  <FieldWrap label="Data de recebimento" error={errors.data_recebimento} locked={!canEditResultado}>
                    <Input type="date" value={form.data_recebimento ?? ''} onChange={(e) => update('data_recebimento', e.target.value)} disabled={!canEditResultado || travada('data_recebimento')} />
                  </FieldWrap>
                </FieldRow>
                <FieldRow>
                  <FieldWrap label="Valor recebido (R$)" locked={!canEditResultado}>
                    <Input type="number" step="0.01" value={form.valor_honorarios_recebidos ?? 0} onChange={(e) => update('valor_honorarios_recebidos', Number(e.target.value))} disabled={!canEditResultado} />
                  </FieldWrap>
                </FieldRow>
                {(eff === 'desqualificado' || canEditResultado) && (
                  <FieldWrap label="Motivo da desqualificação / encerramento" locked={!canEditResultado}>
                    <Textarea rows={3} value={form.motivo_desqualificacao ?? ''} onChange={(e) => update('motivo_desqualificacao', e.target.value)} disabled={!canEditResultado} />
                  </FieldWrap>
                )}
              </Section>

              {/* Seção 4 — Mover de Fase */}
              {canChangeStatus && (
                <Section title="Mover de fase">
                  <div className="grid grid-cols-2 gap-2">
                    {transitions.map(t => {
                      const valid = isValidTransition(eff, t.to);
                      return (
                        <button
                          key={t.to}
                          type="button"
                          disabled={!valid}
                          onClick={() => onTransition(contrato, t.to)}
                          title={valid ? `Mover para ${STATUS_LABEL[t.to]}` : 'Transição não permitida a partir do status atual'}
                          className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition-all border ${
                            valid
                              ? 'border-[#1F2937] hover:scale-[1.02] hover:shadow-lg cursor-pointer'
                              : 'border-[#1F2937]/50 opacity-40 cursor-not-allowed'
                          }`}
                          style={valid ? { background: `${t.color}15`, color: t.color, borderColor: `${t.color}40` } : undefined}
                        >
                          <t.icon className="w-4 h-4" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Seção 5 — Timeline */}
              <Section title="Linha do tempo">
                <ol className="relative pl-4 border-l border-[#1F2937] space-y-3 text-xs">
                  <Step active title="Contrato criado" color="#9CA3AF" date={fmtDateTime(contrato.created_at ?? contrato.fechado_em ?? contrato.data_fechamento)} />
                  <Step active title="Pendente" color="#F59E0B" date={fmtDateTime(contrato.fechado_em ?? contrato.data_fechamento)} />
                  {(eff === 'qualificado' || eff === 'exito' || eff === 'sem_exito') && (
                    <Step active title="Qualificado" color="#00BCD4" date={fmtDateTime(contrato.qualificado_em ?? contrato.data_protocolo)} />
                  )}
                  {eff === 'desqualificado' && <Step active title="Desqualificado" color="#EF4444" date={fmtDateTime(contrato.updated_at)} />}
                  {eff === 'exito' && <Step active title="Êxito" color="#22C55E" date={fmtDateTime(contrato.data_recebimento ?? contrato.updated_at)} />}
                  {eff === 'sem_exito' && <Step active title="Sem êxito" color="#6B7280" date={fmtDateTime(contrato.updated_at)} />}
                </ol>
              </Section>
            </div>

            {/* Aviso de datas travadas (dedo duro) */}
            {!isGestor && camposTravados.length > 0 && !readOnly && (
              <div className="mx-6 mb-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-warning">
                  🔒 {camposTravados.length === 1 ? 'Uma data deste contrato pertence' : 'Datas deste contrato pertencem'} a mês já comissionado e não {camposTravados.length === 1 ? 'pode' : 'podem'} ser alterada{camposTravados.length === 1 ? '' : 's'} diretamente.
                </p>
                <Button size="sm" variant="outline" className="border-warning/50 text-warning hover:bg-warning/10" onClick={() => setSolicitarOpen(true)}>
                  Solicitar alteração ao gestor
                </Button>
              </div>
            )}

            {/* Footer */}
            {!readOnly && (
              <div className="border-t border-[#1F2937] px-6 py-4 bg-[#0F1117] flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={handleClose} className="text-muted-foreground">Cancelar</Button>
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !dirty}
                  className="bg-[#D4AF37] text-black hover:bg-[#D4AF37]/90 gap-2 min-w-[180px]"
                >
                  {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Salvar alterações
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
      {contrato && (
        <SolicitarAlteracaoDialog
          open={solicitarOpen}
          onClose={() => setSolicitarOpen(false)}
          contratoId={contrato.id}
          nomeCliente={contrato.nome_cliente}
          camposTravados={camposTravados}
        />
      )}
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FieldRow({ children, cols = 1 }: { children: React.ReactNode; cols?: 1 | 2 }) {
  return <div className={cols === 2 ? 'grid grid-cols-2 gap-3' : ''}>{children}</div>;
}

function FieldWrap({ label, children, required, error, locked }: { label: string; children: React.ReactNode; required?: boolean; error?: string; locked?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        {label}{required && <span className="text-destructive">*</span>}
        {locked && <Lock className="w-3 h-3 opacity-60" />}
      </Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function Step({ title, color, date, active }: { title: string; color: string; date?: string; active?: boolean }) {
  return (
    <li className="relative">
      <span
        className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full border-2"
        style={{ background: active ? color : 'transparent', borderColor: color }}
      />
      <p className="font-medium" style={{ color }}>{title}</p>
      {date && <p className="text-muted-foreground">{date}</p>}
    </li>
  );
}
