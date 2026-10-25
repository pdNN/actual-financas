#!/usr/bin/env node
// Hook PreToolUse: nega ferramenta do servidor MCP fora da lista de leitura.
// Falha fechada: entrada ilegível ou erro interno também negam.
import { buildPreToolUseOutput } from '../src/hook-guard.ts';

const deny = reason =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

try {
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const output = buildPreToolUseOutput(input);
  if (output) process.stdout.write(JSON.stringify(output));
} catch {
  process.stdout.write(
    deny('Falha ao avaliar a chamada; negada por segurança.'),
  );
}
