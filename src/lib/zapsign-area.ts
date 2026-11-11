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
  if (/aereo|latam|\bgol\b|gol-|\bazul\b|avianca|avianc|\bvoo\b|companhia aerea|\btap\b/.test(n)) return 'aereo';
  if (/auxilio|acidente|doenca|bpc|loas|aposentadoria|impubere|inss|previdenc|incapacidade|pensao/.test(n)) return 'previdenciario';
  if (/trabalhista|danos morais|civel|consumidor/.test(n)) return 'outros';
  return 'a_classificar';
}

/** Área final: a correção manual da gestora vale mais que a automática. */
export function areaDoContrato(token: string, nome: string | null, correcoes: Record<string, AreaContrato>): AreaContrato {
  return correcoes[token] ?? classificarContrato(nome);
}

export interface DocArea { token: string; status: string | null; criado_em: string | null; assinado_em: string | null; cliente_nome: string | null; area: AreaContrato }

const normNome = (s: string | null) => sem(s ?? '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const PESO: Record<string, number> = { signed: 3, pending: 2, refused: 1 };

/** Um contrato por cliente e área: se o mesmo cliente tem contrato + procuração, conta uma vez (vale o assinado). */
export function unicosPorCliente<T extends DocArea>(docs: T[]): T[] {
  const m = new Map<string, T>();
  const soltos: T[] = [];
  for (const d of docs) {
    const n = normNome(d.cliente_nome);
    if (!n) { soltos.push(d); continue; }
    const k = `${n}|${d.area}`;
    const a = m.get(k);
    if (!a || (PESO[d.status ?? ''] ?? 0) > (PESO[a.status ?? ''] ?? 0)) m.set(k, d);
  }
  return [...m.values(), ...soltos];
}

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Tabela mês (de criação do contrato) × área, com assinados e pendentes. */
export function tabelaMesArea(docs: DocArea[], ano: number, ateMes: number) {
  const areas: AreaContrato[] = ['aereo', 'maternidade', 'previdenciario', 'outros', 'a_classificar'];
  const linhas = Array.from({ length: ateMes }, (_, i) => ({
    mes: i, cel: Object.fromEntries(areas.map(a => [a, { assinados: 0, pendentes: 0 }])) as Record<AreaContrato, { assinados: number; pendentes: number }>,
  }));
  for (const d of unicosPorCliente(docs.filter(d => d.area !== 'interno'))) {
    if (!d.criado_em) continue;
    const dt = new Date(d.criado_em);
    if (dt.getFullYear() !== ano || dt.getMonth() >= ateMes) continue;
    const c = linhas[dt.getMonth()].cel[d.area];
    if (!c) continue;
    if (d.status === 'signed') c.assinados++; else if (d.status === 'pending') c.pendentes++;
  }
  const total = Object.fromEntries(areas.map(a => [a, {
    assinados: linhas.reduce((s, l) => s + l.cel[a].assinados, 0),
    pendentes: linhas.reduce((s, l) => s + l.cel[a].pendentes, 0),
  }])) as Record<AreaContrato, { assinados: number; pendentes: number }>;
  return { areas, linhas, total };
}
