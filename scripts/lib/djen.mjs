// Consulta pública do DJEN (Diário de Justiça Eletrônico Nacional — CNJ).
// Uma consulta pela OAB cobre todos os tribunais que publicam no DJEN.

const BASE = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';

const TR_ESTADUAL = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF', '08': 'ES',
  '09': 'GO', '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR',
  '17': 'PE', '18': 'PI', '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC',
  '25': 'SE', '26': 'SP', '27': 'TO',
};

export function ufDoProcesso(numero, siglaTribunal) {
  const dig = String(numero ?? '').replace(/\D/g, '');
  if (dig.length === 20 && dig[13] === '8') return TR_ESTADUAL[dig.slice(14, 16)] ?? null;
  const m = String(siglaTribunal ?? '').match(/^TJ([A-Z]{2})$/);
  if (m) return m[1] === 'DF' ? 'DF' : m[1];
  return null;
}

export function mascaraCnj(numero) {
  const d = String(numero ?? '').replace(/\D/g, '');
  if (d.length !== 20) return numero || null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
}

/** Busca as comunicações de uma OAB num intervalo de datas (AAAA-MM-DD). */
export async function buscarDjen({ oab, uf, de, ate, fetchImpl = fetch }) {
  const itens = [];
  for (let pagina = 1; pagina <= 50; pagina++) {
    const url = new URL(BASE);
    url.searchParams.set('numeroOab', oab);
    url.searchParams.set('ufOab', uf);
    url.searchParams.set('dataDisponibilizacaoInicio', de);
    url.searchParams.set('dataDisponibilizacaoFim', ate);
    url.searchParams.set('pagina', String(pagina));
    url.searchParams.set('itensPorPagina', '100');
    const res = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': 'sistema-raynne/1.0' } });
    if (!res.ok) throw new Error(`DJEN respondeu ${res.status} na página ${pagina}`);
    const json = await res.json();
    const lote = json.items ?? [];
    itens.push(...lote);
    if (lote.length < 100) break;
  }
  return itens.map(paraPublicacao);
}

export function paraPublicacao(c) {
  const numero = c.numeroprocessocommascara || mascaraCnj(c.numero_processo);
  return {
    fonte: 'djen',
    id_externo: String(c.id ?? c.hash),
    data_disponibilizacao: c.data_disponibilizacao ?? c.datadisponibilizacao ?? null,
    inicio_prazo: null,
    tribunal: c.siglaTribunal ?? null,
    uf: ufDoProcesso(numero, c.siglaTribunal),
    orgao: c.nomeOrgao ?? null,
    numero_processo: numero,
    tipo_comunicacao: c.tipoComunicacao ?? null,
    tipo_documento: c.tipoDocumento ?? null,
    classe: c.nomeClasse ?? null,
    texto: c.texto ? String(c.texto).replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim() : null,
    link: c.link ?? null,
    status: 'nao_lida',
  };
}
