import { describe, it, expect } from 'vitest';
import { faixaPrazo, ordenarTarefas, filtrarTarefas, progressoChecklist, type Tarefa } from '@/lib/tarefas';

const base: Tarefa = {
  id: '1', titulo: 'Ligar cliente', descricao: null, setor_id: 's1', responsavel_id: 'u1', responsavel_nome: 'Ana',
  criado_por: 'u1', criado_por_nome: 'Ana', prioridade: 'normal', status: 'a_fazer', prazo: null, hora: null,
  cliente_nome: 'João', processo_numero: null, checklist: [], recorrencia: 'nenhuma', concluida_em: null,
  criado_em: '2026-11-01T10:00:00Z', atualizado_em: '2026-11-01T10:00:00Z',
};
const t = (x: Partial<Tarefa>): Tarefa => ({ ...base, ...x });
const HOJE = '2026-11-12';

describe('faixaPrazo', () => {
  it('classifica pelo prazo', () => {
    expect(faixaPrazo(t({ prazo: '2026-11-10' }), HOJE)).toBe('atrasada');
    expect(faixaPrazo(t({ prazo: HOJE }), HOJE)).toBe('hoje');
    expect(faixaPrazo(t({ prazo: '2026-11-13' }), HOJE)).toBe('amanha');
    expect(faixaPrazo(t({ prazo: '2026-11-19' }), HOJE)).toBe('semana');
    expect(faixaPrazo(t({ prazo: '2026-11-20' }), HOJE)).toBe('depois');
    expect(faixaPrazo(t({ prazo: null }), HOJE)).toBe('sem_prazo');
  });
  it('concluída nunca fica atrasada', () => {
    expect(faixaPrazo(t({ prazo: '2026-01-01', status: 'concluida' }), HOJE)).toBe('finalizada');
  });
});

describe('ordenarTarefas', () => {
  it('prazo primeiro, depois prioridade, sem prazo no fim', () => {
    const r = ordenarTarefas([
      t({ id: 'a', prazo: null, prioridade: 'urgente' }),
      t({ id: 'b', prazo: '2026-11-15', prioridade: 'baixa' }),
      t({ id: 'c', prazo: '2026-11-15', prioridade: 'urgente' }),
      t({ id: 'd', prazo: '2026-11-12' }),
    ]);
    expect(r.map(x => x.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});

describe('filtrarTarefas', () => {
  const lista = [
    t({ id: '1' }),
    t({ id: '2', responsavel_id: 'u2', setor_id: 's2' }),
    t({ id: '3', responsavel_id: null }),
    t({ id: '4', status: 'concluida' }),
    t({ id: '5', status: 'cancelada' }),
  ];
  const f = { setorId: 'todos' as const, responsavel: 'todos', busca: '', mostrarConcluidas: false, usuarioId: 'u1' };
  it('esconde concluídas e canceladas por padrão', () => {
    expect(filtrarTarefas(lista, f).map(x => x.id)).toEqual(['1', '2', '3']);
    expect(filtrarTarefas(lista, { ...f, mostrarConcluidas: true }).map(x => x.id)).toEqual(['1', '2', '3', '4']);
  });
  it('minhas, por setor, sem responsável e busca', () => {
    expect(filtrarTarefas(lista, { ...f, responsavel: 'minhas' }).map(x => x.id)).toEqual(['1']);
    expect(filtrarTarefas(lista, { ...f, setorId: 's2' }).map(x => x.id)).toEqual(['2']);
    expect(filtrarTarefas(lista, { ...f, responsavel: 'sem_responsavel' }).map(x => x.id)).toEqual(['3']);
    expect(filtrarTarefas(lista, { ...f, responsavel: 'u2' }).map(x => x.id)).toEqual(['2']);
    expect(filtrarTarefas(lista, { ...f, busca: 'joão' }).length).toBe(3);
  });
});

it('progressoChecklist', () => {
  expect(progressoChecklist([{ texto: 'a', feito: true }, { texto: 'b', feito: false }])).toEqual({ feitos: 1, total: 2 });
  expect(progressoChecklist(null)).toEqual({ feitos: 0, total: 0 });
});
