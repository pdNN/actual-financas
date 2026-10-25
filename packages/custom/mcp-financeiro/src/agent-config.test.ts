import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ALLOWED_TOOLS, qualify, SERVER_NAME } from './tool-surface';

const here = dirname(fileURLToPath(import.meta.url));
const agentPath = resolve(
  here,
  '../../../../.claude/agents/assistente-financeiro.md',
);

function loadAgent() {
  const raw = readFileSync(agentPath, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error('subagente sem cabeçalho');
  return { header: match[1], body: match[2], raw };
}

describe('assistente-financeiro.md', () => {
  it('lista exatamente as ferramentas permitidas, qualificadas', () => {
    const { header } = loadAgent();
    const tools = [...header.matchAll(/^\s+- (mcp__[A-Za-z0-9_-]+)$/gm)].map(
      m => m[1],
    );
    expect(tools.sort()).toEqual(ALLOWED_TOOLS.map(qualify).sort());
  });

  it('declara o servidor pelo lançador do repositório, sem segredo literal', () => {
    const { header } = loadAgent();
    expect(header).toContain(`${SERVER_NAME}:`);
    expect(header).toContain('actual-mcp-financeiro.mjs');
    expect(header).not.toContain('actual-mcp-server');
    expect(header).not.toMatch(/ACTUAL_PASSWORD|password\s*:|senha\s*:/i);
    expect(header).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('amarra os hooks PreToolUse e PostToolUse aos binários', () => {
    const { header } = loadAgent();
    expect(header).toMatch(/PreToolUse:/);
    expect(header).toMatch(/PostToolUse:/);
    expect(header).toContain('hook-guard.mjs');
    expect(header).toContain('hook-mask.mjs');
  });

  it('tem a seção Definições com a regra de sobra', () => {
    const { body } = loadAgent();
    expect(body).toMatch(/^## Definições/m);
    expect(body).toMatch(/sobra\s*=\s*receita\s*[−-]\s*despesa/i);
  });

  it('não cita nenhuma ferramenta de escrita como permitida', () => {
    const { raw } = loadAgent();
    const writers = [
      'transacoes_update',
      'transacoes_create',
      'transacoes_delete',
      'regras_create',
      'bank_sync',
    ];
    for (const writer of writers) {
      expect(raw).not.toMatch(
        new RegExp(`^\\s+- mcp__[A-Za-z0-9_-]*${writer}$`, 'm'),
      );
    }
  });
});
