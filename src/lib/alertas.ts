// Alertas de meta no celular (lado do navegador).
// As regras das mensagens ficam em scripts/lib/alertas.mjs (robô de hora em hora).
import { db } from '@/lib/juridico-db';

export type SetorMeta = 'comercial' | 'lider' | 'juridico' | 'prazos' | 'gestao';

export const SETORES: { valor: SetorMeta; label: string; meta: string; detalhe: string }[] = [
  { valor: 'juridico', label: 'Jurídico (protocolos)', meta: '4 a 5 protocolos por dia', detalhe: 'Ações judiciais + requerimentos administrativos' },
  { valor: 'prazos', label: 'Prazos', meta: 'Todos os prazos do dia', detalhe: 'Nenhum prazo fica para trás' },
  { valor: 'comercial', label: 'Comercial', meta: '3 contratos fechados por dia', detalhe: 'Cada um da equipe comercial' },
  { valor: 'lider', label: 'Líder do comercial', meta: '3 contratos fechados por dia', detalhe: 'A líder também fecha os seus 3' },
  { valor: 'gestao', label: 'Gestão (só acompanhar)', meta: 'Acompanha a equipe toda', detalhe: 'Recebe quem está abaixo da meta em todos os setores' },
];

export const META_NUM: Record<SetorMeta, number> = { comercial: 3, lider: 3, juridico: 4, prazos: 0, gestao: 0 };

export interface Inscricao {
  user_id: string;
  nome: string | null;
  setor_meta: SetorMeta;
  celular: string | null;
  alerta_hora: boolean;
  alerta_equipe: boolean;
  resumo_dia: boolean;
  ativo: boolean;
}

export function suportaPush(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function ehIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function abertoComoApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function base64ParaBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function nomeAparelho(): string {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return 'iPhone';
  if (/ipad/i.test(ua)) return 'iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Computador (Windows)';
  if (/mac/i.test(ua)) return 'Computador (Mac)';
  return 'Navegador';
}

/** Pede permissão, registra o celular e grava no banco. */
export async function ativarNoAparelho(): Promise<void> {
  if (!suportaPush()) throw new Error(ehIOS()
    ? 'No iPhone, primeiro adicione o sistema à Tela de Início e abra pelo ícone.'
    : 'Este navegador não aceita notificações. Use o Chrome no celular.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('As notificações foram bloqueadas. Libere nas configurações do celular e tente de novo.');
  const { data: chave, error } = await db.rpc('alertas_vapid_publica');
  if (error) throw new Error('O módulo de alertas ainda está sendo instalado. Tente de novo em alguns minutos.');
  if (!chave) throw new Error('O sistema ainda está preparando os alertas. Tente de novo em alguns minutos.');
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const novaInscricao = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave as string) });
  let sub = await reg.pushManager.getSubscription();
  if (sub && !(await ehDesteUsuario(sub.endpoint))) {
    // Este aparelho estava ligado a OUTRA pessoa (ex.: a Dra. Raynne entrou antes neste celular/computador).
    // Troca a inscrição para que ela pare de chegar aqui e só cheguem os alertas de quem está logado agora.
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) sub = await novaInscricao();
  let j = sub.toJSON();
  let { error: e2 } = await db.from('alertas_dispositivos').upsert({
    endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, aparelho: nomeAparelho(), falhas: 0,
  }, { onConflict: 'endpoint' });
  if (e2) {
    // endereço ainda preso a outro usuário: gera um novo e tenta de novo
    await sub.unsubscribe().catch(() => undefined);
    sub = await novaInscricao();
    j = sub.toJSON();
    ({ error: e2 } = await db.from('alertas_dispositivos').insert({
      endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth, aparelho: nomeAparelho(), falhas: 0,
    }));
  }
  if (e2) throw new Error(e2.message);
}

/** O aparelho está cadastrado no nome de quem está logado? (cada um só enxerga os próprios aparelhos) */
async function ehDesteUsuario(endpoint: string): Promise<boolean> {
  const { data } = await db.from('alertas_dispositivos').select('id').eq('endpoint', endpoint).maybeSingle();
  return !!data;
}

/** Este aparelho já está recebendo? */
export async function aparelhoAtivo(): Promise<boolean> {
  if (!suportaPush() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  return !!sub && (await ehDesteUsuario(sub.endpoint));
}

/** Notificação de teste, direto no aparelho. */
export async function testarNoAparelho(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) throw new Error('Ative os alertas primeiro.');
  await reg.showNotification('Vai, vencedor(a)!', {
    body: 'Assim chegam os seus alertas da meta. Bora pra meta!',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: 'teste',
  });
}

/** Ao sair do sistema: este aparelho para de receber os alertas de quem saiu
 *  (assim, se outra pessoa entrar no mesmo celular/computador, não recebe as mensagens da anterior). */
export async function soltarAparelhoAoSair(): Promise<void> {
  try {
    if (!suportaPush()) return;
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await db.from('alertas_dispositivos').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch { /* sair nunca pode travar */ }
}

/** Desliga os alertas neste aparelho. */
export async function desativarNoAparelho(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await db.from('alertas_dispositivos').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
