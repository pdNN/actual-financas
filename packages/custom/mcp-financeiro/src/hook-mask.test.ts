import { describe, expect, it } from 'vitest';

import { buildPostToolUseOutput } from './hook-mask';

describe('buildPostToolUseOutput', () => {
  it('devolve updatedToolOutput com o texto mascarado e a mesma estrutura', () => {
    const output = buildPostToolUseOutput({
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__financas__actual_transactions_filter',
      tool_response: [
        { type: 'text', text: 'PIX cartão 4539148803436467 R$ 10,00' },
      ],
    });
    expect(output).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: [
          { type: 'text', text: 'PIX cartão [CARTAO] R$ 10,00' },
        ],
      },
    });
  });

  it('funciona com resposta em objeto', () => {
    const output = buildPostToolUseOutput({
      tool_name: 'mcp__financas__x',
      tool_response: { content: [{ type: 'text', text: 'conta 12345-6' }] },
    });
    expect(output?.hookSpecificOutput.updatedToolOutput).toEqual({
      content: [{ type: 'text', text: 'conta [NUM]' }],
    });
  });

  it('não emite saída quando nada mudou (resposta já limpa)', () => {
    expect(
      buildPostToolUseOutput({
        tool_name: 'mcp__financas__x',
        tool_response: [{ type: 'text', text: 'R$ 10,00' }],
      }),
    ).toBeNull();
  });

  it('em entrada inesperada devolve null e não lança', () => {
    for (const input of [null, undefined, 'texto', 3, {}]) {
      expect(() => buildPostToolUseOutput(input)).not.toThrow();
      expect(buildPostToolUseOutput(input)).toBeNull();
    }
  });
});
