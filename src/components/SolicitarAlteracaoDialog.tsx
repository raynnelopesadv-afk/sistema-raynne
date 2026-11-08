import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LABEL_CAMPO_DATA } from '@/lib/travas';

interface Props {
  open: boolean;
  onClose: () => void;
  contratoId: string;
  nomeCliente: string;
  /** campos travados disponíveis para solicitar, com o valor atual */
  camposTravados: Array<{ campo: string; valorAtual: string | null }>;
}

/** Pedido de alteração de data travada — vai para a fila do gestor. */
export function SolicitarAlteracaoDialog({ open, onClose, contratoId, nomeCliente, camposTravados }: Props) {
  const { user } = useAuth();
  const [campo, setCampo] = useState('');
  const [novaData, setNovaData] = useState('');
  const [motivo, setMotivo] = useState('');

  const enviar = useMutation({
    mutationFn: async () => {
      if (!campo) throw new Error('Selecione qual data deseja alterar');
      if (!novaData) throw new Error('Informe a nova data');
      if (motivo.trim().length < 10) throw new Error('Descreva o motivo (mínimo 10 caracteres)');
      const atual = camposTravados.find(c => c.campo === campo)?.valorAtual ?? null;
      const { error } = await supabase.from('solicitacoes_alteracao').insert({
        tipo: 'alterar_data',
        contrato_id: contratoId,
        solicitante: user!.id,
        motivo: motivo.trim(),
        payload: { campo, valor_atual: atual, valor_novo: novaData, nome_cliente: nomeCliente },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Solicitação enviada ao gestor');
      setCampo(''); setNovaData(''); setMotivo('');
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle>Solicitar alteração — {nomeCliente}</DialogTitle></DialogHeader>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Esta data pertence a um mês já comissionado e só pode ser alterada com aprovação do gestor.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Data a alterar</label>
            <Select value={campo} onValueChange={setCampo}>
              <SelectTrigger><SelectValue placeholder="Selecione o campo" /></SelectTrigger>
              <SelectContent>
                {camposTravados.map(c => (
                  <SelectItem key={c.campo} value={c.campo}>
                    {LABEL_CAMPO_DATA[c.campo] ?? c.campo} (atual: {c.valorAtual ? new Date(c.valorAtual + 'T12:00:00').toLocaleDateString('pt-BR') : '—'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nova data</label>
            <Input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Motivo (obrigatório)</label>
            <Textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Explique por que a data precisa ser corrigida..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => enviar.mutate()} disabled={enviar.isPending} className="gap-2">
            {enviar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
