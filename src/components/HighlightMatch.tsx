import { isNumericQuery, onlyDigits } from '@/lib/cliente-search';

interface Props {
  text: string;
  query: string;
  /** 'name' destaca somente texto; 'cpf' destaca dígitos no CPF formatado/cru */
  field: 'name' | 'cpf';
  className?: string;
}

function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Destaca o trecho casado com o termo buscado.
 * - Para nome: case/acento insensível.
 * - Para CPF: compara dígitos puros e marca a posição correspondente no texto exibido.
 */
export function HighlightMatch({ text, query, field, className }: Props) {
  const q = query.trim();
  if (!text) return <>—</>;
  if (!q) return <span className={className}>{text}</span>;

  const accent = 'font-semibold text-[#F5C518]';

  if (field === 'cpf') {
    if (!isNumericQuery(q)) return <span className={className}>{text}</span>;
    const qd = onlyDigits(q);
    if (!qd) return <span className={className}>{text}</span>;
    // Mapa: indice do dígito -> posição no texto
    const digitPositions: number[] = [];
    const digits: string[] = [];
    for (let i = 0; i < text.length; i++) {
      if (/\d/.test(text[i])) {
        digitPositions.push(i);
        digits.push(text[i]);
      }
    }
    const joined = digits.join('');
    const start = joined.indexOf(qd);
    if (start < 0) return <span className={className}>{text}</span>;
    const end = start + qd.length - 1;
    const startPos = digitPositions[start];
    const endPos = digitPositions[end] + 1;
    return (
      <span className={className}>
        {text.slice(0, startPos)}
        <mark className={`bg-transparent ${accent}`}>{text.slice(startPos, endPos)}</mark>
        {text.slice(endPos)}
      </span>
    );
  }

  if (isNumericQuery(q)) return <span className={className}>{text}</span>;

  const hayLower = stripAccents(text.toLowerCase());
  const needle = stripAccents(q.toLowerCase());
  const idx = hayLower.indexOf(needle);
  if (idx < 0) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {text.slice(0, idx)}
      <mark className={`bg-transparent ${accent}`}>{text.slice(idx, idx + needle.length)}</mark>
      {text.slice(idx + needle.length)}
    </span>
  );
}
