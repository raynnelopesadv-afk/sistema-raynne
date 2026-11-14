// Frases que passam no topo da tela, mudando conforme o momento do dia.
// Equipe: motivação para a meta. Dra. Raynne: fé, vitória e prosperidade.

export type Momento = 'manha' | 'tarde' | 'noite';

export function momentoDoDia(d = new Date()): Momento {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'manha';
  if (h >= 12 && h < 17) return 'tarde';
  return 'noite';
}

export const FRASES_EQUIPE: Record<Momento, string[]> = {
  manha: [
    'Bom dia, vencedor(a)! Hoje é dia de bater a meta!',
    'Você consegue! Comece forte que o dia é seu.',
    'Vai, vencedor(a)! O primeiro contrato do dia já está te esperando.',
    'Café na mão, foco na meta. Bora!',
    'Quem começa cedo, fecha mais. Você consegue!',
  ],
  tarde: [
    'Vai, vencedor(a)! A tarde é de virada!',
    'Você consegue! Ainda dá tempo de bater a meta hoje.',
    'Mantém o ritmo, vencedor(a). Cada protocolo conta!',
    'Bora pra meta! Mais um cliente atendido, mais uma vitória.',
    'Foco total: você está mais perto do que imagina!',
  ],
  noite: [
    'Fecha o dia com chave de ouro, vencedor(a)!',
    'Você consegue! Termine o que começou.',
    'Orgulho do seu esforço hoje. Amanhã tem mais vitória!',
    'Vai, vencedor(a)! Confira suas tarefas antes de sair.',
    'Quem persiste vence. Você é vencedor(a)!',
  ],
};

export const FRASES_RAYNNE: Record<Momento, string[]> = {
  manha: [
    'Bom dia, Dra. Raynne! Você é abençoada.',
    'Deus é contigo! Hoje vai ter vitória.',
    'Você viverá o extraordinário.',
    'Seu escritório é milionário!',
    'Comece o dia em paz: o que é seu está guardado.',
  ],
  tarde: [
    'Vai ter vitória, Dra. Raynne!',
    'Você é abençoada, e tudo o que tocar vai prosperar.',
    'Deus é contigo em cada decisão de hoje.',
    'Seu escritório é milionário!',
    'Você viverá o extraordinário.',
  ],
  noite: [
    'Dia vencido, Dra. Raynne. Deus é contigo!',
    'Você é abençoada. Descanse: a vitória já é sua.',
    'Você viverá o extraordinário.',
    'Seu escritório é milionário!',
    'Gratidão por mais um dia de conquistas.',
  ],
};

export function ehRaynne(email?: string | null): boolean {
  return /^raynne/i.test(email ?? '');
}

export function frasesPara(email: string | null | undefined, d = new Date()): string[] {
  const lista = ehRaynne(email) ? FRASES_RAYNNE : FRASES_EQUIPE;
  return lista[momentoDoDia(d)];
}
