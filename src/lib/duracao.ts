/**
 * Formata uma duração de forma legível, no padrão dos relatórios:
 *   43min · 2h 15min · 3 dias · 4 dias 6h · 96 dias
 */
export function formatDuracao(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}min`;

  const horas = Math.floor(min / 60);
  const restoMin = min % 60;
  if (horas < 24) return restoMin > 0 ? `${horas}h ${restoMin}min` : `${horas}h`;

  const dias = Math.floor(horas / 24);
  const restoH = horas % 24;
  const plural = dias === 1 ? 'dia' : 'dias';
  if (dias < 30 && restoH > 0) return `${dias} ${plural} ${restoH}h`;
  return `${dias} ${plural}`;
}

/** Duração entre entrada e fechamento. Aceita data (AAAA-MM-DD) ou horário ISO. */
export function duracaoEntre(inicio?: string | null, fim?: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio.length <= 10 ? `${inicio}T00:00:00` : inicio).getTime();
  const b = new Date(fim.length <= 10 ? `${fim}T23:59:59` : fim).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  const d = b - a;
  return d >= 0 ? d : null;
}
