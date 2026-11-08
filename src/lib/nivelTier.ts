// Tiers visuais dos níveis de carreira (estilo ranked/LoL), mapeados pela
// ORDEM do nível — assim funcionam mesmo se os nomes forem personalizados.
//   1 Bronze · 2 Prata · 3 Ouro · 4 Platina · 5+ Diamante

export interface NivelTier {
  nome: string;
  cor: string;        // cor principal
  corClara: string;   // brilho/realce
  corEscura: string;  // sombra/borda interna
}

const TIERS: NivelTier[] = [
  { nome: 'Bronze',   cor: '#CD7F32', corClara: '#E8A868', corEscura: '#8B5A2B' },
  { nome: 'Prata',    cor: '#B8C2CC', corClara: '#E6EBF0', corEscura: '#7E8A96' },
  { nome: 'Ouro',     cor: '#B8892B', corClara: '#FFE066', corEscura: '#B8860B' },
  { nome: 'Platina',  cor: '#4FD1C5', corClara: '#9DECE4', corEscura: '#2C7A73' },
  { nome: 'Diamante', cor: '#38BDF8', corClara: '#BAE6FD', corEscura: '#0369A1' },
];

export function tierPorOrdem(ordem: number | null | undefined): NivelTier | null {
  if (!ordem || ordem < 1) return null;
  return TIERS[Math.min(ordem, TIERS.length) - 1];
}

/** Estilo de badge (pill) do nível conforme o tier. */
export function badgeStyleDoTier(t: NivelTier): React.CSSProperties {
  return {
    background: `${t.cor}26`,
    color: t.corClara,
    border: `1px solid ${t.cor}66`,
  };
}

/** Anel/moldura da foto no telão: gradiente cônico + brilho. */
export function anelStyleDoTier(t: NivelTier): React.CSSProperties {
  return {
    background: `conic-gradient(from 0deg, ${t.corEscura}, ${t.cor}, ${t.corClara}, ${t.cor}, ${t.corEscura}, ${t.cor}, ${t.corClara}, ${t.cor}, ${t.corEscura})`,
    boxShadow: `0 0 60px ${t.cor}73, 0 0 120px ${t.cor}33`,
  };
}
