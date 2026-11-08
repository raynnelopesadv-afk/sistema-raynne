import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollText, User, Phone, IdCard, Package, CalendarDays, DollarSign, Loader2, History } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { getEffectiveStatus, STATUS_LABEL, type EffectiveStatus } from '@/lib/contrato-status';
import { maskCPF } from '@/lib/cliente-search';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ClienteFechado {
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
  teve_exito: boolean | null;
  data_protocolo?: string | null;
  divisao: 'advogados' | 'educacao';
  cadastro_retroativo?: boolean | null;
  cadastrado_por_usuario_id?: string | null;
  data_cadastro_retroativo?: string | null;
  observacoes_retroativas?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contrato: ClienteFechado | null;
  closerNome: string;
  productNome: string;
  canMarcarProtocolado: boolean;
  onChanged?: () => void;
}

function fmtCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—';
  const d = s.length <= 10 ? new Date(s + 'T12:00:00') : new Date(s);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function FechamentoDetailSheet({ open, onClose, contrato, closerNome, productNome, canMarcarProtocolado, onChanged }: Props) {
  const qc = useQueryClient();
  const eff: EffectiveStatus | null = contrato ? getEffectiveStatus(contrato) : null;
  const isRetro = !!contrato?.cadastro_retroativo;

  const { data: registrante } = useQuery({
    queryKey: ['profile-name', contrato?.cadastrado_por_usuario_id],
    enabled: !!(isRetro && contrato?.cadastrado_por_usuario_id),
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('user_id', contrato!.cadastrado_por_usuario_id!)
        .maybeSingle();
      return data?.display_name || data?.email || 'Usuário';
    },
  });

  const protocolar = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase
        .from('clientes_fechados')
        .update({ protocolado: true, data_protocolo: today, status_qualificacao: 'qualificado' })
        .eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Marcado como protocolado');
      qc.invalidateQueries({ queryKey: ['fechamento'] });
      qc.invalidateQueries({ queryKey: ['processos-contratos'] });
      onChanged?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="bg-card border-border w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">Detalhes do Fechamento</SheetTitle>
        </SheetHeader>
        {contrato && eff && (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl bg-secondary/30 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="text-base font-semibold text-foreground">{contrato.nome_cliente}</p>
                </div>
                <StatusBadge contrato={contrato} size="md" />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field icon={IdCard} label="CPF" value={contrato.cpf ? maskCPF(contrato.cpf) : '—'} mono />
                <Field icon={Phone} label="Telefone" value={contrato.telefone ?? '—'} />
                <Field icon={User} label="Closer" value={closerNome} />
                <Field icon={Package} label="Produto" value={productNome} />
                <Field icon={DollarSign} label="Valor" value={fmtCurrency(Number(contrato.valor) || 0)} accent />
                <Field icon={CalendarDays} label="Fechado em" value={fmtDateTime(contrato.fechado_em ?? contrato.data_fechamento)} />
              </div>
            </div>

            {isRetro && (
              <div className="rounded-2xl border border-border/40 bg-secondary/40 p-4 space-y-2">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  <History className="w-3.5 h-3.5" />
                  Cadastro retroativo
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Field icon={User} label="Registrado por" value={registrante ?? '—'} />
                  <Field icon={CalendarDays} label="Registrado em" value={fmtDateTime(contrato.data_cadastro_retroativo)} />
                </div>
                {contrato.observacoes_retroativas && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Observações</p>
                    <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{contrato.observacoes_retroativas}</p>
                  </div>
                )}
              </div>
            )}


            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Linha do tempo</h4>
              <ol className="relative pl-4 border-l border-border space-y-3 text-xs">
                <Step active title="Pendente" color="#F59E0B" date={fmtDateTime(contrato.fechado_em ?? contrato.data_fechamento)} />
                {(eff === 'qualificado' || eff === 'exito' || eff === 'sem_exito') && (
                  <Step active title="Qualificado" color="#00BCD4" date={contrato.data_protocolo ? fmtDateTime(contrato.data_protocolo) : '—'} />
                )}
                {eff === 'desqualificado' && (
                  <Step active title="Desqualificado" color="#EF4444" />
                )}
                {eff === 'exito' && <Step active title="Êxito" color="#22C55E" />}
                {eff === 'sem_exito' && <Step active title="Sem êxito" color="#6B7280" />}
              </ol>
              <p className="text-[10px] text-muted-foreground/70 italic mt-3">Status atual: {STATUS_LABEL[eff]}</p>
            </div>

            {canMarcarProtocolado && eff === 'pendente' && (
              <Button
                onClick={() => protocolar.mutate()}
                disabled={protocolar.isPending}
                className="w-full gap-2"
              >
                {protocolar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScrollText className="w-4 h-4" />}
                Marcar como protocolado
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ icon: Icon, label, value, mono, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <p className={`mt-0.5 text-foreground ${mono ? 'font-mono' : 'font-medium'} ${accent ? 'text-primary font-semibold' : ''}`}>{value}</p>
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
