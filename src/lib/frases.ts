// As frases ficam em scripts/lib/frases.mjs, para a tela e os alertas do celular usarem as mesmas.
export type Momento = 'manha' | 'tarde' | 'noite';
export type MetaHoje = { meta: number; feito: number } | null | undefined;
export * from '../../scripts/lib/frases.mjs';
