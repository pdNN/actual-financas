// Adaptador do hook PreToolUse: nega qualquer ferramenta do nosso servidor MCP
// que não esteja na lista fechada (somente leitura, camada extra do plano D-2).

import { decidePreToolUse } from './tool-surface.ts';

export type PreToolUseOutput = {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision: 'deny';
    permissionDecisionReason: string;
  };
};

/** `null` = deixa seguir (permitida ou de outro servidor). */
export function buildPreToolUseOutput(input: unknown): PreToolUseOutput | null {
  const decision = decidePreToolUse(input);
  if (decision.kind !== 'deny') return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: decision.reason,
    },
  };
}
