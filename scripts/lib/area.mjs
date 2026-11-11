// Mesma regra de src/lib/zapsign-area.ts (manter as duas iguais).
const sem = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function classificarContrato(nome) {
  const n = sem(nome);
  if (/estagio|prestacao (de )?servico|distrato/.test(n)) return 'interno';
  if (/maternidade/.test(n)) return 'maternidade';
  if (/aereo|latam|\bgol\b|gol-|\bazul\b|avianca|avianc|\bvoo\b|companhia aerea|\btap\b/.test(n)) return 'aereo';
  if (/auxilio|acidente|doenca|bpc|loas|aposentadoria|impubere|inss|previdenc|incapacidade|pensao/.test(n)) return 'previdenciario';
  if (/trabalhista|danos morais|civel|consumidor/.test(n)) return 'outros';
  return 'a_classificar';
}
export function resumoMesArea(docs) {
  const t = new Map();
  for (const d of docs) {
    const a = classificarContrato(d.nome_documento); if (a === 'interno') continue;
    const m = (d.criado_em ?? '').slice(0, 7);
    const k = `${m}|${a}`; const x = t.get(k) ?? { s: 0, p: 0, r: 0 };
    if (d.status === 'signed') x.s++; else if (d.status === 'pending') x.p++; else x.r++;
    t.set(k, x);
  }
  return ['mês      área            assinados pendentes recusados',
    ...[...t].sort().map(([k, v]) => { const [m, a] = k.split('|'); return `${m}  ${a.padEnd(15)} ${String(v.s).padStart(9)} ${String(v.p).padStart(9)} ${String(v.r).padStart(9)}`; })].join('\n');
}
