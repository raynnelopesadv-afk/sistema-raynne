import { describe, it, expect } from 'vitest';
import {
  calcularBonusCombo,
  calcularEstornosMes,
  calcularParcelasMes,
  DEFAULT_SETTINGS,
  fatorMeta,
  isMisto,
  metaAjustada,
  multiplicadorContrato,
  RegrasIndex,
  type ContratoRegras,
} from '@/lib/comissaoRegras';

const S = DEFAULT_SETTINGS; // piso 50, proporcional, fds 1.5

describe('fatorMeta', () => {
  it('abaixo do piso não recebe', () => {
    expect(fatorMeta(0, S)).toBe(0);
    expect(fatorMeta(49.9, S)).toBe(0);
  });
  it('entre piso e 99% é proporcional', () => {
    expect(fatorMeta(50, S)).toBeCloseTo(0.5);
    expect(fatorMeta(75, S)).toBeCloseTo(0.75);
    expect(fatorMeta(99, S)).toBeCloseTo(0.99);
  });
  it('100%+ recebe cheio', () => {
    expect(fatorMeta(100, S)).toBe(1);
    expect(fatorMeta(180, S)).toBe(1);
  });
  it('sem proporcionalidade paga cheio a partir do piso', () => {
    const s = { ...S, proporcional: false };
    expect(fatorMeta(60, s)).toBe(1);
    expect(fatorMeta(40, s)).toBe(0);
  });
});

describe('multiplicadorContrato', () => {
  it('sábado e domingo valem multFds', () => {
    expect(multiplicadorContrato('2026-07-11', S)).toBe(1.5); // sábado
    expect(multiplicadorContrato('2026-07-12', S)).toBe(1.5); // domingo
  });
  it('dia útil vale 1x', () => {
    expect(multiplicadorContrato('2026-07-13', S)).toBe(1); // segunda
  });
});

describe('calcularParcelasMes', () => {
  const PROD = 'prod-amea';
  const LEVEL = 'nivel-2';
  const CLOSER = 'closer-1';

  const regras = new RegrasIndex(
    [
      { product_id: PROD, career_level_id: LEVEL, etapa: 'fechamento', variante: null, valor: 20 },
      { product_id: PROD, career_level_id: LEVEL, etapa: 'protocolo', variante: null, valor: 20 },
    ],
    [{ product_id: PROD, career_level_id: LEVEL, meta_contratos: 20 }],
  );
  const nivel = new Map([[CLOSER, LEVEL]]);

  function contrato(id: string, over: Partial<ContratoRegras> = {}): ContratoRegras {
    return {
      id,
      closer_id: CLOSER,
      product_id: PROD,
      variante: null,
      data_fechamento: '2026-07-13',
      data_protocolo: null,
      data_pagamento_confirmado: null,
      ...over,
    };
  }

  it('paga fechamento no mês, com fator cheio quando bate a meta', () => {
    const contratos = Array.from({ length: 20 }, (_, i) => contrato(`c${i}`));
    const contagem = new Map([[`${CLOSER}|${PROD}|2026-07`, 20]]);
    const parcelas = calcularParcelasMes({
      ymRef: '2026-07',
      contratosEvento: contratos,
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: S,
    });
    const total = parcelas.reduce((a, p) => a + p.valor, 0);
    expect(parcelas).toHaveLength(20);
    expect(total).toBeCloseTo(20 * 20); // 20 contratos × R$ 20 (fechamento)
  });

  it('protocolo cai no mês do protocolo, com fator do mês de fechamento', () => {
    const c = contrato('c1', { data_fechamento: '2026-06-10', data_protocolo: '2026-07-05' });
    const contagem = new Map([[`${CLOSER}|${PROD}|2026-06`, 20]]); // bateu meta em junho
    const parcelas = calcularParcelasMes({
      ymRef: '2026-07',
      contratosEvento: [c],
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: S,
    });
    expect(parcelas).toHaveLength(1);
    expect(parcelas[0].etapa).toBe('protocolo');
    expect(parcelas[0].valor).toBeCloseTo(20);
  });

  it('abaixo do piso zera o variável', () => {
    const contratos = Array.from({ length: 5 }, (_, i) => contrato(`c${i}`)); // 25% da meta
    const contagem = new Map([[`${CLOSER}|${PROD}|2026-07`, 5]]);
    const parcelas = calcularParcelasMes({
      ymRef: '2026-07',
      contratosEvento: contratos,
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: S,
    });
    expect(parcelas.every(p => p.valor === 0)).toBe(true);
  });

  it('fim de semana multiplica por 1,5', () => {
    const c = contrato('c1', { data_fechamento: '2026-07-11' }); // sábado
    const contagem = new Map([[`${CLOSER}|${PROD}|2026-07`, 20]]);
    const parcelas = calcularParcelasMes({
      ymRef: '2026-07',
      contratosEvento: [c],
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: S,
    });
    expect(parcelas[0].valor).toBeCloseTo(30); // 20 × 1,5
  });

  it('variante usa valor específico e cai no padrão se não houver', () => {
    const r = new RegrasIndex(
      [
        { product_id: 'uber', career_level_id: LEVEL, etapa: 'pagamento', variante: '1 plataforma', valor: 30 },
        { product_id: 'uber', career_level_id: LEVEL, etapa: 'pagamento', variante: '2 plataformas', valor: 50 },
      ],
      [{ product_id: 'uber', career_level_id: LEVEL, meta_contratos: 30 }],
    );
    expect(r.valorEtapa('uber', LEVEL, 'pagamento', '2 plataformas')).toBe(50);
    expect(r.valorEtapa('uber', LEVEL, 'pagamento', '1 plataforma')).toBe(30);
    expect(r.valorEtapa('uber', LEVEL, 'pagamento', null)).toBe(0); // sem regra padrão
  });

  it('desqualificado/desistência não gera parcela (estorno simples)', () => {
    const c = contrato('c1', { status_qualificacao: 'desqualificado' });
    const contagem = new Map([[`${CLOSER}|${PROD}|2026-07`, 20]]);
    const parcelas = calcularParcelasMes({
      ymRef: '2026-07',
      contratosEvento: [c],
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: S,
    });
    expect(parcelas).toHaveLength(0);
  });
});

describe('operação mista (manual 5.4)', () => {
  it('meta ajustada: misto = meta × 2/3 arredondando para baixo', () => {
    expect(metaAjustada(20, true)).toBe(13);  // AMEA N2: 20 -> 13
    expect(metaAjustada(30, true)).toBe(20);  // UBER N2: 30 -> 20
    expect(metaAjustada(55, true)).toBe(36);  // Elite AMEA: 55 -> 36
    expect(metaAjustada(20, false)).toBe(20); // exclusivo mantém
  });

  it('isMisto exige 2+ produtos', () => {
    expect(isMisto(new Set(['a']))).toBe(false);
    expect(isMisto(new Set(['a', 'b']))).toBe(true);
    expect(isMisto(undefined)).toBe(false);
  });

  it('bônus de combo: só quando bate a meta mista de TODOS os produtos', () => {
    const regras = new RegrasIndex(
      [],
      [
        { product_id: 'amea', career_level_id: 'n2', meta_contratos: 20 }, // mista 13
        { product_id: 'uber', career_level_id: 'n2', meta_contratos: 30 }, // mista 20
      ],
    );
    const operacao = new Map([['ana', new Set(['amea', 'uber'])]]);
    const bonus = new Map([['n2', 300]]);
    const base = {
      ymRef: '2026-07',
      closers: [{ id: 'ana', career_level_id: 'n2' }],
      operacaoPorCloser: operacao,
      regras,
      bonusPorNivel: bonus,
    };

    // bateu as duas metas mistas (13 e 20)
    const ok = calcularBonusCombo({ ...base, contagemFechamentos: new Map([['ana|amea|2026-07', 13], ['ana|uber|2026-07', 20]]) });
    expect(ok.get('ana')).toBe(300);

    // bateu só uma -> sem bônus parcial
    const parcial = calcularBonusCombo({ ...base, contagemFechamentos: new Map([['ana|amea|2026-07', 13], ['ana|uber|2026-07', 19]]) });
    expect(parcial.has('ana')).toBe(false);
  });

  it('fator do misto usa a meta reduzida', () => {
    const regras = new RegrasIndex(
      [{ product_id: 'amea', career_level_id: 'n2', etapa: 'fechamento', variante: null, valor: 20 }],
      [{ product_id: 'amea', career_level_id: 'n2', meta_contratos: 20 }],
    );
    const contrato: ContratoRegras = {
      id: 'c1', closer_id: 'ana', product_id: 'amea', variante: null,
      data_fechamento: '2026-07-13', data_protocolo: null, data_pagamento_confirmado: null,
    };
    // 13 fechados: exclusivo = 65% da meta (fator 0.65); misto = 100% da meta mista (fator 1)
    const parcelas = calcularParcelasMes({
      ymRef: '2026-07',
      contratosEvento: [contrato],
      contagemFechamentos: new Map([['ana|amea|2026-07', 13]]),
      nivelPorCloser: new Map([['ana', 'n2']]),
      regras,
      settings: DEFAULT_SETTINGS,
      operacaoPorCloser: new Map([['ana', new Set(['amea', 'uber'])]]),
    });
    expect(parcelas[0].fator).toBe(1);
    expect(parcelas[0].valor).toBeCloseTo(20);
  });
});

describe('fechamento por IA', () => {
  const regras = new RegrasIndex(
    [
      { product_id: 'amea', career_level_id: 'n2', etapa: 'fechamento', variante: null, valor: 20 },
      { product_id: 'amea', career_level_id: 'n2', etapa: 'protocolo', variante: null, valor: 20 },
    ],
    [{ product_id: 'amea', career_level_id: 'n2', meta_contratos: 20 }],
  );
  const nivel = new Map([['ana', 'n2']]);
  const contratoIA: ContratoRegras = {
    id: 'c1', closer_id: 'ana', product_id: 'amea', variante: null,
    data_fechamento: '2026-06-13', data_protocolo: '2026-07-10',
    data_pagamento_confirmado: null, fechado_por_ia: true,
  };
  const contagem = new Map([['ana|amea|2026-06', 20]]);

  it('parcela do fechamento NÃO cai no mês do fechamento', () => {
    const junho = calcularParcelasMes({
      ymRef: '2026-06', contratosEvento: [contratoIA], contagemFechamentos: contagem,
      nivelPorCloser: nivel, regras, settings: S,
    });
    expect(junho).toHaveLength(0);
  });

  it('fechamento + protocolo caem juntos no mês do protocolo', () => {
    const julho = calcularParcelasMes({
      ymRef: '2026-07', contratosEvento: [contratoIA], contagemFechamentos: contagem,
      nivelPorCloser: nivel, regras, settings: S,
    });
    expect(julho.map(p => p.etapa).sort()).toEqual(['fechamento', 'protocolo']);
    expect(julho.reduce((a, p) => a + p.valor, 0)).toBeCloseTo(40);
  });

  it('IA em fim de semana não ganha 1,5x por padrão, mas ganha com iaMultFds ligado', () => {
    const fds: ContratoRegras = { ...contratoIA, id: 'c2', data_fechamento: '2026-06-13', data_protocolo: '2026-07-11' };
    // data_fechamento 13/06 é sábado -> mult dependeria do fds
    const sem = calcularParcelasMes({
      ymRef: '2026-07', contratosEvento: [fds], contagemFechamentos: contagem,
      nivelPorCloser: nivel, regras, settings: S,
    });
    expect(sem.find(p => p.etapa === 'fechamento')!.valor).toBeCloseTo(20);
    const com = calcularParcelasMes({
      ymRef: '2026-07', contratosEvento: [fds], contagemFechamentos: contagem,
      nivelPorCloser: nivel, regras, settings: { ...S, iaMultFds: true },
    });
    expect(com.find(p => p.etapa === 'fechamento')!.valor).toBeCloseTo(30);
  });
});

describe('estorno por desqualificação/desistência', () => {
  const PROD = 'amea';
  const LEVEL = 'n2';
  const CLOSER = 'ana';
  const regras = new RegrasIndex(
    [
      { product_id: PROD, career_level_id: LEVEL, etapa: 'fechamento', variante: null, valor: 20 },
      { product_id: PROD, career_level_id: LEVEL, etapa: 'protocolo', variante: null, valor: 20 },
    ],
    [{ product_id: PROD, career_level_id: LEVEL, meta_contratos: 20 }],
  );
  const nivel = new Map([[CLOSER, LEVEL as string | null]]);
  const contagem = new Map([[`${CLOSER}|${PROD}|2026-06`, 20]]); // meta batida em junho

  const base = {
    id: 'c1', closer_id: CLOSER, product_id: PROD, variante: null,
    data_fechamento: '2026-06-10', data_protocolo: null, data_pagamento_confirmado: null,
    nome_cliente: 'Cliente X',
  };

  it('desqualificado em mês POSTERIOR gera desconto do valor já creditado', () => {
    const estornos = calcularEstornosMes({
      ymRef: '2026-07',
      contratosDesqualificados: [{ ...base, status_qualificacao: 'desqualificado', data_desqualificacao: '2026-07-05' }],
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: DEFAULT_SETTINGS,
    });
    expect(estornos).toHaveLength(1);
    expect(estornos[0].valor).toBeCloseTo(-20); // devolve a parcela de fechamento de junho
    expect(estornos[0].estorno).toBe(true);
    expect(estornos[0].cliente).toBe('Cliente X');
  });

  it('desqualificado no MESMO mês não gera desconto (só deixa de receber)', () => {
    const estornos = calcularEstornosMes({
      ymRef: '2026-06',
      contratosDesqualificados: [{ ...base, status_qualificacao: 'desqualificado', data_desqualificacao: '2026-06-20' }],
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: DEFAULT_SETTINGS,
    });
    expect(estornos).toHaveLength(0);
  });

  it('estorna também a parcela de protocolo já paga', () => {
    const estornos = calcularEstornosMes({
      ymRef: '2026-08',
      contratosDesqualificados: [{
        ...base, data_protocolo: '2026-07-02',
        status_qualificacao: 'desistencia', data_desqualificacao: '2026-08-03',
      }],
      contagemFechamentos: contagem,
      nivelPorCloser: nivel,
      regras,
      settings: DEFAULT_SETTINGS,
    });
    const total = estornos.reduce((s, e) => s + e.valor, 0);
    expect(estornos).toHaveLength(2);       // fechamento (jun) + protocolo (jul)
    expect(total).toBeCloseTo(-40);
  });
});
