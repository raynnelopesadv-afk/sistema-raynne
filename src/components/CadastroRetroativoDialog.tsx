import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { maskCPF } from '@/lib/cliente-search';

type Divisao = 'advogados' | 'educacao';
type RetroStatus = 'pendente' | 'qualificado' | 'exito' | 'sem_exito' | 'desqualificado';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  divisao: Divisao;
  onSaved?: () => void;
}

interface CloserOpt {
  id: string;
  nome: string;
  status: 'ativo' | 'desligado' | 'externo';
  divisao: Divisao | null;
}

export function CadastroRetroativoDialog({ open, onOpenChange, divisao: divisaoInicial, onSaved }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  // form state
  const [divisao, setDivisao] = useState<Divisao>(divisaoInicial);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [productId, setProductId] = useState('');
  const [tipo, setTipo] = useState<'judicial' | 'administrativo'>('judicial');
  const [valor, setValor] = useState('');
  const [dataFechamento, setDataFechamento] = useState('');

  const [closerMode, setCloserMode] = useState<'ativo' | 'desligado' | 'externo'>('ativo');
  const [closerId, setCloserId] = useState('');
  const [addingDesligado, setAddingDesligado] = useState(false);
  const [novoDesligadoNome, setNovoDesligadoNome] = useState('');
  const [novoDesligadoData, setNovoDesligadoData] = useState('');

  const [status, setStatus] = useState<RetroStatus>('pendente');
  const [dataProtocolo, setDataProtocolo] = useState('');
  const [numProtocolo, setNumProtocolo] = useState('');
  const [obsProtocolo, setObsProtocolo] = useState('');
  const [valorExito, setValorExito] = useState('');
  const [dataRecebimento, setDataRecebimento] = useState('');
  const [valorRecebido, setValorRecebido] = useState('');
  const [motivoEncerramento, setMotivoEncerramento] = useState('');
  const [dataEncerramento, setDataEncerramento] = useState('');
  const [motivoDesq, setMotivoDesq] = useState('');
  const [dataDesq, setDataDesq] = useState('');

  const [observacoesRetro, setObservacoesRetro] = useState('');
  const [considerarComissao, setConsiderarComissao] = useState(false);

  function resetForm() {
    setNome(''); setCpf(''); setTelefone(''); setProductId(''); setTipo('judicial');
    setValor(''); setDataFechamento(''); setCloserMode('ativo'); setCloserId('');
    setAddingDesligado(false); setNovoDesligadoNome(''); setNovoDesligadoData('');
    setStatus('pendente'); setDataProtocolo(''); setNumProtocolo(''); setObsProtocolo('');
    setValorExito(''); setDataRecebimento(''); setValorRecebido('');
    setMotivoEncerramento(''); setDataEncerramento(''); setMotivoDesq(''); setDataDesq('');
    setObservacoesRetro(''); setConsiderarComissao(false);
  }

  // products
  const { data: products } = useQuery({
    queryKey: ['products-retro', divisao],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, nome, ticket_medio, valor').eq('divisao', divisao).eq('ativo', true).order('nome');
      return data ?? [];
    },
  });

  function handleProductChange(id: string) {
    setProductId(id);
    const p = (products ?? []).find(x => x.id === id) as { ticket_medio?: number; valor?: number } | undefined;
    // Valor do contrato deve refletir o valor cadastrado no produto (products.valor).
    // O ticket_medio é métrica histórica e não deve sobrescrever o valor padrão.
    const ticket = Number(p?.valor) || Number(p?.ticket_medio) || 0;
    if (ticket > 0) setValor(String(ticket));
  }

  // all closers (ativos + desligados)
  const { data: closers } = useQuery({
    queryKey: ['closers-retro'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closers')
        .select('id, nome, status, divisao, ativo')
        .order('nome');
      if (error) throw error;
      return (data ?? []).map((c): CloserOpt => ({
        id: c.id,
        nome: c.nome,
        status: ((c as { status?: string }).status as 'ativo' | 'desligado' | 'externo') ?? (c.ativo ? 'ativo' : 'desligado'),
        divisao: c.divisao as Divisao | null,
      }));
    },
  });

  const closersAtivos = useMemo(
    () => (closers ?? []).filter(c => c.status === 'ativo' && (!c.divisao || c.divisao === divisao)),
    [closers, divisao]
  );
  const closersDesligados = useMemo(
    () => (closers ?? []).filter(c => c.status === 'desligado'),
    [closers]
  );

  // duplicate warning
  const { data: duplicate } = useQuery({
    queryKey: ['retro-dup', cpf, productId, dataFechamento],
    enabled: open && !!cpf && cpf.replace(/\D/g, '').length === 11 && !!productId && !!dataFechamento,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes_fechados')
        .select('id, nome_cliente')
        .eq('cpf', cpf)
        .eq('product_id', productId)
        .eq('data_fechamento', dataFechamento)
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  const addDesligado = useMutation({
    mutationFn: async () => {
      if (!novoDesligadoNome.trim()) throw new Error('Informe o nome do colaborador');
      const { data, error } = await supabase
        .from('closers')
        .insert({
          nome: novoDesligadoNome.trim(),
          divisao,
          ativo: false,
          status: 'desligado',
          data_desligamento: novoDesligadoData || null,
          funcao: 'closer',
        })
        .select('id, nome, status, divisao, ativo')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (novo) => {
      qc.invalidateQueries({ queryKey: ['closers-retro'] });
      qc.invalidateQueries({ queryKey: ['vendedores-all'] });
      qc.invalidateQueries({ queryKey: ['colaboradores'] });
      setCloserId(novo.id);
      setAddingDesligado(false);
      setNovoDesligadoNome('');
      setNovoDesligadoData('');
      toast.success(`Colaborador desligado "${novo.nome}" adicionado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      // validations
      if (!nome.trim()) throw new Error('Informe o nome do cliente');
      if (!productId) throw new Error('Selecione o produto');
      const valorN = Number(valor);
      if (!valorN || valorN <= 0) throw new Error('Informe um valor de contrato válido');
      if (!dataFechamento) throw new Error('Informe a data do fechamento');
      if (dataFechamento > new Date().toISOString().slice(0, 10)) throw new Error('Data do fechamento não pode ser futura');
      if (closerMode === 'ativo' && !closerId) throw new Error('Selecione o closer responsável');
      if (closerMode === 'desligado' && !closerId) throw new Error('Selecione o colaborador desligado');

      if (status === 'qualificado' || status === 'exito' || status === 'sem_exito') {
        if (!dataProtocolo) throw new Error('Informe a data do protocolo');
        if (dataProtocolo < dataFechamento) throw new Error('Protocolo deve ser igual ou posterior ao fechamento');
      }
      if (status === 'exito') {
        if (!Number(valorExito)) throw new Error('Informe o valor do êxito');
        if (!dataRecebimento) throw new Error('Informe a data de recebimento');
        if (!Number(valorRecebido)) throw new Error('Informe o valor efetivamente recebido');
        if (dataRecebimento < dataProtocolo) throw new Error('Recebimento deve ser igual ou posterior ao protocolo');
      }
      if (status === 'desqualificado' && !motivoDesq.trim()) {
        throw new Error('Informe o motivo da desqualificação');
      }
      if (cpf && cpf.replace(/\D/g, '').length > 0 && cpf.replace(/\D/g, '').length !== 11) {
        // warn only — não bloqueia
      }

      const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : null;

      // map status → status_qualificacao / protocolado / teve_exito
      let status_qualificacao: 'pendente' | 'qualificado' | 'desqualificado' = 'pendente';
      let protocolado = false;
      let teve_exito: boolean | null = null;

      if (status === 'pendente') {
        status_qualificacao = 'pendente';
      } else if (status === 'qualificado') {
        status_qualificacao = 'qualificado';
        protocolado = true;
      } else if (status === 'exito') {
        status_qualificacao = 'qualificado';
        protocolado = true;
        teve_exito = true;
      } else if (status === 'sem_exito') {
        status_qualificacao = 'qualificado';
        protocolado = true;
        teve_exito = false;
      } else if (status === 'desqualificado') {
        status_qualificacao = 'desqualificado';
      }

      const fechadoEmIso = new Date(dataFechamento + 'T12:00:00').toISOString();

      const payload: Record<string, unknown> = {
        nome_cliente: nome.trim(),
        cpf: cpfLimpo || null,
        telefone: telefone.trim() || null,
        product_id: productId,
        tipo_processo: tipo,
        valor: valorN,
        data_fechamento: dataFechamento,
        fechado_em: fechadoEmIso,
        divisao,
        closer_id: closerMode === 'externo' ? null : closerId,
        status_qualificacao,
        protocolado,
        teve_exito,
        data_protocolo: protocolado ? dataProtocolo : null,
        numero_protocolo: protocolado ? (numProtocolo || null) : null,
        observacoes_protocolo: protocolado ? (obsProtocolo || null) : null,
        valor_exito: status === 'exito' ? Number(valorExito) : 0,
        data_recebimento: status === 'exito' ? dataRecebimento : null,
        valor_honorarios_recebidos: status === 'exito' ? Number(valorRecebido) : 0,
        motivo_encerramento: status === 'sem_exito' ? (motivoEncerramento || null) : null,
        data_encerramento: status === 'sem_exito' ? (dataEncerramento || null) : null,
        motivo_desqualificacao: status === 'desqualificado' ? motivoDesq : null,
        data_desqualificacao: status === 'desqualificado' ? (dataDesq || null) : null,
        cadastro_retroativo: true,
        cadastrado_por_usuario_id: user?.id ?? null,
        data_cadastro_retroativo: new Date().toISOString(),
        observacoes_retroativas: observacoesRetro.trim() || null,
        considerar_comissao_retroativa: considerarComissao && closerMode === 'ativo',
      };

      const { error } = await supabase.from('clientes_fechados').insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cadastro retroativo registrado ✓');
      qc.invalidateQueries({ queryKey: ['fechamento', divisao] });
      qc.invalidateQueries({ queryKey: ['processos-contratos', divisao] });
      qc.invalidateQueries({ queryKey: ['clientes', divisao] });
      qc.invalidateQueries({ queryKey: ['protocolo-stats'] });
      onSaved?.();
      resetForm();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#F5C518]">
            <History className="w-5 h-5" /> Cadastro Retroativo de Contrato
          </DialogTitle>
          <DialogDescription>
            Registre um contrato fechado antes do BI existir ou por colaborador desligado. Entra normalmente nas estatísticas históricas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Seção 1: Cliente */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Dados do cliente</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label>Nome do cliente *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={maskCPF(cpf)} onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="000.000.000-00" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
              </div>
            </div>
            {duplicate && (
              <div className="flex items-start gap-2 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 p-2 text-xs text-[#F59E0B]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Já existe um contrato com este CPF e produto na mesma data ({duplicate.nome_cliente}). Verifique se não é duplicidade.</p>
              </div>
            )}
          </section>

          {/* Seção 2: Contrato */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Dados do contrato</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Produto *</Label>
                <Select value={productId} onValueChange={handleProductChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {(products ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor do contrato (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
                <p className="text-[10px] text-muted-foreground mt-1">Preenchido automaticamente pelo ticket do produto. Edite se necessário.</p>
              </div>
              <div>
                <Label>Tipo *</Label>
                <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as 'judicial' | 'administrativo')} className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="judicial" /> Judicial
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="administrativo" /> Administrativo
                  </label>
                </RadioGroup>
              </div>
              <div>
                <Label>Divisão *</Label>
                <RadioGroup value={divisao} onValueChange={(v) => setDivisao(v as Divisao)} className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="advogados" /> Advogados
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <RadioGroupItem value="educacao" /> Educação
                  </label>
                </RadioGroup>
              </div>
              <div className="sm:col-span-2">
                <Label>Data do fechamento *</Label>
                <Input type="date" max={new Date().toISOString().slice(0, 10)} value={dataFechamento} onChange={(e) => setDataFechamento(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Seção 3: Colaborador */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">3. Colaborador responsável</h3>
            <RadioGroup value={closerMode} onValueChange={(v) => { setCloserMode(v as 'ativo' | 'desligado' | 'externo'); setCloserId(''); }} className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="ativo" /> Colaborador ativo
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="desligado" /> Colaborador desligado
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="externo" /> Externo / não identificado
              </label>
            </RadioGroup>

            {closerMode === 'ativo' && (
              <Select value={closerId} onValueChange={setCloserId}>
                <SelectTrigger><SelectValue placeholder="Selecione o closer" /></SelectTrigger>
                <SelectContent>
                  {closersAtivos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {closerMode === 'desligado' && (
              <div className="space-y-2">
                <Select value={closerId} onValueChange={setCloserId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o colaborador desligado" /></SelectTrigger>
                  <SelectContent>
                    {closersDesligados.length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground">Nenhum cadastrado</div>
                    )}
                    {closersDesligados.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} <span className="ml-2 text-[10px] text-muted-foreground">Desligado</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!addingDesligado ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setAddingDesligado(true)}>
                    <Plus className="w-3 h-3" /> Cadastrar colaborador desligado
                  </Button>
                ) : (
                  <div className="rounded-lg border border-[#1F2937] p-3 space-y-2">
                    <div>
                      <Label className="text-xs">Nome do colaborador *</Label>
                      <Input value={novoDesligadoNome} onChange={(e) => setNovoDesligadoNome(e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Data de desligamento</Label>
                      <Input type="date" value={novoDesligadoData} onChange={(e) => setNovoDesligadoData(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => addDesligado.mutate()} disabled={addDesligado.isPending}>
                        {addDesligado.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => { setAddingDesligado(false); setNovoDesligadoNome(''); setNovoDesligadoData(''); }}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {closerMode === 'externo' && (
              <p className="text-xs text-muted-foreground">Contrato será registrado sem closer específico (— sem closer —).</p>
            )}
          </section>

          {/* Seção 4: Status */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">4. Status inicial</h3>
            <RadioGroup value={status} onValueChange={(v) => setStatus(v as RetroStatus)} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                { v: 'pendente', l: 'Pendente' },
                { v: 'qualificado', l: 'Qualificado' },
                { v: 'exito', l: 'Êxito' },
                { v: 'sem_exito', l: 'Sem Êxito' },
                { v: 'desqualificado', l: 'Desqualificado' },
              ] as const).map(o => (
                <label key={o.v} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border border-[#1F2937] px-3 py-2 hover:bg-white/[0.02]">
                  <RadioGroupItem value={o.v} /> {o.l}
                </label>
              ))}
            </RadioGroup>
          </section>

          {/* Seção 5: Condicionais */}
          {(status === 'qualificado' || status === 'exito' || status === 'sem_exito') && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">5. Dados do protocolo</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Data do protocolo *</Label>
                  <Input type="date" value={dataProtocolo} onChange={(e) => setDataProtocolo(e.target.value)} />
                </div>
                <div>
                  <Label>Número do protocolo</Label>
                  <Input value={numProtocolo} onChange={(e) => setNumProtocolo(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Observações do protocolo</Label>
                  <Textarea rows={2} value={obsProtocolo} onChange={(e) => setObsProtocolo(e.target.value)} />
                </div>
              </div>
            </section>
          )}

          {status === 'exito' && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#22C55E]">Dados do êxito</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Valor do êxito (R$) *</Label>
                  <Input type="number" step="0.01" value={valorExito} onChange={(e) => setValorExito(e.target.value)} />
                </div>
                <div>
                  <Label>Data recebimento *</Label>
                  <Input type="date" value={dataRecebimento} onChange={(e) => setDataRecebimento(e.target.value)} />
                </div>
                <div>
                  <Label>Valor recebido (R$) *</Label>
                  <Input type="number" step="0.01" value={valorRecebido} onChange={(e) => setValorRecebido(e.target.value)} />
                </div>
              </div>
            </section>
          )}

          {status === 'sem_exito' && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Encerramento sem êxito</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Motivo do encerramento</Label>
                  <Textarea rows={2} value={motivoEncerramento} onChange={(e) => setMotivoEncerramento(e.target.value)} />
                </div>
                <div>
                  <Label>Data do encerramento</Label>
                  <Input type="date" value={dataEncerramento} onChange={(e) => setDataEncerramento(e.target.value)} />
                </div>
              </div>
            </section>
          )}

          {status === 'desqualificado' && (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-destructive">Desqualificação</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Motivo da desqualificação *</Label>
                  <Textarea rows={2} value={motivoDesq} onChange={(e) => setMotivoDesq(e.target.value)} />
                </div>
                <div>
                  <Label>Data da desqualificação</Label>
                  <Input type="date" value={dataDesq} onChange={(e) => setDataDesq(e.target.value)} />
                </div>
              </div>
            </section>
          )}

          {/* Seção 6: Retroativo */}
          <section className="space-y-3 rounded-xl border border-[#F5C518]/30 bg-[#F5C518]/5 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F5C518] flex items-center gap-2">
              <History className="w-3 h-3" /> 6. Identificação retroativa
            </h3>
            <p className="text-xs text-muted-foreground">
              Este cadastro será marcado como retroativo automaticamente. Registramos quem cadastrou e quando.
            </p>
            <div>
              <Label>Observações do cadastro retroativo</Label>
              <Textarea rows={2} value={observacoesRetro} onChange={(e) => setObservacoesRetro(e.target.value)} placeholder="Contexto histórico (opcional)" />
            </div>
            {closerMode === 'ativo' && (
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={considerarComissao}
                  onChange={(e) => setConsiderarComissao(e.target.checked)}
                  className="accent-[#F5C518]"
                />
                Considerar este contrato para comissionamento do closer ativo
              </label>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-[#F5C518] text-black hover:bg-[#F5C518]/90">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar cadastro retroativo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
