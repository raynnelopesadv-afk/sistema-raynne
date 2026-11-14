import { describe, it, expect } from 'vitest';
import { ehContratoDaIA, produtoDoContrato, diaBrasilia } from '../../scripts/lib/contratos-ia.mjs';

describe('contratos fechados pela IA', () => {
  it('reconhece os modelos da IA no ZapSign', () => {
    for (const n of ['PROCURAÇÃO E CONTRATO. BPC MENOR', 'PROCURAÇÃO E CONTRATO AÉREO', 'PROCURAÇÃO E CONTRATO APOSENTADORIA OU BPC', 'PROCURAÇÃO E CONTRATO AUXILIO DOENÇA', 'MODELO AUXILIO ACIDENTE'])
      expect(ehContratoDaIA(n)).toBe(true);
    for (const n of ['CONTRATO VIVIANE.docx', 'Contrato Auxílio Acidente - drielly.docx', 'Procuração previdenciário.docx', 'MODELO CONTRATO FRANCINE'])
      expect(ehContratoDaIA(n)).toBe(false);
  });
  it('produto e divisão pelo modelo', () => {
    expect(produtoDoContrato('PROCURAÇÃO E CONTRATO AÉREO')).toEqual({ produto: 'Aéreo', divisao: 'educacao' });
    expect(produtoDoContrato('MODELO AUXILIO ACIDENTE').produto).toBe('Auxílio-acidente');
    expect(produtoDoContrato('PROCURAÇÃO E CONTRATO AUXILIO DOENÇA').produto).toBe('Benefício por incapacidade temporária');
    expect(produtoDoContrato('PROCURAÇÃO E CONTRATO APOSENTADORIA OU BPC').produto).toBe('Aposentadoria');
    expect(produtoDoContrato('PROCURAÇÃO E CONTRATO. BPC MENOR').produto).toBe('BPC/LOAS');
  });
  it('data em Brasília', () => {
    expect(diaBrasilia('2026-11-14T01:00:00Z')).toBe('2026-11-13');
  });
});
