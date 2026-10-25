import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { montarServicoRemoto } from './servico';
import { configDeTeste, fonteFalsa } from './testes-util';

// Teste de fumaça da montagem real do serviço (a que bin/servidor-remoto.mjs usa):
// config → estado → autorizadas → app, só com Google e Actual falsos.

let servidor: Server | undefined;
afterEach(async () => {
  await new Promise<void>(ok => (servidor ? servidor.close(() => ok()) : ok()));
  servidor = undefined;
});

async function subir(env: Record<string, string | undefined>) {
  const montado = montarServicoRemoto({
    env,
    abrirOrcamento: async () => ({
      ...fonteFalsa(),
      sync: async () => undefined,
    }),
    lerPessoas: async () => JSON.stringify({ pedro: 'pedro@exemplo.com' }),
    obterTokenGcs: async () => 'token-falso',
    estadoEmMemoria: true,
    escrever: () => undefined,
  });
  servidor = await new Promise<Server>(ok => {
    const s = montado.app.listen(0, '127.0.0.1', () => ok(s));
  });
  return {
    montado,
    url: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`,
  };
}

const envOk = () => {
  const c = configDeTeste();
  return {
    URL_PUBLICA: c.publicUrl.href,
    ACTUAL_SERVER_URL: c.actual.serverUrl,
    ACTUAL_SESSION_TOKEN: c.actual.sessionToken,
    ACTUAL_BUDGET_SYNC_ID: c.actual.syncId,
    GOOGLE_CLIENT_ID: c.google.clientId,
    GOOGLE_CLIENT_SECRET: c.google.clientSecret,
    SEGREDO_MESTRE: c.segredoMestre.toString('base64'),
    BUCKET_ESTADO: c.bucketEstado,
  };
};

describe('montarServicoRemoto', () => {
  it('com configuração válida: /saude 200, /mcp sem token 401 com WWW-Authenticate, descoberta 200', async () => {
    const { url } = await subir(envOk());
    expect((await fetch(`${url}/saude`)).status).toBe(200);
    const r = await fetch(`${url}/mcp`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('resource_metadata=');
    expect(
      (await fetch(`${url}/.well-known/oauth-protected-resource`)).status,
    ).toBe(200);
  });

  it('com configuração inválida: sobe em modo de recusa total e registra só o NOME da variável', async () => {
    const linhas: string[] = [];
    const montado = montarServicoRemoto({
      env: {
        ...envOk(),
        SEGREDO_MESTRE: 'curto',
        ACTUAL_SESSION_TOKEN: undefined,
      },
      abrirOrcamento: async () => ({
        ...fonteFalsa(),
        sync: async () => undefined,
      }),
      lerPessoas: async () => undefined,
      obterTokenGcs: async () => 'x',
      estadoEmMemoria: true,
      escrever: l => linhas.push(l),
    });
    servidor = await new Promise<Server>(ok => {
      const s = montado.app.listen(0, '127.0.0.1', () => ok(s));
    });
    const url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    expect(montado.configValida).toBe(false);
    expect((await fetch(`${url}/saude`)).status).toBe(200);
    for (const caminho of ['/mcp', '/authorize', '/token', '/register']) {
      const r = await fetch(`${url}${caminho}`, { method: 'POST', body: '{}' });
      expect(r.status).toBe(503);
    }
    const log = linhas.join('\n');
    expect(log).toContain('configuracao_invalida');
    expect(log).toContain('SEGREDO_MESTRE');
    expect(log).toContain('ACTUAL_SESSION_TOKEN');
    expect(log).not.toContain('curto');
  });
});
