#!/usr/bin/env node
// Serviço remoto do assistente financeiro (spec 010): MCP por HTTP + OAuth.
// Roda no Cloud Run. Toda a configuração vem do ambiente e dos secrets montados.

import { readFile } from 'node:fs/promises';

import { tokenDoMetadata } from '../src/remoto/estado-gcs.ts';
import { montarServicoRemoto } from '../src/remoto/servico.ts';
import { openBudget } from '../src/source.ts';

const arquivoPessoas = process.env.ARQUIVO_PESSOAS ?? '/segredos/pessoas.json';

const { app } = montarServicoRemoto({
  env: process.env,
  abrirOrcamento: actual =>
    openBudget({
      url: actual.serverUrl,
      token: actual.sessionToken,
      syncId: actual.syncId,
      budgetPassword: actual.budgetPassword,
      dataDir: process.env.FINANCAS_DATA_DIR ?? '/tmp/financas-data',
    }),
  lerPessoas: () => readFile(arquivoPessoas, 'utf8').catch(() => undefined),
  obterTokenGcs: () => tokenDoMetadata(),
});

const porta = Number(process.env.PORT ?? 8080);
const servidor = app.listen(porta, '0.0.0.0', () => {
  process.stderr.write(`financas-mcp ouvindo na porta ${porta}\n`);
});

const encerrar = () => servidor.close(() => process.exit(0));
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
