// Frases do dia (tela e celular). Arquivo único usado pelo sistema (src/lib/frases.ts) e pelos alertas do celular.
// Frases que passam no topo da tela, mudando conforme o momento do dia.
// Equipe: motivação para a meta. Dra. Raynne: fé, vitória e prosperidade.


export function momentoDoDia(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'manha';
  if (h >= 12 && h < 17) return 'tarde';
  return 'noite';
}

export const FRASES_EQUIPE = {
  manha: [
    'Bom dia, vencedor(a)! Hoje é dia de bater a meta!',
    'Você consegue! Comece forte que o dia é seu.',
    'Vai, vencedor(a)! O primeiro contrato do dia já está te esperando.',
    'Café na mão, foco na meta. Bora!',
    'Quem começa cedo, fecha mais. Você consegue!',
    'Bom dia, filho(a) de Deus! As misericórdias Dele se renovam hoje.',
  ],
  tarde: [
    'Vai, vencedor(a)! A tarde é de virada!',
    'Você consegue! Ainda dá tempo de bater a meta hoje.',
    'Mantém o ritmo, vencedor(a). Cada protocolo conta!',
    'Bora pra meta! Mais um cliente atendido, mais uma vitória.',
    'Foco total: você está mais perto do que imagina!',
    'Deus está contigo nessa tarde. Não pare agora, vencedor(a)!',
  ],
  noite: [
    'Fecha o dia com chave de ouro, vencedor(a)!',
    'Você consegue! Termine o que começou.',
    'Orgulho do seu esforço hoje. Amanhã tem mais vitória!',
    'Vai, vencedor(a)! Confira suas tarefas antes de sair.',
    'Quem persiste vence. Você é vencedor(a)!',
    'Obrigado(a) pelo seu esforço hoje. Deus viu cada passo seu!',
  ],
};

export const FRASES_RAYNNE = {
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

// Versículos (passam o dia todo, intercalados com as frases do momento)
export const VERSICULOS_RAYNNE = [
  'Deus está comigo! Mil cairão ao meu lado, dez mil à minha direita, mas eu não serei atingida. (Sl 91:7)',
  'Jesus é o meu advogado junto ao Pai. (1 Jo 2:1)',
  'Se Deus é por nós, quem será contra nós? (Rm 8:31)',
  'Toda arma forjada contra ti não prosperará. (Is 54:17)',
  'Tudo posso naquele que me fortalece. (Fp 4:13)',
  'O Senhor é o meu pastor, nada me faltará. (Sl 23:1)',
  'Não temas, porque eu sou contigo. (Is 41:10)',
  'O Senhor te porá por cabeça, e não por cauda. (Dt 28:13)',
  'Eu sei os planos que tenho para você: planos de paz e de futuro. (Jr 29:11)',
  'Entrega ao Senhor as tuas obras, e teus planos serão estabelecidos. (Pv 16:3)',
];

export const VERSICULOS_EQUIPE = [
  'Você é vencedor(a), corajoso(a), filho(a) de Deus!',
  'Toda obra contrária já caiu por terra. Vai, vencedor(a)!',
  'Sê forte e corajoso! O Senhor teu Deus é contigo por onde quer que andares. (Js 1:9)',
  'Somos mais que vencedores. (Rm 8:37)',
  'Tudo posso naquele que me fortalece. (Fp 4:13)',
  'Toda arma forjada contra ti não prosperará. (Is 54:17)',
  'Tudo o que fizerem, façam de todo o coração. (Cl 3:23)',
  'Não desanime: no tempo certo você vai colher. (Gl 6:9)',
  'Entrega ao Senhor as tuas obras, e teus planos serão estabelecidos. (Pv 16:3)',
  'Você é filho(a) de Deus, e filho(a) de Deus nasceu pra vencer!',
  'Deus te escolheu, te capacitou e vai te honrar. Vai com tudo!',
  'O mesmo Deus que abriu o mar abre portas pra você hoje.',
  'Você não está sozinho(a): Deus vai à sua frente em cada atendimento.',
  'Nenhuma porta fechada resiste a um filho(a) de Deus que não desiste.',
  'Deus honra quem trabalha com excelência. Esse é você!',
  'O Senhor é a minha força e o meu escudo. (Sl 28:7)',
  'Os que esperam no Senhor renovam as suas forças. (Is 40:31)',
  'Deus é poderoso para fazer infinitamente mais do que pedimos. (Ef 3:20)',
  'Eu creio em você, e Deus mais ainda. Bora vencer!',
];

// Modo coach: energia, foco e ação — para a produtividade triplicar
export const COACH_EQUIPE = [
  'Uma tarefa de cada vez, com 100% de foco. É assim que se triplica o resultado!',
  'Não espere a vontade chegar: comece, e a energia vem junto. Bora!',
  'Disciplina vence talento quando o talento não tem disciplina. Seja os dois!',
  'Celular de lado, foco ligado: os próximos 30 minutos valem ouro.',
  'Campeão não é quem nunca cai: é quem levanta e fecha o próximo contrato.',
  'Você é a média do seu esforço diário. Hoje, eleve a média!',
  'Pergunta de coach: o que você pode terminar AGORA em 15 minutos? Faz!',
  'Resultado extraordinário vem de gente comum fazendo o básico com excelência, todo dia.',
  'Comemora cada protocolo, cada fechamento. Vitória pequena gera vitória grande!',
  'Respira, alinha a postura e vai pra cima. Hoje é dia de recorde!',
];

// Closers (comercial e líder): coach de vendas
export const FRASE_CLOSER = 'Cada "não" te deixa mais perto do "sim". Próximo!';
/** Orientação fixa dos closers: manhã = liga, liga, liga e depois mensagem; tarde = só os quentes. */
export function orientacaoCloser(d = new Date()) {
  return momentoDoDia(d) === 'manha'
    ? 'Manhã: LIGA, LIGA, LIGA! Depois manda mensagem.'
    : 'Tarde: só liga nos QUENTES e vai pra cima!';
}

export const COACH_CLOSER = [
  'Liga agora pro próximo lead. Quem liga mais, fecha mais!',
  'Objeção não é "não": é pedido de mais segurança. Acolhe e fecha!',
  'Seu próximo contrato está em uma conversa de distância. Chama!',
  'Retorna aquele lead que ficou de pensar: hoje ele decide com você.',
  'Você não vende contrato: você entrega o direito que muda a vida do cliente.',
  'Closer de verdade pede o fechamento. Pede!',
];

export const COACH_RAYNNE = [
  'Líder que acredita multiplica. Sua fé faz a equipe triplicar!',
  'Você não construiu um escritório: construiu um império. E ele está só começando.',
  'Decida como a advogada milionária que você já é. Ela age hoje.',
  'Seu padrão eleva o padrão de todo mundo. Continue sendo referência!',
  'Pensa grande, executa rápido, celebra cada conquista.',
  'Delegue o que pesa e concentre sua energia no que só você faz.',
  'Quem planta excelência colhe autoridade. Você é autoridade!',
  'Visão de dona, coração de serva, fé de gigante. Essa é você.',
  'O próximo nível da RL Advocacia começa na decisão que você toma hoje.',
  'Reconheça a equipe hoje: elogio sincero triplica a entrega!',
];


/** Frases quando a meta do dia ainda não foi batida (ou acabou de ser). */
export function frasesDaMeta(m) {
  if (!m || m.meta <= 0) return [];
  const faltam = m.meta - m.feito;
  if (faltam <= 0) return ['Meta batida! Aqui só tem os melhores!', 'Você é vencedor(a)! Bora pro próximo!'];
  const quanto = faltam === 1 ? 'Falta só 1' : `Faltam ${faltam}`;
  return [
    `Vai, vencedor(a)! ${quanto}, bora pra meta!`,
    `Falta pouco! ${quanto} para bater a meta de hoje.`,
    `Filho(a) de Deus não para na metade: ${quanto.toLowerCase()}, você consegue!`,
  ];
}

/** Intercala as listas: frase, versículo, meta, frase, versículo... */
export function intercalar(...listas) {
  const out = [];
  const max = Math.max(...listas.map(l => l.length));
  for (let i = 0; i < max; i++) for (const l of listas) if (l.length) out.push(l[i % l.length]);
  return out;
}

/** Só a Dra. Raynne. Os logins da equipe usam o Gmail dela com "+" (raynnelopes.adv+comercial01@gmail.com) e NÃO são ela. */
export function ehRaynne(email) {
  const e = (email ?? '').trim().toLowerCase();
  return /^raynne/.test(e) && !e.split('@')[0].includes('+');
}

export function frasesPara(email, d = new Date(), meta, setor) {
  const dela = ehRaynne(email);
  const doMomento = (dela ? FRASES_RAYNNE : FRASES_EQUIPE)[momentoDoDia(d)];
  const versiculos = dela ? VERSICULOS_RAYNNE : VERSICULOS_EQUIPE;
  const closer = setor === 'comercial' || setor === 'lider';
  if (!dela && closer) {
    // closer: a orientação do momento e o "Cada não..." aparecem o tempo todo, entre as demais
    const demais = intercalar(doMomento, COACH_CLOSER, versiculos, frasesDaMeta(meta));
    return demais.flatMap((f, i) => [i % 2 ? FRASE_CLOSER : orientacaoCloser(d), f]);
  }
  const coach = dela ? COACH_RAYNNE : COACH_EQUIPE;
  return intercalar(doMomento, coach, versiculos, dela ? [] : frasesDaMeta(meta));
}
