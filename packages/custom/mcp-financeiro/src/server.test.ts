import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import type { TxRow } from './analysis';
import { createFinancasServer } from './server';
import type { BudgetSource } from './source';
import { ALLOWED_TOOLS } from './tool-surface';

const row = (
  partial: Partial<TxRow> & Pick<TxRow, 'id' | 'date' | 'amount'>,
): TxRow => ({
  account: 'Conta Teste',
  payee: null,
  notes: null,
  category: null,
  categoryGroup: null,
  isIncomeCategory: false,
  transferId: null,
  isParent: false,
  ...partial,
});

const rows: TxRow[] = [
  row({
    id: '1',
    date: '2026-09-04',
    amount: -35000,
    category: 'Mercado',
    categoryGroup: 'Despesas',
    payee: 'Mercado Central',
  }),
  row({
    id: '2',
    date: '2026-09-25',
    amount: -1000,
    category: 'Lazer',
    categoryGroup: 'Despesas',
    payee: 'PIX JOAO',
    notes: 'CPF 123.456.789-09',
  }),
  row({
    id: '3',
    date: '2026-09-05',
    amount: 500000,
    category: 'Salário',
    categoryGroup: 'Receitas',
    isIncomeCategory: true,
  }),
  row({ id: '4', date: '2026-09-28', amount: -100000, transferId: 'x' }),
];

const source: BudgetSource = {
  loadTransactions: async () => rows,
  listAccounts: async () => [
    { id: 'a1', name: 'Conta Teste', balance: 123456, closed: false },
  ],
  listCategories: async () => [
    { name: 'Mercado', group: 'Despesas', isIncome: false },
  ],
  close: async () => undefined,
};

async function connect() {
  const server = createFinancasServer(source);
  const client = new Client({ name: 'teste', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return content.map(c => c.text).join('\n');
}

describe('createFinancasServer', () => {
  it('publica exatamente a lista fechada de ferramentas, todas de leitura', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map(t => t.name).sort()).toEqual([...ALLOWED_TOOLS].sort());
  });

  it('todas as ferramentas declaram somente leitura', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
  });

  it('gasto_por_categoria soma certo, sem transferência, e acrescenta valores em reais', async () => {
    const client = await connect();
    const text = await call(client, 'gasto_por_categoria', {
      inicio: '2026-09-01',
      fim: '2026-09-30',
    });
    const data = JSON.parse(text);
    expect(data.total).toBe(36000);
    expect(data.total_brl).toBe('R$ 360,00');
    expect(data.categories[0]).toMatchObject({
      name: 'Mercado',
      spent: 35000,
      spent_brl: 'R$ 350,00',
    });
  });

  it('fluxo_e_sobra declara a definição', async () => {
    const client = await connect();
    const data = JSON.parse(
      await call(client, 'fluxo_e_sobra', {
        inicio: '2026-09-01',
        fim: '2026-09-30',
      }),
    );
    expect(data).toMatchObject({
      income: 500000,
      expense: 36000,
      leftover: 464000,
    });
    expect(data.definition).toMatch(/receita.*despesa/i);
  });

  it('CPF nas notas chega ao Claude; conta e cartão não (constituição 1.2.0)', async () => {
    const client = await connect();
    const text = await call(client, 'transacoes', {
      inicio: '2026-09-01',
      fim: '2026-09-30',
      categoria: 'Lazer',
    });
    expect(text).toContain('123.456.789-09');
    expect(text).not.toContain('[CPF]');
  });

  it('período sem dados é dito explicitamente', async () => {
    const client = await connect();
    const data = JSON.parse(
      await call(client, 'gasto_por_categoria', {
        inicio: '2027-01-01',
        fim: '2027-01-31',
      }),
    );
    expect(data.empty).toBe(true);
  });

  it('rejeita data inválida e período invertido', async () => {
    const client = await connect();
    const bad = await client.callTool({
      name: 'gasto_por_categoria',
      arguments: { inicio: '2026-09-31x', fim: '2026-09-30' },
    });
    expect(bad.isError).toBe(true);
    const inverted = await client.callTool({
      name: 'gasto_por_categoria',
      arguments: { inicio: '2026-09-30', fim: '2026-09-01' },
    });
    expect(inverted.isError).toBe(true);
  });

  it('erro da fonte vira mensagem sem vazar segredo', async () => {
    const failing: BudgetSource = {
      ...source,
      loadTransactions: async () => {
        throw new Error('token abc-secreto expirou 123.456.789-09');
      },
    };
    const server = createFinancasServer(failing);
    const client = new Client({ name: 't', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const result = await client.callTool({
      name: 'sem_categoria',
      arguments: { inicio: '2026-09-01', fim: '2026-09-30' },
    });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0].text;
    expect(text).not.toContain('abc-secreto');
    expect(text).not.toContain('123.456.789-09');
  });

  it('orçamento criptografado sem senha orienta a guardar a senha no Chaveiro', async () => {
    const encrypted: BudgetSource = {
      ...source,
      listAccounts: async () => {
        throw Object.assign(
          new Error('File Casinha is encrypted. Please provide a password.'),
          { code: 'missing-key' },
        );
      },
    };
    const server = createFinancasServer(encrypted);
    const client = new Client({ name: 't', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const result = await client.callTool({ name: 'contas', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0].text;
    expect(text).toContain('budget-password');
  });
});
