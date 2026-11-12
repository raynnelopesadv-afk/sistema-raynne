// Plano diário do operacional (9h–17h, intervalo 12h–14h).
// Usado pela tela (Protocolos → Operacional → Plano do dia) e pelo robô que cria as tarefas às 8h50.

export const EXPEDIENTE = { inicio: '09:00', intervaloDe: '12:00', intervaloAte: '14:00', fim: '17:00' };

/** login (parte depois do +) → blocos do dia. setor = nome do setor nas Tarefas. */
export const PLANO_DIA = {
  juridico01: {
    nome: 'Jurídico 01', papel: 'Ações judiciais e requerimentos administrativos', setor: 'Protocolo',
    blocos: [
      { hora: '09:00', ate: '10:00', titulo: 'Cobrança rápida (no máximo 1 hora)', detalhe: 'Igual o comercial: 1) ver no WhatsApp quem já foi cobrado e mandou documento; 2) mandar a mensagem para os clientes do dia (aba HOJE da planilha). Às 10h para, mesmo que falte alguém.' },
      { hora: '10:00', ate: '12:00', titulo: 'Protocolo, bloco 1 (meta: 3)', detalhe: 'Sem WhatsApp. Protocole com o mínimo quem já mandou: documento pessoal + acesso ao Meu INSS (ou procuração) + laudo/atestado quando for incapacidade. O resto entra depois na exigência. Lance cada um no Registro do dia com o número.' },
      { hora: '14:00', ate: '15:00', titulo: 'Ligações e vídeo-chamadas', detalhe: 'Quem não respondeu de manhã: ligação. Quem não tem senha gov.br: vídeo-chamada para criar junto e protocolar em seguida.' },
      { hora: '15:00', ate: '16:30', titulo: 'Protocolo, bloco 2 (meta: 2)', detalhe: 'Protocolar com o mínimo quem mandou documento durante o dia.' },
      { hora: '16:30', ate: '17:00', titulo: 'Fechamento do dia', detalhe: 'Conferir se todo protocolo do dia está no Registro do dia, preencher a coluna Resultado da planilha e concluir as tarefas.' },
    ],
  },
  juridico02: null, // igual ao Jurídico 01 (preenchido abaixo)
  juridico03: {
    nome: 'Jurídico 03', papel: 'Prazos', setor: 'Previdenciário',
    blocos: [
      { hora: '09:00', ate: '09:30', titulo: 'Publicações e prazos de hoje', detalhe: 'Painel Jurídico e Publicações: tratar as novas e criar a tarefa de cada providência, com responsável e prazo.' },
      { hora: '09:30', ate: '12:00', titulo: 'Cumprir os prazos de hoje e os atrasados', detalhe: 'Peças e manifestações. Nada de hoje fica para amanhã.' },
      { hora: '14:00', ate: '15:00', titulo: 'Exigências do INSS', detalhe: 'Tela INSS: cobrar do cliente o documento da exigência e cumprir antes do prazo.' },
      { hora: '15:00', ate: '16:30', titulo: 'Prazos dos próximos 7 dias e audiências', detalhe: 'Adiantar peças e avisar os clientes das audiências e perícias da semana.' },
      { hora: '16:30', ate: '17:00', titulo: 'Conferência: zero prazo de hoje em aberto', detalhe: 'Marcar como concluído o que foi cumprido em Prazos e Audiências.' },
    ],
  },
  lider: {
    nome: 'Líder', papel: 'Organiza a equipe', setor: 'Administrativo',
    blocos: [
      { hora: '09:00', ate: '09:15', titulo: 'Reunião de 10 minutos', detalhe: 'Plano da IA do comercial, metas do dia de cada um e fila do operacional da semana.' },
      { hora: '11:30', ate: '12:00', titulo: 'Checkpoint da manhã', detalhe: 'Quantos protocolos cada um já lançou no Registro do dia? Quem travou?' },
      { hora: '14:00', ate: '15:00', titulo: 'Ligações D10 da fila', detalhe: 'Ligar para os clientes que estão em D10 sem mandar documento (contato da liderança).' },
      { hora: '16:30', ate: '17:00', titulo: 'Checkpoint final', detalhe: 'Ranking do dia, tarefas atrasadas por setor e planilha atualizada.' },
    ],
  },
};
PLANO_DIA.juridico02 = { ...PLANO_DIA.juridico01, nome: 'Jurídico 02' };

export const META_PROTOCOLOS_DIA = 5;   // por pessoa do protocolo (Jurídico 01 e 02)
export const META_COBRANCAS_DIA = 10;   // clientes da fila por pessoa

/** Recado da manhã (um por dia, em rodízio). {meta} vira a meta do dia. */
export const RECADOS = [
  'Bom dia, time! Meta de hoje: {meta} protocolos cada um, 3 até o meio-dia e 2 à tarde. Cada protocolo é uma família recebendo um valor a mais todo mês.',
  'Hoje é dia de bater {meta}! Comece pelos clientes que já mandaram documento: protocolo rápido primeiro, cobrança depois.',
  'Lembrete do dia: {meta} protocolos por pessoa. Requerimento no INSS conta e sai em minutos. Bora zerar a fila!',
  'Foco total no bloco das 10h30: sem WhatsApp, só protocolo. Meta de {meta} hoje, e o 1º lugar do mês está em aberto no ranking.',
  'Cada documento que chega hoje vira protocolo hoje. Meta: {meta} por pessoa. Lance tudo no Registro do dia para contar no ranking.',
];
export function recadoDoDia(dataISO, meta = META_PROTOCOLOS_DIA) {
  const d = new Date(dataISO + 'T12:00:00Z');
  const dia = Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000);
  return RECADOS[dia % RECADOS.length].replace('{meta}', String(meta));
}
