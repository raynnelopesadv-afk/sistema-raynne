/** Área de cada contrato do ZapSign, deduzida automaticamente do nome do documento. */
export type AreaContrato = 'aereo' | 'maternidade' | 'previdenciario' | 'outros' | 'interno' | 'a_classificar';

export const AREA_CONTRATO_LABEL: Record<AreaContrato, string> = {
  aereo: 'Aéreo',
  maternidade: 'Maternidade',
  previdenciario: 'Previdenciário',
  outros: 'Outros (cível/trabalhista)',
  interno: 'Interno (equipe)',
  a_classificar: 'A classificar',
};

/** Áreas que contam como contrato de cliente. */
export const AREAS_CLIENTE: AreaContrato[] = ['aereo', 'maternidade', 'previdenciario', 'outros', 'a_classificar'];

const sem = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function classificarContrato(nome: string | null | undefined): AreaContrato {
  const n = sem(nome ?? '');
  if (/estagio|prestacao (de )?servico|distrato/.test(n)) return 'interno';
  if (/maternidade/.test(n)) return 'maternidade';
  if (/aereo|latam|\bgol\b|gol-|\bazul\b|avianca|avianc|voo|companhia aerea|\btap\b/.test(n)) return 'aereo';
  if (/auxilio|acidente|doenca|bpc|loas|aposentadoria|impubere|inss|previdenc|incapacidade|pensao/.test(n)) return 'previdenciario';
  if (/trabalhista|danos morais|civel|consumidor/.test(n)) return 'outros';
  return 'a_classificar';
}

/** Área final: a correção manual da gestora vale mais que a automática. */
export function areaDoContrato(token: string, nome: string | null, correcoes: Record<string, AreaContrato>): AreaContrato {
  return correcoes[token] ?? classificarContrato(nome);
}
