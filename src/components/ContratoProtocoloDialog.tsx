import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, ScrollText, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export interface ContratoProtocolo {
  id: string;
  nome_cliente: string;
  data_protocolo: string | null;
  protocolado: boolean;
  teve_exito: boolean | null;
  valor_exito: number;
  data_recebimento: string | null;
  valor_honorarios_recebidos: number;
  status_qualificacao: string;
}

interface Props {
  contrato: ContratoProtocolo | null;
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  divisao: string;
}

type ExitoOpt = 'sim' | 'nao' | 'aberto';

export function ContratoProtocoloDialog({ contrato, open, onClose, canEdit, divisao }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    data_protocolo: '',
    protocolado: false,
    teve_exito: 'aberto' as ExitoOpt,
    valor_exito: '',
    data_recebimento: '',
    valor_honorarios_recebidos: '',
  });

  useEffect(() => {
    if (!contrato) return;
    setForm({
      data_protocolo: contrato.data_protocolo ?? '',
      protocolado: !!contrato.protocolado,
      teve_exito:
        contrato.teve_exito === true ? 'sim' : contrato.teve_exito === false ? 'nao' : 'aberto',
      valor_exito: String(contrato.valor_exito ?? 0),
      data_recebimento: contrato.data_recebimento ?? '',
      valor_honorarios_recebidos: String(contrato.valor_honorarios_recebidos ?? 0),
    });
  }, [contrato]);

  const save = useMutation({
    mutationFn: async () => {
      if (!contrato) return;
      const teve_exito =
        form.teve_exito === 'sim' ? true : form.teve_exito === 'nao' ? false : null;
      const payload = {
        data_protocolo: form.data_protocolo || null,
        protocolado: form.protocolado,
        teve_exito,
        valor_exito: teve_exito === true ? Number(form.valor_exito) || 0 : 0,
        data_recebimento: form.data_recebimento || null,
        valor_honorarios_recebidos: Number(form.valor_honorarios_recebidos) || 0,
      };
      const { error } = await supabase
        .from('clientes_fechados')
        .update(payload)
        .eq('id', contrato.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes', divisao] });
      qc.invalidateQueries({ queryKey: ['protocolo-stats'] });
      qc.invalidateQueries({ queryKey: ['comissao-qualificacao'] });
      toast.success('Protocolo atualizado!');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!contrato) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-primary" />
            {contrato.nome_cliente}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Status atual: <span className="text-foreground font-medium">{contrato.status_qualificacao}</span>
          </p>
        </DialogHeader>

        <Tabs defaultValue="protocolo" className="w-full">
          <TabsList>
            <TabsTrigger value="protocolo">Protocolo</TabsTrigger>
            <TabsTrigger value="exito">Êxito</TabsTrigger>
          </TabsList>

          <TabsContent value="protocolo" className="mt-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Data do Protocolo</Label>
              <Input
                type="date"
                disabled={!canEdit}
                value={form.data_protocolo}
                onChange={(e) => setForm((f) => ({ ...f, data_protocolo: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Protocolado</p>
                <p className="text-[11px] text-muted-foreground">
                  Ao marcar com data preenchida, o status muda para <strong>qualificado</strong>.
                </p>
              </div>
              <Switch
                disabled={!canEdit}
                checked={form.protocolado}
                onCheckedChange={(v) => setForm((f) => ({ ...f, protocolado: v }))}
              />
            </div>
            {form.protocolado && !form.data_protocolo && (
              <p className="text-xs text-warning">Preencha a data do protocolo para qualificar.</p>
            )}
          </TabsContent>

          <TabsContent value="exito" className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Resultado do processo</span>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Teve êxito?</Label>
              <Select
                value={form.teve_exito}
                onValueChange={(v) => setForm((f) => ({ ...f, teve_exito: v as ExitoOpt }))}
                disabled={!canEdit}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aberto">Em aberto</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Valor do Êxito (R$)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={!canEdit || form.teve_exito !== 'sim'}
                value={form.valor_exito}
                onChange={(e) => setForm((f) => ({ ...f, valor_exito: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Data de Recebimento dos Honorários</Label>
              <Input
                type="date"
                disabled={!canEdit}
                value={form.data_recebimento}
                onChange={(e) => setForm((f) => ({ ...f, data_recebimento: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Valor Efetivamente Recebido (R$)</Label>
              <Input
                type="number"
                step="0.01"
                disabled={!canEdit}
                value={form.valor_honorarios_recebidos}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valor_honorarios_recebidos: e.target.value }))
                }
              />
            </div>
          </TabsContent>
        </Tabs>

        {canEdit && (
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-muted-foreground pt-3 border-t border-border">
            Apenas operador técnico ou gestor pode editar estes campos.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
