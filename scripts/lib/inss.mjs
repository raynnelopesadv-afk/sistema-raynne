// Leitura dos e-mails automáticos do INSS (noreply@inss.gov.br):
// "[INSS] O status do requerimento XXXXX foi alterado para Pendente"

const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export function htmlParaTexto(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, m => ENTIDADES[m] ?? ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function campo(texto, nome) {
  const re = new RegExp(`${nome}\\s*:\\s*(.+)`, 'i');
  const m = texto.match(re);
  return m ? m[1].trim() : null;
}

function dataBR(s) {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Converte um e-mail do INSS em aviso estruturado. Retorna null se não for do INSS. */
export function lerEmailInss({ email_id, recebido_em, assunto, html }) {
  const texto = htmlParaTexto(html);
  const protocolo = campo(texto, 'Protocolo')?.match(/\d{6,}/)?.[0]
    ?? String(assunto ?? '').match(/requerimento\s+(\d{6,})/i)?.[1];
  if (!protocolo) return null;

  const cliente = texto.match(/Prezado\(a\)\s*Sr\(a\)\s*([^,\n]+)/i)?.[1]?.trim() ?? null;
  const statusTexto = campo(texto, 'Status atual')
    ?? String(assunto ?? '').match(/alterado para\s+(.+)$/i)?.[1];
  const status = statusTexto ? statusTexto.trim().toUpperCase() : null;

  let despacho = null;
  const iDesp = texto.search(/Despacho\s*:/i);
  if (iDesp >= 0) {
    despacho = texto.slice(iDesp).replace(/^Despacho\s*:\s*/i, '');
    const fim = despacho.search(/É possível acompanhar o andamento/i);
    if (fim >= 0) despacho = despacho.slice(0, fim);
    despacho = despacho.trim() || null;
  }

  const automatica = /cumpriu a exig[êe]ncia de forma autom[áa]tica/i.test(despacho ?? '');

  return {
    email_id,
    recebido_em,
    protocolo,
    cliente,
    servico: campo(texto, 'Serviço') ?? campo(texto, 'Servico'),
    data_protocolo: dataBR(campo(texto, 'Data do Protocolo')),
    unidade: campo(texto, 'Unidade responsável') ?? campo(texto, 'Unidade responsavel'),
    status,
    despacho,
    exigencia_automatica: automatica,
  };
}

/** Data (AAAA-MM-DD, horário de Brasília) + N dias corridos. */
export function prazoCorrido(recebidoEmISO, dias = 30) {
  const d = new Date(new Date(recebidoEmISO).getTime() - 3 * 3600 * 1000); // UTC-3
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
