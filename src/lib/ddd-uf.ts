// Mapa DDD -> UF e utilidades para derivar o estado do lead pelo telefone.
export const DDD_UF: Record<string, string> = {
  '11':'SP','12':'SP','13':'SP','14':'SP','15':'SP','16':'SP','17':'SP','18':'SP','19':'SP',
  '21':'RJ','22':'RJ','24':'RJ',
  '27':'ES','28':'ES',
  '31':'MG','32':'MG','33':'MG','34':'MG','35':'MG','37':'MG','38':'MG',
  '41':'PR','42':'PR','43':'PR','44':'PR','45':'PR','46':'PR',
  '47':'SC','48':'SC','49':'SC',
  '51':'RS','53':'RS','54':'RS','55':'RS',
  '61':'DF','62':'GO','64':'GO','63':'TO','65':'MT','66':'MT','67':'MS',
  '68':'AC','69':'RO',
  '71':'BA','73':'BA','74':'BA','75':'BA','77':'BA','79':'SE',
  '81':'PE','87':'PE','82':'AL','83':'PB','84':'RN','85':'CE','88':'CE','86':'PI','89':'PI',
  '91':'PA','93':'PA','94':'PA','92':'AM','97':'AM','95':'RR','96':'AP','98':'MA','99':'MA',
};

/** Deriva a UF a partir do telefone (usa o DDD). Aceita vários formatos. */
export function ufFromTelefone(tel?: string | null): string | null {
  const d = (tel ?? '').replace(/\D/g, '');
  if (d.length < 10) return null;
  let n = d;
  if (n.length >= 12 && n.startsWith('55')) n = n.slice(2); // tira o DDI 55
  const ddd = n.slice(0, 2);
  return DDD_UF[ddd] ?? null;
}

/** Posição [coluna, linha] de cada UF numa grade no formato do Brasil (7 col × 8 lin). */
export const UF_GRID: Record<string, [number, number]> = {
  RR: [2,0], AP: [4,0],
  AM: [1,1], PA: [3,1], MA: [4,1], CE: [5,1], RN: [6,1],
  AC: [0,2], RO: [2,2], TO: [3,2], PI: [5,2], PB: [6,2],
  MT: [2,3], DF: [3,3], BA: [4,3], PE: [5,3], AL: [6,3],
  MS: [2,4], GO: [3,4], MG: [4,4], ES: [5,4], SE: [6,4],
  SP: [3,5], RJ: [4,5],
  PR: [3,6],
  SC: [3,7],
  RS: [3,8],
};
export const UF_LIST = Object.keys(UF_GRID);
