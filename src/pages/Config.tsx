import { BRAND } from '@/config/brand';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, UserPlus, Shield, ShieldOff, Plus, Pencil, Trash2, Flag, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DivisaoSelector } from '@/components/DivisaoSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useUserRole, type AppRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ColaboradoresManagement } from '@/components/ColaboradoresManagement';
import { ComissaoNiveisConfig } from '@/components/ComissaoNiveisConfig';
import { SolicitacoesGestor } from '@/components/SolicitacoesGestor';
import { useSolicitacoesPendentes } from '@/hooks/useSolicitacoesPendentes';
import { useMotivosDesqualificacao, normalizarMotivos, MOTIVO_DIVERSO, MOTIVOS_CONFIG_CHAVE } from '@/lib/desqualificacao';
import { PERMISSOES, padraoDaPermissao, type PermissaoChave } from '@/lib/permissoes';
import { X, SlidersHorizontal } from 'lucide-react';

type Divisao = 'advogados' | 'educacao';

interface ConfigRow { id: string; chave: string; valor: unknown; divisao: string; meta_mensal: number | null; }

const ROLES: { value: AppRole; label: string }[] = [
  { value: 'gestor', label: 'Gestor' },
  { value: 'operador_tecnico', label: 'Operador Técnico' },
  { value: 'sdr', label: 'SDR' },
  { value: 'closer', label: 'Closer' },
  { value: 'full_cycle', label: 'Full Cycle' },
  { value: 'usuario', label: 'Usuário (somente leitura)' },
];

const VENDAS_ROLES: AppRole[] = ['sdr', 'closer', 'full_cycle'];

export default function Config() {
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const [metaMensal, setMetaMensal] = useState('');
  const qc = useQueryClient();
  const { isGestor, isOperador, isLoading: loadingRole } = useUserRole();
  const canManageColabs = isGestor || isOperador;
  const pendentes = useSolicitacoesPendentes();

  const { data, isLoading } = useQuery({
    queryKey: ['config', divisao],
    queryFn: async () => {
      const { data, error } = await supabase.from('config').select('*').eq('divisao', divisao);
      if (error) throw error;
      return data as ConfigRow[];
    },
  });

  useEffect(() => {
    if (!data) return;
    const metaRow = data.find(r => r.meta_mensal != null);
    setMetaMensal(metaRow?.meta_mensal != null ? String(metaRow.meta_mensal) : '');
  }, [data]);

  const saveMeta = useMutation({
    mutationFn: async () => {
      const metaRow = (data ?? []).find(r => r.meta_mensal != null);
      if (metaRow) {
        const { error } = await supabase.from('config').update({ meta_mensal: Number(metaMensal) || 0 }).eq('id', metaRow.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('config').insert({ divisao, meta_mensal: Number(metaMensal) || 0, chave: 'meta_mensal', valor: Number(metaMensal) || 0 });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config', divisao] }); toast.success('Meta atualizada!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-foreground">Configurações</h1><p className="text-sm text-muted-foreground mt-1">Parâmetros, squads e usuários</p></div>

      <Tabs defaultValue="parametros" className="w-full">
        <TabsList>
          <TabsTrigger value="parametros">Parâmetros</TabsTrigger>
          {isGestor && <TabsTrigger value="metas">Metas</TabsTrigger>}
          {isGestor && <TabsTrigger value="squads">Squads</TabsTrigger>}
          {isGestor && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
          {isGestor && <TabsTrigger value="comissoes">Comissões</TabsTrigger>}
          {isGestor && (
            <TabsTrigger value="solicitacoes" className="gap-1.5">
              Solicitações
              {pendentes > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold">
                  {pendentes}
                </span>
              )}
            </TabsTrigger>
          )}
          {canManageColabs && <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>}
          <TabsTrigger value="conta">Minha conta</TabsTrigger>
        </TabsList>

        {isGestor && (
          <TabsContent value="metas" className="mt-4">
            <MetasManagement />
          </TabsContent>
        )}

        <TabsContent value="parametros" className="space-y-6 mt-4">
          <DivisaoSelector value={divisao} onChange={setDivisao} />
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <div className="glass-card p-5 space-y-4">
              <h3 className="font-semibold text-foreground">Meta Mensal da Divisão</h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Valor da meta (R$)</label>
                  <Input type="number" value={metaMensal} onChange={e => setMetaMensal(e.target.value)} placeholder="Ex: 100000" disabled={!isGestor} />
                </div>
                {isGestor && (
                  <Button onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending} className="gap-2">
                    {saveMeta.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
                  </Button>
                )}
              </div>
            </div>
          )}
          {isGestor && <MotivosDesqualificacaoConfig divisao={divisao} configRows={data ?? []} />}
        </TabsContent>

        {isGestor && (
          <TabsContent value="squads" className="mt-4">
            <SquadsManagement />
          </TabsContent>
        )}

        {isGestor && (
          <TabsContent value="usuarios" className="mt-4">
            <UsersManagement />
          </TabsContent>
        )}

        {isGestor && (
          <TabsContent value="comissoes" className="mt-4">
            <ComissaoNiveisConfig />
          </TabsContent>
        )}

        {isGestor && (
          <TabsContent value="solicitacoes" className="mt-4">
            <SolicitacoesGestor />
          </TabsContent>
        )}

        {canManageColabs && (
          <TabsContent value="colaboradores" className="mt-4">
            <ColaboradoresManagement />
          </TabsContent>
        )}

        <TabsContent value="conta" className="mt-4">
          <MinhaConta />
        </TabsContent>
      </Tabs>

      {loadingRole && (
        <div className="text-xs text-muted-foreground">Carregando permissões...</div>
      )}
    </div>
  );
}

// ============= Minha conta (todos os usuários) =============

function PermissoesDialog({ alvo, onClose }: { alvo: { user_id: string; nome: string; roles: AppRole[] } | null; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: overrides, isLoading } = useQuery({
    queryKey: ['permissoes-usuario', alvo?.user_id],
    enabled: !!alvo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissoes')
        .select('permissao, permitido')
        .eq('user_id', alvo!.user_id);
      if (error) throw error;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach(r => { map[r.permissao] = r.permitido; });
      return map;
    },
  });

  const setPerm = useMutation({
    mutationFn: async ({ chave, valor }: { chave: PermissaoChave; valor: 'padrao' | 'permitir' | 'bloquear' }) => {
      if (!alvo) return;
      if (valor === 'padrao') {
        const { error } = await supabase.from('user_permissoes').delete().eq('user_id', alvo.user_id).eq('permissao', chave);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_permissoes').upsert(
          { user_id: alvo.user_id, permissao: chave, permitido: valor === 'permitir' },
          { onConflict: 'user_id,permissao' },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissoes-usuario', alvo?.user_id] });
      qc.invalidateQueries({ queryKey: ['user-permissoes'] });
      toast.success('Permissão atualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!alvo} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Permissões — {alvo?.nome}</DialogTitle></DialogHeader>
        <p className="text-[11px] text-muted-foreground -mt-2">
          "Padrão do papel" segue a regra da função do usuário. Use Permitir/Bloquear apenas para abrir exceções específicas.
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-2">
            {PERMISSOES.map(p => {
              const ov = overrides?.[p.chave];
              const atual: 'padrao' | 'permitir' | 'bloquear' = ov === undefined ? 'padrao' : ov ? 'permitir' : 'bloquear';
              const padrao = alvo ? padraoDaPermissao(p.chave, alvo.roles) : false;
              const efetivo = ov === undefined ? padrao : ov;
              return (
                <div key={p.chave} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {p.label}
                      <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] ${efetivo ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>
                        {efetivo ? 'liberado' : 'bloqueado'}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">{p.descricao}</p>
                  </div>
                  <Select
                    value={atual}
                    onValueChange={v => setPerm.mutate({ chave: p.chave, valor: v as 'padrao' | 'permitir' | 'bloquear' })}
                  >
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="padrao">Padrão do papel ({padrao ? 'libera' : 'bloqueia'})</SelectItem>
                      <SelectItem value="permitir">Permitir</SelectItem>
                      <SelectItem value="bloquear">Bloquear</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MotivosDesqualificacaoConfig({ divisao, configRows }: { divisao: Divisao; configRows: ConfigRow[] }) {
  const qc = useQueryClient();
  const motivos = useMotivosDesqualificacao(divisao);
  const [novo, setNovo] = useState('');

  const salvar = useMutation({
    mutationFn: async (lista: string[]) => {
      const valor = normalizarMotivos(lista);
      const row = configRows.find(r => r.chave === MOTIVOS_CONFIG_CHAVE);
      if (row) {
        const { error } = await supabase.from('config').update({ valor }).eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('config').insert({ divisao, chave: MOTIVOS_CONFIG_CHAVE, valor });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['motivos-desqualificacao', divisao] });
      qc.invalidateQueries({ queryKey: ['config', divisao] });
      setNovo('');
      toast.success('Motivos atualizados!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function adicionar() {
    const m = novo.trim();
    if (!m) return;
    if (motivos.some(x => x.toLowerCase() === m.toLowerCase())) { toast.error('Esse motivo já existe'); return; }
    salvar.mutate([...motivos, m]);
  }

  function remover(m: string) {
    if (m === MOTIVO_DIVERSO) { toast.error('"Motivo diverso" é fixo — é ele que abre o campo de texto livre.'); return; }
    salvar.mutate(motivos.filter(x => x !== m));
  }

  return (
    <div className="glass-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">Motivos de Desqualificação</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Lista mostrada ao desqualificar um contrato (aba Processos) e usada no relatório da aba Qualificação.
          "Motivo diverso" é fixo e abre um campo de texto livre.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {motivos.map(m => (
          <span key={m} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/25">
            {m}
            {m !== MOTIVO_DIVERSO && (
              <button type="button" onClick={() => remover(m)} disabled={salvar.isPending} title={`Remover "${m}"`} className="hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <div className="flex gap-2 max-w-md">
        <Input
          placeholder="Novo motivo (ex.: Fora do prazo legal)"
          value={novo}
          onChange={e => setNovo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') adicionar(); }}
        />
        <Button onClick={adicionar} disabled={salvar.isPending || !novo.trim()} className="gap-2 shrink-0">
          {salvar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
        </Button>
      </div>
    </div>
  );
}

function MinhaConta() {
  const [email, setEmail] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const alterarSenha = useMutation({
    mutationFn: async () => {
      const nova = senha.trim();
      if (nova.length < 6) throw new Error('A senha deve ter no mínimo 6 caracteres');
      if (nova !== confirma.trim()) throw new Error('As senhas não conferem');
      const { error } = await supabase.auth.updateUser({ password: nova });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Senha alterada com sucesso!');
      setSenha('');
      setConfirma('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="glass-card p-5 space-y-4 max-w-md">
      <div>
        <h3 className="font-semibold text-foreground flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> Alterar senha</h3>
        <p className="text-xs text-muted-foreground mt-1">Logado como {email ?? '...'}. A nova senha vale a partir do próximo login.</p>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Nova senha (mín. 6 caracteres)</label>
        <Input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Confirmar nova senha</label>
        <Input type="password" value={confirma} onChange={e => setConfirma(e.target.value)} autoComplete="new-password" />
      </div>
      <Button
        onClick={() => alterarSenha.mutate()}
        disabled={alterarSenha.isPending || !senha || !confirma}
        className="gap-2 w-full"
      >
        {alterarSenha.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Alterar senha
      </Button>
    </div>
  );
}

// ============= Squads CRUD =============

interface SquadRow {
  id: string;
  nome: string;
  divisao: Divisao;
  motto: string | null;
  meta_mensal: number;
  bandeira_url: string | null;
  ativo: boolean;
}

function SquadsManagement() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SquadRow | null>(null);
  const [form, setForm] = useState<{ nome: string; divisao: Divisao; motto: string; meta_mensal: string; bandeira_url: string; ativo: boolean }>(
    { nome: '', divisao: 'advogados', motto: '', meta_mensal: '0', bandeira_url: '', ativo: true }
  );

  const { data: squads, isLoading } = useQuery({
    queryKey: ['admin-squads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('squads').select('*').order('nome');
      if (error) throw error;
      return data as SquadRow[];
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: '', divisao: 'advogados', motto: '', meta_mensal: '0', bandeira_url: '', ativo: true });
    setOpen(true);
  };

  const openEdit = (s: SquadRow) => {
    setEditing(s);
    setForm({
      nome: s.nome,
      divisao: s.divisao,
      motto: s.motto ?? '',
      meta_mensal: String(s.meta_mensal ?? 0),
      bandeira_url: s.bandeira_url ?? '',
      ativo: s.ativo,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: form.nome.trim(),
        divisao: form.divisao,
        motto: form.motto.trim() || null,
        meta_mensal: Number(form.meta_mensal) || 0,
        bandeira_url: form.bandeira_url.trim() || null,
        ativo: form.ativo,
      };
      if (!payload.nome) throw new Error('Nome obrigatório');
      if (editing) {
        const { error } = await supabase.from('squads').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('squads').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-squads'] }); qc.invalidateQueries({ queryKey: ['squads-options'] }); toast.success('Salvo!'); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('squads').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-squads'] }); qc.invalidateQueries({ queryKey: ['squads-options'] }); toast.success('Squad removido'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Squads</h3>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Novo Squad</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : !squads || squads.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground">Nenhum squad cadastrado</p></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="divide-y divide-border">
            {squads.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Flag className={`w-4 h-4 shrink-0 ${s.ativo ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{s.nome} <span className="text-xs text-muted-foreground">· {s.divisao}</span></p>
                    <p className="text-xs text-muted-foreground truncate">{s.motto ?? '—'} · meta R$ {Number(s.meta_mensal).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => { if (confirm(`Remover squad "${s.nome}"?`)) remove.mutate(s.id); }}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{editing ? 'Editar Squad' : 'Novo Squad'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Divisão</label>
              <Select value={form.divisao} onValueChange={v => setForm(f => ({ ...f, divisao: v as Divisao }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advogados">{BRAND.divisionLabels.advogados}</SelectItem>
                  <SelectItem value="educacao">{BRAND.divisionLabels.educacao}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Lema</label>
              <Input value={form.motto} onChange={e => setForm(f => ({ ...f, motto: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Meta mensal (R$)</label>
              <Input type="number" value={form.meta_mensal} onChange={e => setForm(f => ({ ...f, meta_mensal: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">URL da bandeira (opcional)</label>
              <Input value={form.bandeira_url} onChange={e => setForm(f => ({ ...f, bandeira_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="flex items-center gap-2">
              <input id="sq-ativo" type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
              <label htmlFor="sq-ativo" className="text-sm text-foreground">Ativo</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============= Gestão de usuários =============

interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  squad_id: string | null;
  pct_comissao_qualif: number;
  roles: AppRole[];
}

function UsersManagement() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', password: '', display_name: '', role: 'usuario' as AppRole });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<{ user_id: string; display_name: string; email: string }>({ user_id: '', display_name: '', email: '' });
  const [permUser, setPermUser] = useState<{ user_id: string; nome: string; roles: AppRole[] } | null>(null);

  const { data: squadOptions } = useQuery({
    queryKey: ['squads-options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('squads').select('id, nome, divisao').order('nome');
      if (error) throw error;
      return data as { id: string; nome: string; divisao: string }[];
    },
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, email, squad_id, percentual_comissao_qualificacao').order('display_name'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const byUser = new Map<string, AppRole[]>();
      (roles ?? []).forEach(r => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        byUser.set(r.user_id, arr);
      });
      return (profiles ?? []).map(p => ({
        user_id: p.user_id,
        display_name: p.display_name,
        email: p.email,
        squad_id: (p as { squad_id: string | null }).squad_id ?? null,
        pct_comissao_qualif: Number((p as { percentual_comissao_qualificacao?: number }).percentual_comissao_qualificacao ?? 0),
        roles: byUser.get(p.user_id) ?? [],
      })) as UserRow[];
    },
  });

  const { user: authUser } = useAuth();

  const toggleRole = useMutation({
    mutationFn: async ({ user_id, role, has, totalRoles }: { user_id: string; role: AppRole; has: boolean; totalRoles: number }) => {
      if (has) {
        if (role === 'gestor' && user_id === authUser?.id) {
          throw new Error('Você não pode remover seu próprio papel de gestor.');
        }
        if (totalRoles <= 1) {
          throw new Error('O usuário precisa ter pelo menos um papel.');
        }
        const { error } = await supabase.from('user_roles').delete().eq('user_id', user_id).eq('role', role);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_roles').insert({ user_id, role });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('Papéis atualizados!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSquad = useMutation({
    mutationFn: async ({ user_id, squad_id }: { user_id: string; squad_id: string | null }) => {
      const { error } = await supabase.from('profiles').update({ squad_id }).eq('user_id', user_id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('Squad atualizado!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPctQualif = useMutation({
    mutationFn: async ({ user_id, pct }: { user_id: string; pct: number }) => {
      const { error } = await supabase.from('profiles').update({ percentual_comissao_qualificacao: pct }).eq('user_id', user_id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('% comissão atualizado!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('invite-user', { body: invite });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Usuário criado!');
      setInviteOpen(false);
      setInvite({ email: '', password: '', display_name: '', role: 'usuario' });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const display_name = editForm.display_name.trim();
      const email = editForm.email.trim();
      if (!display_name) throw new Error('Nome obrigatório');
      if (!email) throw new Error('Email obrigatório');
      const { error } = await supabase.from('profiles').update({ display_name, email }).eq('user_id', editForm.user_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Usuário atualizado!');
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (u: UserRow) => {
    setEditForm({ user_id: u.user_id, display_name: u.display_name ?? '', email: u.email ?? '' });
    setEditOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Usuários, Papéis e Squad</h3>
        <Button onClick={() => setInviteOpen(true)} className="gap-2"><UserPlus className="w-4 h-4" /> Convidar</Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : !users || users.length === 0 ? (
        <div className="glass-card p-12 text-center"><p className="text-muted-foreground">Nenhum usuário encontrado</p></div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="divide-y divide-border">
            {users.map(u => {
              const userRoles = (u.roles.length ? u.roles : ['usuario']) as AppRole[];
              const isVendas = userRoles.some(r => VENDAS_ROLES.includes(r));
              return (
                <div key={u.user_id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {userRoles.includes('gestor') ? <Shield className="w-4 h-4 text-primary shrink-0" /> : <ShieldOff className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{u.display_name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? '—'}{isVendas && ' · vendas (vínculo via Closer)'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" title="Permissões específicas" onClick={() => setPermUser({ user_id: u.user_id, nome: u.display_name ?? u.email ?? '—', roles: userRoles })}>
                      <SlidersHorizontal className="w-4 h-4" />
                    </Button>
                    <div className="flex flex-wrap items-center gap-1 max-w-[340px]">
                      {ROLES.map(r => {
                        const has = userRoles.includes(r.value);
                        return (
                          <button
                            key={r.value}
                            type="button"
                            title={has ? `Remover papel ${r.label}` : `Adicionar papel ${r.label}`}
                            onClick={() => toggleRole.mutate({ user_id: u.user_id, role: r.value, has, totalRoles: userRoles.length })}
                            disabled={toggleRole.isPending}
                            className={`px-2 py-1 rounded-full text-[11px] border transition-colors ${
                              has
                                ? 'bg-primary/15 text-primary border-primary/40'
                                : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
                            }`}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                    <Select
                      value={u.squad_id ?? '__none__'}
                      onValueChange={(v) => setSquad.mutate({ user_id: u.user_id, squad_id: v === '__none__' ? null : v })}
                    >
                      <SelectTrigger className="w-[200px]"><SelectValue placeholder="Squad" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem squad</SelectItem>
                        {(squadOptions ?? []).map(s => <SelectItem key={s.id} value={s.id}>{s.nome} ({s.divisao})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {isVendas && (
                      <div className="flex items-center gap-1 px-2 rounded-md border border-border h-9">
                        <span className="text-[11px] text-muted-foreground">% qualif.</span>
                        <Input
                          type="number"
                          step="0.1"
                          defaultValue={u.pct_comissao_qualif}
                          onBlur={(e) => {
                            const pct = Number(e.target.value) || 0;
                            if (pct !== u.pct_comissao_qualif) setPctQualif.mutate({ user_id: u.user_id, pct });
                          }}
                          className="w-16 h-7 px-1 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Convidar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <Input value={invite.display_name} onChange={e => setInvite(s => ({ ...s, display_name: e.target.value }))} placeholder="Nome do usuário" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={invite.email} onChange={e => setInvite(s => ({ ...s, email: e.target.value }))} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Senha provisória (mín. 6 caracteres)</label>
              <Input type="text" value={invite.password} onChange={e => setInvite(s => ({ ...s, password: e.target.value }))} placeholder="Senha" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Papel</label>
              <Select value={invite.role} onValueChange={v => setInvite(s => ({ ...s, role: v as AppRole }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => inviteUser.mutate()} disabled={inviteUser.isPending} className="w-full gap-2">
              {inviteUser.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Criar usuário
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <Input value={editForm.display_name} onChange={e => setEditForm(s => ({ ...s, display_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={editForm.email} onChange={e => setEditForm(s => ({ ...s, email: e.target.value }))} />
            </div>
            <p className="text-xs text-muted-foreground">Nota: alterar o email aqui atualiza apenas o cadastro exibido. O email de login continua o mesmo.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending} className="gap-2">
              {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PermissoesDialog alvo={permUser} onClose={() => setPermUser(null)} />
    </div>
  );
}

// ============= Metas (Squads + Individuais) =============

interface SquadMetaRow { id: string; nome: string; divisao: Divisao; meta_mensal: number; ativo: boolean; }
interface IndividualMetaRow { user_id: string; display_name: string | null; email: string | null; meta_mes: number; role: AppRole | null; }

function MetasManagement() {
  const qc = useQueryClient();
  const [divisao, setDivisao] = useState<Divisao>('advogados');
  const today = new Date();
  const [mesRef, setMesRef] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
  );
  const [squadDrafts, setSquadDrafts] = useState<Record<string, string>>({});
  const [indivDrafts, setIndivDrafts] = useState<Record<string, string>>({});

  // Resetar drafts ao trocar mês ou divisão
  useEffect(() => { setSquadDrafts({}); setIndivDrafts({}); }, [mesRef, divisao]);

  const { data: squads, isLoading: loadingSquads } = useQuery({
    queryKey: ['metas-squads', divisao, mesRef],
    queryFn: async () => {
      const [{ data: squadsData, error }, { data: override }] = await Promise.all([
        supabase.from('squads').select('id, nome, divisao, meta_mensal, ativo').eq('divisao', divisao).order('nome'),
        supabase.from('config').select('valor').eq('divisao', divisao).eq('chave', `squad_metas:${mesRef}`).maybeSingle(),
      ]);
      if (error) throw error;
      const overrides = ((override?.valor as Record<string, number>) ?? {});
      return (squadsData ?? []).map(s => ({
        ...s,
        meta_mensal: overrides[s.id] != null ? Number(overrides[s.id]) : Number(s.meta_mensal ?? 0),
        meta_base: Number(s.meta_mensal ?? 0),
        has_override: overrides[s.id] != null,
      })) as (SquadMetaRow & { meta_base: number; has_override: boolean })[];
    },
  });

  const { data: vendedores, isLoading: loadingVend } = useQuery({
    queryKey: ['metas-individuais', divisao, mesRef],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }, { data: override }] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, email, meta_mes').order('display_name'),
        supabase.from('user_roles').select('user_id, role').in('role', ['sdr', 'closer', 'full_cycle']),
        supabase.from('config').select('valor').eq('divisao', divisao).eq('chave', `closer_metas:${mesRef}`).maybeSingle(),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const roleMap = new Map<string, AppRole>();
      (roles ?? []).forEach(r => roleMap.set(r.user_id, r.role as AppRole));
      const overrides = ((override?.valor as Record<string, number>) ?? {});
      return (profiles ?? [])
        .filter(p => roleMap.has(p.user_id))
        .map(p => {
          const base = (p as { meta_mes: number }).meta_mes ?? 0;
          const ov = overrides[p.user_id];
          return {
            user_id: p.user_id,
            display_name: p.display_name,
            email: p.email,
            meta_mes: ov != null ? Number(ov) : Number(base),
            meta_base: Number(base),
            has_override: ov != null,
            role: roleMap.get(p.user_id) ?? null,
          };
        }) as (IndividualMetaRow & { meta_base: number; has_override: boolean })[];
    },
  });

  const upsertConfigJson = async (chave: string, valor: Record<string, number>) => {
    const { data: existing } = await supabase
      .from('config')
      .select('id')
      .eq('divisao', divisao)
      .eq('chave', chave)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase.from('config').update({ valor: valor as never }).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('config').insert({ divisao, chave, valor: valor as never } as never);
      if (error) throw error;
    }
  };

  const saveSquadMeta = useMutation({
    mutationFn: async ({ id, meta }: { id: string; meta: number }) => {
      const { data: ov } = await supabase.from('config').select('valor').eq('divisao', divisao).eq('chave', `squad_metas:${mesRef}`).maybeSingle();
      const current = ((ov?.valor as Record<string, number>) ?? {});
      current[id] = meta;
      await upsertConfigJson(`squad_metas:${mesRef}`, current);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['metas-squads', divisao, mesRef] }); qc.invalidateQueries({ queryKey: ['admin-squads'] }); toast.success('Meta do squad salva para o mês!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveIndivMeta = useMutation({
    mutationFn: async ({ user_id, meta }: { user_id: string; meta: number }) => {
      const { data: ov } = await supabase.from('config').select('valor').eq('divisao', divisao).eq('chave', `closer_metas:${mesRef}`).maybeSingle();
      const current = ((ov?.valor as Record<string, number>) ?? {});
      current[user_id] = meta;
      await upsertConfigJson(`closer_metas:${mesRef}`, current);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['metas-individuais', divisao, mesRef] }); toast.success('Meta individual salva para o mês!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleLabel = (r: AppRole | null) => r === 'sdr' ? 'SDR' : r === 'closer' ? 'Closer' : r === 'full_cycle' ? 'Full Cycle' : '—';


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DivisaoSelector value={divisao} onChange={setDivisao} />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Mês de referência:</span>
          <Select value={mesRef} onValueChange={setMesRef}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {(() => {
                const opts: { value: string; label: string }[] = [];
                const base = new Date();
                base.setDate(1);
                for (let i = -2; i <= 24; i++) {
                  const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
                  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  const lbl = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                  opts.push({ value: ym, label: lbl.charAt(0).toUpperCase() + lbl.slice(1) });
                }
                if (!opts.find(o => o.value === mesRef)) {
                  const [y, m] = mesRef.split('-').map(Number);
                  const d = new Date(y, (m || 1) - 1, 1);
                  opts.unshift({ value: mesRef, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
                }
                return opts.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>);
              })()}
            </SelectContent>
          </Select>
          <Input type="month" value={mesRef} onChange={e => setMesRef(e.target.value)} className="w-40" />
        </div>
      </div>

      <DivisionMetasCard divisao={divisao} mesRef={mesRef} />

      {/* Metas mensais por squad */}
      <div className="glass-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Metas por Squad — {mesRef}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Cada mês tem sua própria meta. Sem override, é usado o valor base do squad.
          </p>
        </div>
        {loadingSquads ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !squads || squads.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum squad nesta divisão.</p>
        ) : (
          <div className="divide-y divide-border">
            {squads.map(s => {
              const draft = squadDrafts[s.id] ?? String(s.meta_mensal ?? 0);
              const dirty = Number(draft) !== Number(s.meta_mensal ?? 0);
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{s.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.has_override
                        ? <>Override no mês · base R$ {Number(s.meta_base).toLocaleString('pt-BR')}</>
                        : <>Usando meta base ({Number(s.meta_base).toLocaleString('pt-BR')})</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-32"
                      value={draft}
                      onChange={e => setSquadDrafts(d => ({ ...d, [s.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={!dirty || saveSquadMeta.isPending}
                      onClick={() => saveSquadMeta.mutate({ id: s.id, meta: Number(draft) || 0 })}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" /> Salvar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Metas individuais */}
      <div className="glass-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">Metas individuais (Closer / SDR) — {mesRef}</h3>
          <p className="text-xs text-muted-foreground mt-1">Meta de contratos no mês selecionado. Usada para o cálculo de comissão.</p>
        </div>
        {loadingVend ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !vendedores || vendedores.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum closer/SDR cadastrado.</p>
        ) : (
          <div className="divide-y divide-border">
            {vendedores.map(v => {
              const draft = indivDrafts[v.user_id] ?? String(v.meta_mes ?? 0);
              const dirty = Number(draft) !== Number(v.meta_mes ?? 0);
              return (
                <div key={v.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{v.display_name ?? v.email ?? '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {roleLabel(v.role)} · {v.email ?? '—'} · {v.has_override ? `override (base ${v.meta_base})` : `meta base ${v.meta_base}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-32"
                      value={draft}
                      onChange={e => setIndivDrafts(d => ({ ...d, [v.user_id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      disabled={!dirty || saveIndivMeta.isPending}
                      onClick={() => saveIndivMeta.mutate({ user_id: v.user_id, meta: Number(draft) || 0 })}
                      className="gap-2"
                    >
                      <Save className="w-4 h-4" /> Salvar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ============= Metas detalhadas da Divisão (contratos / faturamento / por produto) =============

interface DivisionMetasValue {
  contratos: number;
  faturamento: number;
  por_produto: Record<string, number>;
  cumulativas: boolean;
}

const DEFAULT_METAS: DivisionMetasValue = { contratos: 0, faturamento: 0, por_produto: {}, cumulativas: false };

function DivisionMetasCard({ divisao, mesRef }: { divisao: Divisao; mesRef: string }) {
  const qc = useQueryClient();
  const [metas, setMetas] = useState<DivisionMetasValue>(DEFAULT_METAS);
  const chave = `metas_mes:${mesRef}`;

  const { data, isLoading } = useQuery({
    queryKey: ['division-metas', divisao, mesRef],
    queryFn: async () => {
      const [{ data: cfgMes, error: cmErr }, { data: cfgBase, error: cbErr }, { data: prods, error: pErr }] = await Promise.all([
        supabase.from('config').select('id, valor').eq('divisao', divisao).eq('chave', chave).maybeSingle(),
        supabase.from('config').select('id, valor').eq('divisao', divisao).eq('chave', 'metas_mes').maybeSingle(),
        supabase.from('products').select('tipo').eq('divisao', divisao).eq('ativo', true),
      ]);
      if (cmErr && cmErr.code !== 'PGRST116') throw cmErr;
      if (cbErr && cbErr.code !== 'PGRST116') throw cbErr;
      if (pErr) throw pErr;
      const tipos = Array.from(new Set((prods ?? []).map(p => (p.tipo ?? '').trim()).filter(Boolean)));
      return {
        row: cfgMes as { id: string; valor: unknown } | null,
        base: (cfgBase?.valor as Partial<DivisionMetasValue>) ?? null,
        tipos,
      };
    },
  });

  useEffect(() => {
    if (!data) return;
    const v = (data.row?.valor as Partial<DivisionMetasValue>) ?? data.base ?? {};
    setMetas({
      contratos: Number(v.contratos ?? 0),
      faturamento: Number(v.faturamento ?? 0),
      por_produto: { ...(v.por_produto ?? {}) },
      cumulativas: Boolean(v.cumulativas ?? false),
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const valor = JSON.parse(JSON.stringify(metas));
      if (data?.row?.id) {
        const { error } = await supabase.from('config').update({ valor }).eq('id', data.row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('config').insert({ divisao, chave, valor } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['division-metas', divisao, mesRef] }); toast.success('Metas do mês salvas!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="glass-card p-5 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  const tipos = data?.tipos ?? [];
  const usandoBase = !data?.row && !!data?.base;

  return (
    <div className="glass-card p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-foreground">Metas da Divisão — {BRAND.divisionLabels[divisao]} · {mesRef}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Defina meta por número de contratos, por faturamento e por tipo de produto.
          {usandoBase && ' Valores atuais herdados da meta base — salve para criar override deste mês.'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Meta de contratos (qtd)</label>
          <Input type="number" value={metas.contratos} onChange={e => setMetas(m => ({ ...m, contratos: Number(e.target.value) || 0 }))} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Meta de faturamento (R$)</label>
          <Input type="number" value={metas.faturamento} onChange={e => setMetas(m => ({ ...m, faturamento: Number(e.target.value) || 0 }))} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground block">Meta por tipo de produto (qtd)</label>
        {tipos.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum tipo de produto cadastrado nesta divisão.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tipos.map(t => (
              <div key={t} className="flex items-center gap-2">
                <span className="text-sm text-foreground flex-1 truncate">{t}</span>
                <Input
                  type="number"
                  className="w-28"
                  value={metas.por_produto[t] ?? 0}
                  onChange={e => setMetas(m => ({ ...m, por_produto: { ...m.por_produto, [t]: Number(e.target.value) || 0 } }))}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary"
          checked={metas.cumulativas}
          onChange={e => setMetas(m => ({ ...m, cumulativas: e.target.checked }))}
        />
        <span className="text-sm text-foreground">Metas cumulativas</span>
        <span className="text-xs text-muted-foreground">(somam-se ao mês seguinte se não atingidas)</span>
      </label>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar metas
        </Button>
      </div>
    </div>
  );
}
