#!/usr/bin/env node
// Servidor MCP somente leitura do orçamento (spec 005). Lançado por
// actual-mcp-financeiro.mjs com as credenciais no ambiente do processo.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createFinancasServer } from '../src/server.ts';
import { openBudget } from '../src/source.ts';

// stdout é o canal JSON-RPC do MCP: qualquer log de biblioteca vai para stderr.
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);

const { ACTUAL_SERVER_URL, ACTUAL_SESSION_TOKEN, ACTUAL_BUDGET_SYNC_ID } =
  process.env;

if (!ACTUAL_SERVER_URL || !ACTUAL_SESSION_TOKEN || !ACTUAL_BUDGET_SYNC_ID) {
  process.stderr.write(
    'Configuração incompleta: use actual-mcp-financeiro.mjs.\n',
  );
  process.exit(1);
}

// Abre o orçamento em segundo plano: o MCP responde ao handshake na hora e
// cada ferramenta espera o download terminar (ou devolve o erro).
const ready = openBudget({
  url: ACTUAL_SERVER_URL,
  token: ACTUAL_SESSION_TOKEN,
  syncId: ACTUAL_BUDGET_SYNC_ID,
  budgetPassword: process.env.ACTUAL_BUDGET_PASSWORD || undefined,
  dataDir: process.env.FINANCAS_DATA_DIR ?? './data',
});
ready.catch(() => undefined);

const source = {
  loadTransactions: async range => (await ready).loadTransactions(range),
  listAccounts: async () => (await ready).listAccounts(),
  listCategories: async () => (await ready).listCategories(),
  close: async () => (await ready).close(),
};

const server = createFinancasServer(source);
await server.connect(new StdioServerTransport());

const shutdown = async () => {
  try {
    await source.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown);
