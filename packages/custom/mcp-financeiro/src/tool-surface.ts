// Lista fechada das ferramentas do nosso servidor MCP (somente leitura).
// Fonte: specs/005-servidor-mcp-financeiro/contracts/tool-surface.md (emenda D-1).

/** Nome do servidor MCP no cabeçalho do subagente. Compõe `mcp__<nome>__<ferramenta>`. */
export const SERVER_NAME = 'financas';

const PREFIX = `mcp__${SERVER_NAME}__`;

export const ALLOWED_TOOLS = [
  'contas',
  'categorias',
  'gasto_por_categoria',
  'comparar_periodos',
  'transacoes',
  'sem_categoria',
  'fluxo_e_sobra',
] as const;

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_TOOLS);

export function qualify(toolName: string): string {
  return `${PREFIX}${toolName}`;
}

/** Aceita o nome puro (`actual_x`) ou o qualificado (`mcp__financas__actual_x`). */
export function isAllowed(toolName: string): boolean {
  const bare = toolName.startsWith(PREFIX)
    ? toolName.slice(PREFIX.length)
    : toolName;
  return ALLOWED_SET.has(bare);
}

export type PreToolUseDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'not-applicable' };

/**
 * Decide o PreToolUse. Falha fechada: entrada ilegível é negada, e qualquer
 * ferramenta do nosso servidor fora da lista também. Ferramentas de outros
 * servidores não são da nossa conta.
 */
export function decidePreToolUse(input: unknown): PreToolUseDecision {
  const toolName =
    typeof input === 'object' && input !== null
      ? (input as { tool_name?: unknown }).tool_name
      : undefined;

  if (typeof toolName !== 'string' || toolName === '') {
    return {
      kind: 'deny',
      reason: 'Entrada do hook ilegível; por segurança a chamada foi negada.',
    };
  }

  if (!toolName.startsWith(PREFIX)) {
    return { kind: 'not-applicable' };
  }

  if (isAllowed(toolName)) {
    return { kind: 'allow' };
  }

  return {
    kind: 'deny',
    reason:
      'Esta versão é somente leitura: a ferramenta não está na lista permitida. ' +
      'Para alterar o orçamento, faça no Actual.',
  };
}
