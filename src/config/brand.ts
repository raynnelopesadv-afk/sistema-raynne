// Identidade da marca em um lugar só.
// Troque estes valores para personalizar o sistema sem mexer no resto do código.
// Veja o README, seção "Como trocar identidade visual".
export const BRAND = {
  // Nome curto exibido no topo e na barra lateral.
  appName: 'RL Advocacia',
  // Nome da organização (rodapé, subtítulos, tela de login).
  companyName: 'Raynne Lopes · OAB/MG 160.914',
  sidebarSubtitle: 'OAB/MG 160.914',
  // Subtítulo da tela de login.
  loginSubtitle: 'Aqui só tem os melhores.',
  // Rótulos das duas divisões de negócio (os valores no banco continuam
  // 'advogados' e 'educacao'; aqui é só o texto exibido).
  divisionLabels: {
    advogados: 'Advogados',
    educacao: 'Educação',
  },
  logoUrl: '/logo-quadrado.jpg',
  emblemaUrl: '/emblema-rl.png',
  logoTransparenteUrl: '/logo-transparente.png',
} as const;
