// Funções puras de conversão dos documentos do ZapSign (testadas em src/test).
export function ehDoEscritorio(s, ignorar = ['raynne']) {
  const alvo = `${s?.name ?? ''} ${s?.email ?? ''}`.toLowerCase();
  return ignorar.some(x => x && alvo.includes(x));
}
export function telefone(s) {
  let n = String(s?.phone_number ?? '').replace(/\D/g, '');
  if (!n) return null;
  const pais = String(s?.phone_country ?? '55').replace(/\D/g, '') || '55';
  // cliente digitou o 55 junto do número: tira a duplicação
  if (pais === '55' && n.length > 11 && n.startsWith('55')) n = n.slice(2);
  return `+${pais}${n}`;
}

/** Converte o detalhe do documento numa linha da tabela. */
export function paraLinha(doc, ignorar = ['raynne']) {
  const signers = Array.isArray(doc.signers) ? doc.signers : [];
  const clientes = signers.filter(s => !ehDoEscritorio(s, ignorar));
  const cliente = clientes[0] ?? signers[0] ?? null;
  const assinaturas = clientes.map(s => s.signed_at).filter(Boolean).sort();
  return {
    token: doc.token,
    nome_documento: doc.name ?? null,
    status: doc.status ?? null,
    criado_em: doc.created_at ?? null,
    atualizado_zapsign_em: doc.last_update_at ?? null,
    assinado_em: doc.status === 'signed' ? (assinaturas.at(-1) ?? doc.last_update_at ?? null) : null,
    cliente_nome: cliente?.name ?? null,
    cliente_telefone: telefone(cliente),
    cliente_email: cliente?.email || null,
    cliente_status: cliente?.status ?? null,
    cliente_visualizacoes: cliente?.times_viewed ?? null,
    cliente_ultima_visualizacao: cliente?.last_view_at ?? null,
    link_assinatura: cliente?.sign_url ?? null,
    link_documento: doc.signed_file ?? doc.original_file ?? null,
    signatarios: signers.map(s => ({ nome: s.name, email: s.email || null, telefone: telefone(s), status: s.status, assinado_em: s.signed_at })),
    sincronizado_em: new Date().toISOString(),
  };
}

