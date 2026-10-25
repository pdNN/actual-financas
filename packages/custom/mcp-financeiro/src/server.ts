// Servidor MCP somente leitura sobre o orçamento do Actual (spec 005).
// Somente leitura por construção: as ferramentas só chamam `BudgetSource`, que
// não tem nenhuma operação de escrita. Toda resposta passa por `maskDeep`.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  comparePeriods,
  flowSummary,
  formatBRL,
  listTransactions,
  spendByCategory,
  uncategorizedList,
} from './analysis.ts';
import { maskDeep, maskPii } from './mask-pii.ts';
import type { BudgetSource } from './source.ts';

const MONEY_KEYS = new Set([
  'spent',
  'total',
  'amount',
  'delta',
  'current',
  'previous',
  'income',
  'expense',
  'leftover',
  'outflow',
  'balance',
  'uncategorizedInflows',
]);

/** Acrescenta `<campo>_brl` ("R$ 1.234,56") ao lado de cada valor em centavos. */
export function addBrl<T>(value: T): T {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node !== 'object' || node === null) return node;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(node)) {
      out[key] = walk(item);
      if (MONEY_KEYS.has(key) && typeof item === 'number') {
        out[`${key}_brl`] = formatBRL(item);
      }
    }
    return out;
  };
  return walk(value) as T;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato AAAA-MM-DD')
  .refine(
    value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)),
    'data inválida',
  );

const period = {
  inicio: isoDate.describe('Primeiro dia do período (AAAA-MM-DD), inclusive'),
  fim: isoDate.describe('Último dia do período (AAAA-MM-DD), inclusive'),
};

class InputError extends Error {}

function describeError(error: unknown): string {
  if (error instanceof InputError) return error.message;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const raw =
    error instanceof Error ? `${error.name} ${code} ${error.message}` : '';
  if (/token-expired|invalid or expired session token/i.test(raw)) {
    return 'O token de sessão do Actual expirou ou é inválido. Gere outro e atualize o Chaveiro.';
  }
  if (
    /network-failure|offline or unreachable|ECONN|ENOTFOUND|fetch failed/i.test(
      raw,
    )
  ) {
    return 'O servidor do Actual está inacessível.';
  }
  if (
    /missing-key|is encrypted|decrypt|invalid-password|wrong.?password/i.test(
      raw,
    )
  ) {
    return 'O orçamento é criptografado: guarde a senha dele no Chaveiro (conta budget-password do serviço actual-financas-mcp).';
  }
  if (/not.?found|file-not-found/i.test(raw)) {
    return 'Orçamento não encontrado (confira o Sync ID).';
  }
  return 'Falha ao consultar o orçamento do Actual.';
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function createFinancasServer(source: BudgetSource): McpServer {
  const server = new McpServer({ name: 'financas', version: '0.1.0' });

  const respond = async (run: () => Promise<unknown>) => {
    try {
      const data = maskDeep(addBrl(await run()));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          { type: 'text' as const, text: maskPii(describeError(error)) },
        ],
      };
    }
  };

  const validRange = (inicio: string, fim: string) => {
    if (inicio > fim) {
      throw new InputError(
        'Período invertido: o início deve ser anterior ou igual ao fim.',
      );
    }
  };

  server.registerTool(
    'contas',
    {
      title: 'Contas e saldos',
      description:
        'Lista as contas do orçamento com o saldo atual (valores em centavos, com _brl em reais). Não traz números de conta.',
      annotations: READ_ONLY,
    },
    () => respond(async () => ({ accounts: await source.listAccounts() })),
  );

  server.registerTool(
    'categorias',
    {
      title: 'Categorias',
      description:
        'Lista as categorias e seus grupos, indicando as de receita.',
      annotations: READ_ONLY,
    },
    () => respond(async () => ({ categories: await source.listCategories() })),
  );

  server.registerTool(
    'gasto_por_categoria',
    {
      title: 'Gasto por categoria',
      description:
        'Gasto de um período por categoria, do maior para o menor. Transferências entre contas e pagamento de fatura NÃO contam. Estorno reduz o gasto. Saída sem categoria vai em "Sem categoria". Se o período não tem nenhuma transação, devolve empty=true.',
      inputSchema: period,
      annotations: READ_ONLY,
    },
    ({ inicio, fim }) =>
      respond(async () => {
        validRange(inicio, fim);
        const rows = await source.loadTransactions({ start: inicio, end: fim });
        return spendByCategory(rows, { start: inicio, end: fim });
      }),
  );

  server.registerTool(
    'comparar_periodos',
    {
      title: 'Comparar dois períodos',
      description:
        'Compara o gasto por categoria entre um período atual e um anterior, com variação em centavos e em %, ordenado pela maior variação absoluta.',
      inputSchema: {
        inicio: period.inicio,
        fim: period.fim,
        inicio_anterior: isoDate.describe('Início do período de comparação'),
        fim_anterior: isoDate.describe('Fim do período de comparação'),
      },
      annotations: READ_ONLY,
    },
    ({ inicio, fim, inicio_anterior, fim_anterior }) =>
      respond(async () => {
        validRange(inicio, fim);
        validRange(inicio_anterior, fim_anterior);
        const start = inicio < inicio_anterior ? inicio : inicio_anterior;
        const end = fim > fim_anterior ? fim : fim_anterior;
        const rows = await source.loadTransactions({ start, end });
        return comparePeriods(
          rows,
          { start: inicio, end: fim },
          { start: inicio_anterior, end: fim_anterior },
        );
      }),
  );

  server.registerTool(
    'transacoes',
    {
      title: 'Transações',
      description:
        'Lista transações de um período, das de maior valor para as menores, com filtros opcionais por categoria (nome exato), estabelecimento e conta (trecho do nome). Exclui transferências.',
      inputSchema: {
        ...period,
        categoria: z.string().optional().describe('Nome da categoria'),
        estabelecimento: z
          .string()
          .optional()
          .describe('Trecho do nome do payee'),
        conta: z.string().optional().describe('Trecho do nome da conta'),
        limite: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Máximo de linhas (padrão 50)'),
      },
      annotations: READ_ONLY,
    },
    ({ inicio, fim, categoria, estabelecimento, conta, limite }) =>
      respond(async () => {
        validRange(inicio, fim);
        const rows = await source.loadTransactions({ start: inicio, end: fim });
        return listTransactions(rows, {
          start: inicio,
          end: fim,
          category: categoria,
          payee: estabelecimento,
          account: conta,
          limit: limite,
        });
      }),
  );

  server.registerTool(
    'sem_categoria',
    {
      title: 'Transações sem categoria',
      description:
        'Lista as transações sem categoria do período (sem transferências), das de maior valor para as menores, com a quantidade e o total de saídas.',
      inputSchema: period,
      annotations: READ_ONLY,
    },
    ({ inicio, fim }) =>
      respond(async () => {
        validRange(inicio, fim);
        const rows = await source.loadTransactions({ start: inicio, end: fim });
        return uncategorizedList(rows, { start: inicio, end: fim });
      }),
  );

  server.registerTool(
    'fluxo_e_sobra',
    {
      title: 'Receita, despesa e sobra',
      description:
        'Receita, despesa e sobra do período, sem transferências. Definição provisória: sobra = receita − despesa. A resposta traz a definição.',
      inputSchema: period,
      annotations: READ_ONLY,
    },
    ({ inicio, fim }) =>
      respond(async () => {
        validRange(inicio, fim);
        const rows = await source.loadTransactions({ start: inicio, end: fim });
        return flowSummary(rows, { start: inicio, end: fim });
      }),
  );

  return server;
}
