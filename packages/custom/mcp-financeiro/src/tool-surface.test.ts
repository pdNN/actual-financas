import { describe, expect, it } from 'vitest';

import {
  ALLOWED_TOOLS,
  decidePreToolUse,
  isAllowed,
  qualify,
  SERVER_NAME,
} from './tool-surface';

const WRITE_SUFFIX =
  /(_create|_update|_delete|_merge|_import|_export|_close|_reopen|_switch|_setAmount|_setCarryover|_holdForNextMonth|_resetHold|_transfer|_batch|_create_batch|_create_or_update|_bank_sync|_session_list|_session_close)$/;

describe('ALLOWED_TOOLS', () => {
  it('não contém nenhuma ferramenta com cara de escrita ou administração', () => {
    const offenders = ALLOWED_TOOLS.filter(name => WRITE_SUFFIX.test(name));
    expect(offenders).toEqual([]);
  });

  it('tem as 7 ferramentas de leitura do servidor próprio, sem repetição', () => {
    expect(ALLOWED_TOOLS).toHaveLength(7);
    expect(new Set(ALLOWED_TOOLS).size).toBe(7);
  });

  it('inclui as ferramentas centrais das três histórias', () => {
    expect(ALLOWED_TOOLS).toEqual(
      expect.arrayContaining([
        'gasto_por_categoria',
        'comparar_periodos',
        'fluxo_e_sobra',
        'sem_categoria',
        'transacoes',
      ]),
    );
  });

  it('não expõe nenhuma ferramenta de escrita conhecida do Actual', () => {
    expect(ALLOWED_TOOLS.some(name => name.startsWith('actual_'))).toBe(false);
  });
});

describe('decidePreToolUse', () => {
  it('permite ferramenta listada do nosso servidor', () => {
    const decision = decidePreToolUse({
      tool_name: qualify('gasto_por_categoria'),
    });
    expect(decision.kind).toBe('allow');
  });

  it('nega ferramenta de escrita do nosso servidor, com motivo', () => {
    const decision = decidePreToolUse({
      tool_name: `mcp__${SERVER_NAME}__transacoes_update`,
    });
    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' ? decision.reason : '').toMatch(
      /somente leitura/i,
    );
  });

  it('nega nome inventado do nosso servidor', () => {
    expect(
      decidePreToolUse({ tool_name: `mcp__${SERVER_NAME}__qualquer_coisa` })
        .kind,
    ).toBe('deny');
  });

  it('não opina sobre ferramentas de outros servidores', () => {
    expect(decidePreToolUse({ tool_name: 'mcp__outro__transacoes' }).kind).toBe(
      'not-applicable',
    );
    expect(decidePreToolUse({ tool_name: 'Bash' }).kind).toBe('not-applicable');
  });

  it('nega quando a entrada é ilegível (falha fechada)', () => {
    expect(decidePreToolUse(null).kind).toBe('deny');
    expect(decidePreToolUse({}).kind).toBe('deny');
  });
});

describe('isAllowed', () => {
  it('aceita nome qualificado e nome puro da lista', () => {
    expect(isAllowed('contas')).toBe(true);
    expect(isAllowed(qualify('contas'))).toBe(true);
    expect(isAllowed('contas_delete')).toBe(false);
  });
});
