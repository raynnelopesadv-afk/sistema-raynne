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
const nn = s => sem(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
export function comHeranca(docs) {
  const b = docs.map(d => ({ ...d, area: classificarContrato(d.nome_documento) }));
  const pc = new Map();
  for (const d of b) { const n = nn(d.cliente_nome); if (!n || d.area === 'a_classificar' || d.area === 'interno') continue; const m = pc.get(n) ?? new Map(); m.set(d.area, (m.get(d.area) ?? 0) + 1); pc.set(n, m); }
  for (const d of b) if (d.area === 'a_classificar') { const m = pc.get(nn(d.cliente_nome)); if (m) d.area = [...m].sort((x, y) => y[1] - x[1])[0][0]; }
  // um por cliente e área (vale o assinado)
  const P = { signed: 3, pending: 2, refused: 1 }; const u = new Map(); const soltos = [];
  for (const d of b) { const n = nn(d.cliente_nome); if (!n) { soltos.push(d); continue; } const k = `${n}|${d.area}`; const a = u.get(k); if (!a || (P[d.status] ?? 0) > (P[a.status] ?? 0)) u.set(k, d); }
  return [...u.values(), ...soltos];
}
export function resumoMesArea(docs) {
  const t = new Map();
  for (const d of comHeranca(docs)) {
    const a = d.area; if (a === 'interno') continue;
    const m = (d.criado_em ?? '').slice(0, 7);
    const k = `${m}|${a}`; const x = t.get(k) ?? { s: 0, p: 0, r: 0 };
    if (d.status === 'signed') x.s++; else if (d.status === 'pending') x.p++; else x.r++;
    t.set(k, x);
  }
  return ['mês      área            assinados pendentes recusados',
    ...[...t].sort().map(([k, v]) => { const [m, a] = k.split('|'); return `${m}  ${a.padEnd(15)} ${String(v.s).padStart(9)} ${String(v.p).padStart(9)} ${String(v.r).padStart(9)}`; })].join('\n');
}
