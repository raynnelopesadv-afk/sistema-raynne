// Plano diário do operacional (9h–17h, intervalo 12h–14h).
// Usado pela tela (Protocolos → Operacional → Plano do dia) e pelo robô que cria as tarefas às 8h50.

export const EXPEDIENTE = { inicio: '09:00', intervaloDe: '12:00', intervaloAte: '14:00', fim: '17:00' };

/** login (parte depois do +) → blocos do dia. setor = nome do setor nas Tarefas. */
export const PLANO_DIA = {
  juridico01: {
    nome: 'Jurídico 01', papel: 'Ações judiciais e requerimentos administrativos', setor: 'Protocolo',
    blocos: [
      { hora: '09:00', ate: '09:15', titulo: 'Abertura do dia', detalhe: 'Painel Jurídico, suas tarefas de hoje e respostas de clientes que chegaram no WhatsApp.' },
      { hora: '09:15', ate: '10:30', titulo: 'Cobrança de documentos (10 clientes da fila)', detalhe: 'Planilha FILA OPERACIONAL: filtre seu nome e a semana. Mande a etapa da régua de cada cliente (D0, D1, D3) e anote a data.' },
      { hora: '10:30', ate: '12:00', titulo: 'Protocolo, bloco 1 (meta: 3)', detalhe: 'Sem WhatsApp. Protocole quem já tem documento mínimo: requerimento no Meu INSS/GERID ou ação judicial. Lance cada um no Registro do dia com o número.' },
      { hora: '14:00', ate: '15:00', titulo: 'Ligações e vídeo-chamadas', detalhe: 'Clientes em D5 (ligação) e D7 (vídeo-chamada para criar/recuperar a senha gov.br junto com o cliente).' },
      { hora: '15:00', ate: '16:30', titulo: 'Protocolo, bloco 2 (meta: 2)', detalhe: 'Mais protocolos ou montar as pastas de quem mandou documento hoje.' },
      { hora: '16:30', ate: '17:00', titulo: 'Fechamento do dia', detalhe: 'Conferir se todo protocolo do dia está no Registro do dia, atualizar a coluna Resultado da planilha e concluir as tarefas.' },
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
