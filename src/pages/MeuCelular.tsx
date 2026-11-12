import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing, Smartphone, Share, PlusSquare, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/juridico-db';
import { useAuth } from '@/contexts/AuthContext';
import { useMinhaInscricao } from '@/hooks/useMinhaMeta';
import {
  SETORES, type SetorMeta, suportaPush, ehIOS, abertoComoApp,
  ativarNoAparelho, aparelhoAtivo, testarNoAparelho, desativarNoAparelho,
} from '@/lib/alertas';

function mascaraCelular(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function MeuCelular() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const insc = useMinhaInscricao();
  const [nome, setNome] = useState('');
  const [setor, setSetor] = useState<SetorMeta>('juridico');
  const [celular, setCelular] = useState('');
  const [hora, setHora] = useState(true);
  const [equipe, setEquipe] = useState(true);
  const [resumo, setResumo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    const i = insc.data;
    if (!i) return;
    setNome(i.nome ?? '');
    setSetor(i.setor_meta);
    setCelular(i.celular ?? '');
    setHora(i.alerta_hora);
    setEquipe(i.alerta_equipe);
    setResumo(i.resumo_dia);
  }, [insc.data]);

  useEffect(() => { aparelhoAtivo().then(setAtivo).catch(() => setAtivo(false)); }, []);

  const info = SETORES.find(s => s.valor === setor)!;
  const precisaInstalar = ehIOS() && !abertoComoApp();

  async function ativar() {
    if (celular.replace(/\D/g, '').length < 10) { toast.error('Digite o celular com DDD.'); return; }
    setSalvando(true);
    try {
      const { error } = await db.from('alertas_inscricoes').upsert({
        user_id: user!.id, nome: nome.trim() || null, setor_meta: setor, celular,
        alerta_hora: hora, alerta_equipe: equipe, resumo_dia: resumo, ativo: true,
      }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message.includes('alertas_inscricoes') ? 'O módulo de alertas ainda está sendo instalado. Tente de novo em alguns minutos.' : error.message);
      await ativarNoAparelho();
      setAtivo(true);
      qc.invalidateQueries({ queryKey: ['alertas-inscricao'] });
      toast.success('Alertas ativados! Vai, vencedor(a)!');
      testarNoAparelho().catch(() => undefined);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function desligar() {
    try {
      await desativarNoAparelho();
      setAtivo(false);
      toast.success('Alertas desligados neste celular.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-10">
      <div>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Smartphone className="w-4 h-4" /> Meu celular</p>
        <h1 className="titulo-pagina text-3xl mt-1">Receba os alertas da meta no seu celular</h1>
        <p className="text-sm text-muted-foreground mt-1">
          De hora em hora (9h às 17h) o sistema te avisa como você e a equipe estão. Vencedor(a) não perde a meta de vista.
        </p>
      </div>

      {precisaInstalar && (
        <section className="glass-card p-4 space-y-2 border border-[hsl(41_55%_62%)]/40">
          <p className="font-semibold">No iPhone, faça isto antes:</p>
          <ol className="text-sm space-y-1.5 list-decimal pl-5">
            <li className="flex-wrap">Toque em <Share className="inline w-4 h-4 mx-0.5" /> <b>Compartilhar</b> no Safari.</li>
            <li>Escolha <PlusSquare className="inline w-4 h-4 mx-0.5" /> <b>Adicionar à Tela de Início</b>.</li>
            <li>Abra o sistema pelo ícone <b>RL Advocacia</b> e volte nesta tela para ativar.</li>
          </ol>
        </section>
      )}

      <section className="glass-card p-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Seu nome</Label>
          <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Como quer ser chamado(a)" />
        </div>
        <div className="space-y-1.5">
          <Label>Setor</Label>
          <Select value={setor} onValueChange={v => setSetor(v as SetorMeta)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SETORES.map(s => <SelectItem key={s.valor} value={s.valor}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cel">Celular (WhatsApp)</Label>
          <Input id="cel" inputMode="tel" value={celular} onChange={e => setCelular(mascaraCelular(e.target.value))} placeholder="(31) 99999-9999" />
        </div>
      </section>

      <section className="rounded-2xl p-4 bg-[hsl(222_47%_15%)] text-white space-y-1">
        <p className="text-xs text-white/70 font-medium">Sua meta diária</p>
        <p className="text-2xl font-extrabold">{info.meta}</p>
        <p className="text-xs text-white/70">{info.detalhe}</p>
      </section>

      <section className="glass-card px-4 divide-y divide-border">
        <label className="flex items-center justify-between gap-3 py-3 text-sm">De hora em hora, das 9h às 17h<Switch checked={hora} onCheckedChange={setHora} /></label>
        <label className="flex items-center justify-between gap-3 py-3 text-sm">Quem da equipe está abaixo da meta<Switch checked={equipe} onCheckedChange={setEquipe} /></label>
        <label className="flex items-center justify-between gap-3 py-3 text-sm">Resumo do fim do dia (17h)<Switch checked={resumo} onCheckedChange={setResumo} /></label>
      </section>

      <Button className="w-full h-12 text-base font-bold" onClick={ativar} disabled={salvando || !suportaPush() && !precisaInstalar}>
        {salvando ? <Loader2 className="w-5 h-5 animate-spin" /> : <BellRing className="w-5 h-5" />}
        {ativo ? 'Salvar e manter alertas ligados' : 'Ativar alertas no meu celular'}
      </Button>

      {ativo && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Este celular está recebendo os alertas.</span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => testarNoAparelho().catch(e => toast.error(e.message))}>Testar</Button>
            <Button variant="ghost" size="sm" onClick={desligar}>Desligar</Button>
          </span>
        </div>
      )}
      {!suportaPush() && !precisaInstalar && (
        <p className="text-sm text-destructive">Este navegador não aceita notificações. No Android, use o Chrome.</p>
      )}
      <p className="text-xs text-muted-foreground text-center">Sem alerta no horário de almoço. Você pode desligar quando quiser.</p>
    </div>
  );
}
