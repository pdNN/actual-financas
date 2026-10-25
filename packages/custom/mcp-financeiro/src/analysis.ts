// Contabilidade do orçamento: funções puras sobre linhas de transação.
// Valores em centavos inteiros. Regras (spec 005, research.md):
//  - transferência = transação com `transferId`; nunca é gasto nem receita;
//  - transação dividida conta pelos filhos; o pai (`isParent`) é ignorado;
//  - estorno (valor positivo em categoria de despesa) reduz o gasto;
//  - receita = valor em categoria de receita.

export type TxRow = {
  id: string;
  date: string; // AAAA-MM-DD
  amount: number; // centavos; saída negativa
  account: string;
  payee: string | null;
  notes: string | null;
  category: string | null;
  categoryGroup: string | null;
  isIncomeCategory: boolean;
  transferId: string | null;
  isParent: boolean;
};

export type Period = { start: string; end: string };

export const UNCATEGORIZED = 'Sem categoria';
export const LEFTOVER_DEFINITION =
  'sobra = receita − despesa (definição provisória)';

export function formatBRL(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = (abs % 100).toString().padStart(2, '0');
  return `${sign}R$ ${reais},${centavos}`;
}

function inPeriod(row: TxRow, period: Period): boolean {
  return row.date >= period.start && row.date <= period.end;
}

function relevant(rows: TxRow[], period: Period): TxRow[] {
  return rows.filter(row => !row.isParent && inPeriod(row, period));
}

const isTransfer = (row: TxRow) => row.transferId !== null;

export type CategorySpend = {
  name: string;
  group: string | null;
  spent: number;
  count: number;
};

export type SpendResult = {
  period: Period;
  empty: boolean;
  categories: CategorySpend[];
  total: number;
  transactionCount: number;
  uncategorized: { count: number; spent: number };
  uncategorizedInflows: number;
};

export function spendByCategory(rows: TxRow[], period: Period): SpendResult {
  const inRange = relevant(rows, period);
  const buckets = new Map<string, CategorySpend>();
  let uncategorizedCount = 0;
  let uncategorizedSpent = 0;
  let uncategorizedInflows = 0;
  let transactionCount = 0;

  for (const row of inRange) {
    if (isTransfer(row) || row.isIncomeCategory) continue;

    if (row.category === null) {
      if (row.amount > 0) {
        uncategorizedInflows += row.amount;
        continue;
      }
      uncategorizedCount += 1;
      uncategorizedSpent += -row.amount;
    }

    const name = row.category ?? UNCATEGORIZED;
    const bucket = buckets.get(name) ?? {
      name,
      group: row.categoryGroup,
      spent: 0,
      count: 0,
    };
    bucket.spent += -row.amount;
    bucket.count += 1;
    buckets.set(name, bucket);
    transactionCount += 1;
  }

  const categories = [...buckets.values()].sort((a, b) => b.spent - a.spent);
  return {
    period,
    empty: inRange.length === 0,
    categories,
    total: categories.reduce((sum, c) => sum + c.spent, 0),
    transactionCount,
    uncategorized: { count: uncategorizedCount, spent: uncategorizedSpent },
    uncategorizedInflows,
  };
}

export type CategoryComparison = {
  name: string;
  current: number;
  previous: number;
  delta: number;
  percent: number | null;
};

export type ComparisonResult = {
  current: Period;
  previous: Period;
  categories: CategoryComparison[];
  total: Omit<CategoryComparison, 'name'>;
};

function percentChange(current: number, previous: number): number | null {
  return previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}

export function comparePeriods(
  rows: TxRow[],
  current: Period,
  previous: Period,
): ComparisonResult {
  const now = spendByCategory(rows, current);
  const before = spendByCategory(rows, previous);
  const names = new Set([
    ...now.categories.map(c => c.name),
    ...before.categories.map(c => c.name),
  ]);
  const spentOf = (result: SpendResult, name: string) =>
    result.categories.find(c => c.name === name)?.spent ?? 0;

  const categories = [...names]
    .map(name => {
      const cur = spentOf(now, name);
      const prev = spentOf(before, name);
      return {
        name,
        current: cur,
        previous: prev,
        delta: cur - prev,
        percent: percentChange(cur, prev),
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    current,
    previous,
    categories,
    total: {
      current: now.total,
      previous: before.total,
      delta: now.total - before.total,
      percent: percentChange(now.total, before.total),
    },
  };
}

export type FlowResult = {
  period: Period;
  empty: boolean;
  income: number;
  expense: number;
  leftover: number;
  definition: string;
};

export function flowSummary(rows: TxRow[], period: Period): FlowResult {
  const inRange = relevant(rows, period);
  const income = inRange
    .filter(row => !isTransfer(row) && row.isIncomeCategory)
    .reduce((sum, row) => sum + row.amount, 0);
  const { total: expense } = spendByCategory(rows, period);
  return {
    period,
    empty: inRange.length === 0,
    income,
    expense,
    leftover: income - expense,
    definition: LEFTOVER_DEFINITION,
  };
}

export type TxItem = {
  id: string;
  date: string;
  amount: number;
  account: string;
  payee: string | null;
  category: string | null;
  notes: string | null;
};

const toItem = (row: TxRow): TxItem => ({
  id: row.id,
  date: row.date,
  amount: row.amount,
  account: row.account,
  payee: row.payee,
  category: row.category,
  notes: row.notes,
});

const byMagnitude = (a: TxRow, b: TxRow) =>
  Math.abs(b.amount) - Math.abs(a.amount);

export type UncategorizedResult = {
  period: Period;
  count: number;
  outflow: number;
  items: TxItem[];
};

export function uncategorizedList(
  rows: TxRow[],
  period: Period,
): UncategorizedResult {
  const items = relevant(rows, period)
    .filter(row => row.category === null && !isTransfer(row))
    .sort(byMagnitude);
  return {
    period,
    count: items.length,
    outflow: items
      .filter(row => row.amount < 0)
      .reduce((sum, row) => sum - row.amount, 0),
    items: items.map(toItem),
  };
}

export type ListFilter = Period & {
  category?: string;
  payee?: string;
  account?: string;
  limit?: number;
};

export function listTransactions(
  rows: TxRow[],
  filter: ListFilter,
): { period: Period; count: number; items: TxItem[] } {
  const same = (a: string | null, b: string) =>
    a !== null && a.toLowerCase() === b.toLowerCase();
  const contains = (a: string | null, b: string) =>
    a !== null && a.toLowerCase().includes(b.toLowerCase());

  const matches = relevant(rows, filter)
    .filter(row => !isTransfer(row))
    .filter(row =>
      filter.category ? same(row.category, filter.category) : true,
    )
    .filter(row => (filter.payee ? contains(row.payee, filter.payee) : true))
    .filter(row =>
      filter.account ? contains(row.account, filter.account) : true,
    )
    .sort(byMagnitude);

  return {
    period: { start: filter.start, end: filter.end },
    count: matches.length,
    items: matches.slice(0, filter.limit ?? 50).map(toItem),
  };
}
