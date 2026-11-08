// Trava de datas comissionadas (espelha o trigger trava_datas_comissionadas).
// Uma etapa está "comissionada" quando a data pertence a mês anterior ao atual
// (a folha do mês fecha no 1º dia útil do mês seguinte). Gestor é isento.

export function dataComissionada(data: string | null | undefined): boolean {
  if (!data) return false;
  const ym = data.slice(0, 7);
  const now = new Date();
  const ymAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return ym < ymAtual;
}

export const LABEL_CAMPO_DATA: Record<string, string> = {
  data_fechamento: 'Data de fechamento',
  data_protocolo: 'Data de protocolo',
  data_pagamento_confirmado: 'Recebimento dos honorários iniciais',
  data_recebimento: 'Data de recebimento (êxito)',
};
