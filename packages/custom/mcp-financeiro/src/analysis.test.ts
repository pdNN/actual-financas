import { describe, expect, it } from 'vitest';

import {
  comparePeriods,
  flowSummary,
  formatBRL,
  listTransactions,
  spendByCategory,
  uncategorizedList,
} from './analysis';
import type { TxRow } from './analysis';

let seq = 0;
function tx(partial: Partial<TxRow> & Pick<TxRow, 'date' | 'amount'>): TxRow {
  seq += 1;
  return {
    id: `t${seq}`,
    account: 'Conta Teste',
    payee: null,
    notes: null,
    category: null,
    categoryGroup: null,
    isIncomeCategory: false,
    transferId: null,
    isParent: false,
    ...partial,
  };
}

const expense = (
  date: string,
  amount: number,
  category: string,
  payee: string | null = null,
) => tx({ date, amount, category, categoryGroup: 'Despesas', payee });

const income = (date: string, amount: number) =>
  tx({
    date,
    amount,
    category: 'Salário',
    categoryGroup: 'Receitas',
    isIncomeCategory: true,
    payee: 'Empresa Teste',
  });

// Orçamento de teste do quickstart (valores em centavos).
const fixture: TxRow[] = [
  expense('2026-08-05', -30000, 'Mercado', 'Mercado Central'),
  expense('2026-08-19', -15000, 'Mercado', 'Mercado Central'),
  expense('2026-08-10', -8000, 'Transporte', 'Posto Azul'),
  expense('2026-08-22', -12000, 'Lazer', 'Cinema Real'),
  income('2026-08-05', 480000),
  expense('2026-09-04', -35000, 'Mercado', 'Mercado Central'),
  expense('2026-09-18', -20000, 'Mercado', 'Mercado Central'),
  expense('2026-09-12', -6000, 'Transporte', 'Posto Azul'),
  expense('2026-09-20', -25000, 'Lazer', 'Cinema Real'),
  expense('2026-09-25', -1000, 'Lazer', 'PIX JOAO'),
  income('2026-09-05', 500000),
  // pagamento de fatura: as duas pontas de uma transferência
  tx({ date: '2026-09-28', amount: -100000, transferId: 'x1' }),
  tx({
    date: '2026-09-28',
    amount: 100000,
    transferId: 'x2',
    account: 'Cartão Teste',
  }),
];

const sept = { start: '2026-09-01', end: '2026-09-30' };
const aug = { start: '2026-08-01', end: '2026-08-31' };

describe('formatBRL', () => {
  it('formata centavos em reais pt-BR', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(-1000)).toBe('-R$ 10,00');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('spendByCategory', () => {
  it('soma o gasto por categoria e ignora receita e transferência', () => {
    const result = spendByCategory(fixture, sept);
    const byName = Object.fromEntries(
      result.categories.map(c => [c.name, c.spent]),
    );
    expect(byName).toEqual({ Mercado: 55000, Lazer: 26000, Transporte: 6000 });
    expect(result.total).toBe(87000);
    expect(result.transactionCount).toBe(5);
  });

  it('ordena do maior gasto para o menor', () => {
    const names = spendByCategory(fixture, sept).categories.map(c => c.name);
    expect(names).toEqual(['Mercado', 'Lazer', 'Transporte']);
  });

  it('não conta transferência nem como gasto nem como entrada', () => {
    const result = spendByCategory(fixture, sept);
    expect(result.total).toBe(87000);
    expect(
      result.categories.find(c => c.name === 'Sem categoria'),
    ).toBeUndefined();
  });

  it('conta uma transação dividida pelos filhos, uma vez', () => {
    const rows = [
      tx({ date: '2026-09-02', amount: -10000, isParent: true }),
      expense('2026-09-02', -6000, 'Mercado'),
      expense('2026-09-02', -4000, 'Lazer'),
    ];
    const result = spendByCategory(rows, sept);
    expect(result.total).toBe(10000);
  });

  it('estorno reduz o gasto da categoria e não vira receita', () => {
    const rows = [
      expense('2026-09-02', -20000, 'Mercado'),
      tx({
        date: '2026-09-10',
        amount: 5000,
        category: 'Mercado',
        categoryGroup: 'Despesas',
      }),
    ];
    const result = spendByCategory(rows, sept);
    expect(result.categories[0]).toMatchObject({
      name: 'Mercado',
      spent: 15000,
    });
    expect(result.total).toBe(15000);
  });

  it('agrupa saída sem categoria em "Sem categoria"', () => {
    const rows = [tx({ date: '2026-09-02', amount: -7000, payee: 'Loja X' })];
    const result = spendByCategory(rows, sept);
    expect(result.categories).toEqual([
      expect.objectContaining({ name: 'Sem categoria', spent: 7000 }),
    ]);
    expect(result.uncategorized).toEqual({ count: 1, spent: 7000 });
  });

  it('período sem transação devolve vazio explícito, não zeros', () => {
    const result = spendByCategory(fixture, {
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(result.empty).toBe(true);
    expect(result.categories).toEqual([]);
  });

  it('respeita os limites do período, inclusive o último dia', () => {
    const rows = [
      expense('2026-09-30', -1000, 'Lazer'),
      expense('2026-10-01', -9999, 'Lazer'),
    ];
    expect(spendByCategory(rows, sept).total).toBe(1000);
  });
});

describe('comparePeriods', () => {
  it('compara por categoria com variação em centavos e %', () => {
    const result = comparePeriods(fixture, sept, aug);
    const lazer = result.categories.find(c => c.name === 'Lazer');
    const transporte = result.categories.find(c => c.name === 'Transporte');
    expect(lazer).toMatchObject({
      current: 26000,
      previous: 12000,
      delta: 14000,
    });
    expect(lazer?.percent).toBeCloseTo(116.7, 1);
    expect(transporte).toMatchObject({
      current: 6000,
      previous: 8000,
      delta: -2000,
    });
    expect(transporte?.percent).toBeCloseTo(-25.0, 1);
    expect(result.total).toMatchObject({
      current: 87000,
      previous: 65000,
      delta: 22000,
    });
    expect(result.total.percent).toBeCloseTo(33.8, 1);
  });

  it('ordena pela maior variação absoluta', () => {
    const names = comparePeriods(fixture, sept, aug).categories.map(
      c => c.name,
    );
    expect(names).toEqual(['Lazer', 'Mercado', 'Transporte']);
  });

  it('percentual é null quando o período anterior é zero', () => {
    const rows = [expense('2026-09-02', -1000, 'Lazer')];
    const result = comparePeriods(rows, sept, aug);
    expect(result.categories[0].percent).toBeNull();
  });
});

describe('flowSummary', () => {
  it('sobra = receita − despesa, sem transferências', () => {
    const result = flowSummary(fixture, sept);
    expect(result).toMatchObject({
      income: 500000,
      expense: 87000,
      leftover: 413000,
    });
  });

  it('declara a definição de sobra', () => {
    expect(flowSummary(fixture, sept).definition).toMatch(/receita.*despesa/i);
  });

  it('sobra negativa quando gasta mais do que recebe', () => {
    const rows = [
      income('2026-09-05', 10000),
      expense('2026-09-06', -25000, 'Lazer'),
    ];
    expect(flowSummary(rows, sept).leftover).toBe(-15000);
  });
});

describe('uncategorizedList', () => {
  const rows = [
    tx({ date: '2026-09-02', amount: -2000, payee: 'A' }),
    tx({ date: '2026-09-03', amount: -9000, payee: 'B' }),
    tx({ date: '2026-09-04', amount: 500, payee: 'C' }),
    tx({ date: '2026-09-05', amount: -30000, transferId: 'x' }),
    expense('2026-09-06', -1000, 'Lazer'),
  ];

  it('lista só o que não tem categoria, sem transferência, do maior para o menor', () => {
    const result = uncategorizedList(rows, sept);
    expect(result.items.map(i => i.payee)).toEqual(['B', 'A', 'C']);
    expect(result.count).toBe(3);
    expect(result.outflow).toBe(11000);
  });
});

describe('listTransactions', () => {
  it('filtra por categoria, ordena por valor e limita', () => {
    const result = listTransactions(fixture, {
      ...sept,
      category: 'Lazer',
      limit: 10,
    });
    expect(result.items.map(i => i.payee)).toEqual(['Cinema Real', 'PIX JOAO']);
  });

  it('filtra por payee sem diferenciar maiúsculas', () => {
    const result = listTransactions(fixture, { ...sept, payee: 'mercado' });
    expect(result.items).toHaveLength(2);
  });

  it('respeita o limite', () => {
    expect(listTransactions(fixture, { ...sept, limit: 2 }).items).toHaveLength(
      2,
    );
  });

  it('não inclui transferência', () => {
    expect(
      listTransactions(fixture, sept).items.some(
        i => Math.abs(i.amount) === 100000,
      ),
    ).toBe(false);
  });
});
