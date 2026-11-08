// Identidade da marca em um lugar só.
// Troque estes valores para personalizar o sistema sem mexer no resto do código.
// Veja o README, seção "Como trocar identidade visual".
export const BRAND = {
  // Nome curto exibido no topo e na barra lateral.
  appName: 'Raynne Lopes',
  // Nome da organização (rodapé, subtítulos, tela de login).
  companyName: 'Advocacia Especializada · OAB/MG 160.914',
  // Subtítulo da tela de login.
  loginSubtitle: 'Sistema interno do escritório',
  // Rótulos das duas divisões de negócio (os valores no banco continuam
  // 'advogados' e 'educacao'; aqui é só o texto exibido).
  divisionLabels: {
    advogados: 'Advogados',
    educacao: 'Educação',
  },
  logoUrl: '/logo-quadrado.jpg',
} as const;
