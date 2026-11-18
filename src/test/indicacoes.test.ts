import { describe, expect, it } from 'vitest';
import { resumoDoMes, valorPadrao, doMes, type Indicacao } from '@/lib/indicacoes';

const base = (o: Partial<Indicacao>): Indicacao => ({
  id: Math.random().toString(), indicador_id: 'a', indicador_nome: 'Ana', cliente_nome: 'X', telefone: null,
  produto: 'bpc', data_indicacao: '2026-11-05', status: 'indicado', data_fechamento: null, valor: null,
  pago: false, pago_em: null, observacao: null, ...o,
});

describe('comissão por indicação', () => {
  it('valores por produto', () => {
    expect(valorPadrao('auxilio_acidente')).toBe(45);
    expect(valorPadrao('bpc')).toBe(45);
    expect(valorPadrao('aposentadoria')).toBe(45);
    expect(valorPadrao('pensao_morte')).toBe(45);
    expect(valorPadrao('salario_maternidade')).toBe(40);
    expect(valorPadrao('auxilio_doenca')).toBe(40);
  });

  it('só conta o que virou contrato, no mês do fechamento', () => {
    const lista = [
      base({ status: 'fechado', data_fechamento: '2026-11-10', valor: 45 }),
      base({ status: 'fechado', data_fechamento: '2026-11-12', produto: 'salario_maternidade', valor: 40, pago: true }),
      base({ status: 'indicado' }),
      base({ status: 'nao_fechou' }),
      base({ status: 'fechado', data_indicacao: '2026-10-28', data_fechamento: '2026-11-02', valor: 45 }),
      base({ status: 'fechado', data_fechamento: '2026-12-01', valor: 45 }),
      base({ indicador_id: 'b', indicador_nome: 'Bia', status: 'fechado', data_fechamento: '2026-11-03', valor: 45 }),
    ];
    const r = resumoDoMes(lista, '2026-11');
    const ana = r.find(x => x.indicadorId === 'a')!;
    expect(ana.fechadas).toBe(3);
    expect(ana.total).toBe(130);
    expect(ana.pago).toBe(40);
    expect(ana.aPagar).toBe(90);
    expect(ana.indicadas).toBe(5);
    expect(r[0].nome).toBe('Ana');
    expect(doMes(lista, '2026-11').length).toBe(7);
  });
});
