import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

import { ALLOWED_TOOLS } from './tool-surface';

// Teste de fumaça do processo real (bin/servidor.mjs) por stdio: o que o
// Claude Code vê de verdade. Cobre o handshake, a lista de ferramentas e o erro
// tratado quando o Actual está inacessível, sem vazar o token.

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, '../bin/servidor.mjs');
const TOKEN = 'tok-secreto-fumaca-123';

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

async function closedPortUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>(ok => server.close(() => ok()));
  return `http://127.0.0.1:${port}`;
}

async function connect(env: Record<string, string>) {
  const dataDir = mkdtempSync(join(tmpdir(), 'financas-smoke-'));
  cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: { ...env, FINANCAS_DATA_DIR: dataDir },
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => (stderr += String(chunk)));
  const client = new Client({ name: 'smoke', version: '0.0.0' });
  cleanups.push(() => client.close());
  await client.connect(transport);
  return { client, stderr: () => stderr };
}

describe('bin/servidor.mjs (processo real)', () => {
  it('responde ao handshake, lista as 7 ferramentas e trata Actual inacessível', async () => {
    const { client, stderr } = await connect({
      ACTUAL_SERVER_URL: await closedPortUrl(),
      ACTUAL_SESSION_TOKEN: TOKEN,
      ACTUAL_BUDGET_SYNC_ID: 'sync-teste',
    });

    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name).sort()).toEqual(
      [...ALLOWED_TOOLS].sort(),
    );
    expect(tools).toHaveLength(7);

    const result = await client.callTool({ name: 'contas', arguments: {} });
    expect(result.isError).toBe(true);
    const text = JSON.stringify(result.content);
    expect(text).toContain('inacessível');
    expect(text).not.toContain(TOKEN);
    expect(stderr()).not.toContain(TOKEN);
  }, 30_000);

  it('sem as credenciais no ambiente, sai com código 1 e diz o que fazer', async () => {
    const child = spawn(process.execPath, [serverPath], {
      env: { PATH: process.env.PATH ?? '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => (stdout += String(chunk)));
    child.stderr.on('data', chunk => (stderr += String(chunk)));
    const code = await new Promise<number | null>(ok => child.on('exit', ok));
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('actual-mcp-financeiro.mjs');
  }, 15_000);
});
