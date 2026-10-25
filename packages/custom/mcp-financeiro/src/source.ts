// Adaptador de leitura sobre a API do Actual. É a ÚNICA peça que fala com o
// servidor do Actual, e só usa funções de leitura: não existe aqui nenhum
// caminho para criar, alterar ou apagar dado do orçamento.

import * as actual from 'actual-api-client';

import type { TxRow } from './analysis.ts';

export type AccountItem = {
  id: string;
  name: string;
  balance: number | null;
  closed: boolean;
};

export type CategoryItem = {
  name: string;
  group: string | null;
  isIncome: boolean;
};

export type BudgetSource = {
  loadTransactions(range: { start: string; end: string }): Promise<TxRow[]>;
  listAccounts(): Promise<AccountItem[]>;
  listCategories(): Promise<CategoryItem[]>;
  close(): Promise<void>;
};

export type SourceConfig = {
  url: string;
  token: string;
  syncId: string;
  budgetPassword?: string;
  dataDir: string;
};

type AqlRow = Record<string, unknown>;

function pick(row: AqlRow, flat: string, nested: [string, string]): unknown {
  if (flat in row) return row[flat];
  const parent = row[nested[0]];
  if (typeof parent === 'object' && parent !== null) {
    return (parent as AqlRow)[nested[1]];
  }
  return undefined;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export function toTxRow(row: AqlRow): TxRow {
  return {
    id: String(row.id),
    date: String(row.date),
    amount: Number(row.amount),
    account: text(pick(row, 'account.name', ['account', 'name'])) ?? '',
    payee: text(pick(row, 'payee.name', ['payee', 'name'])),
    notes: text(row.notes),
    category: text(pick(row, 'category.name', ['category', 'name'])),
    categoryGroup: text(
      pick(row, 'category.group.name', ['category', 'group']),
    ),
    isIncomeCategory:
      pick(row, 'category.is_income', ['category', 'is_income']) === true,
    transferId: text(row.transfer_id),
    isParent: row.is_parent === true,
  };
}

export async function openBudget(config: SourceConfig): Promise<BudgetSource> {
  await actual.init({
    dataDir: config.dataDir,
    serverURL: config.url,
    sessionToken: config.token,
  });
  await actual.downloadBudget(
    config.syncId,
    config.budgetPassword ? { password: config.budgetPassword } : undefined,
  );

  return {
    async loadTransactions(range) {
      const query = actual
        .q('transactions')
        .filter({
          $and: [
            { date: { $gte: range.start } },
            { date: { $lte: range.end } },
          ],
        })
        .select([
          'id',
          'date',
          'amount',
          'notes',
          'transfer_id',
          'is_parent',
          'account.name',
          'payee.name',
          'category.name',
          'category.group.name',
          'category.is_income',
        ]);
      const result = (await actual.aqlQuery(query)) as { data: AqlRow[] };
      return result.data.map(toTxRow);
    },

    async listAccounts() {
      const accounts = (await actual.getAccounts()) as {
        id: string;
        name: string;
        closed?: boolean;
      }[];
      const items: AccountItem[] = [];
      for (const account of accounts) {
        let balance: number | null = null;
        try {
          balance = (await actual.getAccountBalance(account.id)) as number;
        } catch {
          balance = null;
        }
        items.push({
          id: account.id,
          name: account.name,
          balance,
          closed: account.closed === true,
        });
      }
      return items;
    },

    async listCategories() {
      const groups = (await actual.getCategoryGroups()) as {
        name: string;
        is_income?: boolean;
        categories?: { name: string; is_income?: boolean }[];
      }[];
      return groups.flatMap(group =>
        (group.categories ?? []).map(category => ({
          name: category.name,
          group: group.name,
          isIncome: category.is_income === true || group.is_income === true,
        })),
      );
    },

    async close() {
      await actual.shutdown();
    },
  };
}
