#!/usr/bin/env node
// Hook PostToolUse: mascara dados sensíveis na resposta das ferramentas MCP.
// Falha fechada: se algo der errado, a resposta é suprimida (nunca passa crua).
import { buildPostToolUseOutput } from '../src/hook-mask.ts';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

try {
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  const output = buildPostToolUseOutput(input);
  if (output) process.stdout.write(JSON.stringify(output));
} catch {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput:
          '[resposta suprimida: falha ao mascarar dados sensíveis]',
      },
    }),
  );
}
