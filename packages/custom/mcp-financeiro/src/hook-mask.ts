// Adaptador do hook PostToolUse: limpa a resposta das ferramentas do servidor
// MCP antes de o Claude vê-la. Formato de saída: ver research.md (spike S-1).

import { maskDeep } from './mask-pii.ts';

export type PostToolUseOutput = {
  hookSpecificOutput: {
    hookEventName: 'PostToolUse';
    updatedToolOutput: unknown;
  };
};

function sameContent(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Devolve `null` quando não há o que trocar (nada mudou ou entrada inesperada). */
export function buildPostToolUseOutput(
  input: unknown,
): PostToolUseOutput | null {
  if (typeof input !== 'object' || input === null) return null;
  const response = (input as { tool_response?: unknown }).tool_response;
  if (response === undefined) return null;

  const masked = maskDeep(response);
  if (sameContent(response, masked)) return null;

  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedToolOutput: masked,
    },
  };
}
