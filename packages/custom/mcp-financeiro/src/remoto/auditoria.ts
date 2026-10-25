// Log de auditoria (spec 010, contracts/auditoria.md). Lista FECHADA de campos:
// o que não está aqui não sai, por mais que alguém tente passar (princípio VIII:
// nada de descrição, valor, e-mail, IP, parâmetros, code, state ou token).

const EVENTOS = new Set([
  'acesso_concedido',
  'acesso_renovado',
  'acesso_encerrado',
  'acesso_expirado',
  'consulta',
  'recusado',
  'configuracao_invalida',
  'estado_conflito',
]);

const RESULTADOS = new Set(['ok', 'erro', 'negado', 'limitado']);

const MOTIVOS = new Set([
  'sem-token',
  'token-invalido',
  'audiencia',
  'expirado',
  'encerrado',
  'pessoa-removida',
  'pessoa-nao-autorizada',
  'reuso-de-refresh',
  'limite',
  'manual',
  'todos',
  'teto',
  'redirect-recusado',
  'revogado-em-massa',
  'origem',
]);

const MAX_TEXTO = 60;

/** Rótulo é texto livre do casal: tira e-mail, IP e sequências longas de dígitos. */
function limparRotulo(valor: string): string {
  return valor
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[removido]')
    .replace(/\d[\d .-]{5,}\d/g, '[removido]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXTO);
}

/**
 * Monta uma linha JSON ou devolve `null` se o evento não obedece ao contrato.
 * A entrada é deliberadamente `Record<string, unknown>`: vem de código que pode
 * carregar campos extras, e é justamente isso que esta função descarta.
 */
export function montarLinha(
  entrada: Record<string, unknown>,
  agora: Date,
): string | null {
  const {
    evento,
    resultado,
    motivo,
    rotulo,
    ferramenta,
    duracao_ms,
    variavel,
  } = entrada;
  if (typeof evento !== 'string' || !EVENTOS.has(evento)) return null;
  if (typeof resultado !== 'string' || !RESULTADOS.has(resultado)) return null;
  if (
    motivo !== undefined &&
    (typeof motivo !== 'string' || !MOTIVOS.has(motivo))
  ) {
    return null;
  }

  const linha: Record<string, string | number> = {
    ts: agora.toISOString(),
    servico: 'financas-mcp',
    evento,
  };
  if (typeof rotulo === 'string') {
    const limpo = limparRotulo(rotulo);
    if (limpo !== '') linha.rotulo = limpo;
  }
  if (typeof ferramenta === 'string' && /^[a-z0-9_]{1,60}$/.test(ferramenta)) {
    linha.ferramenta = ferramenta;
  }
  linha.resultado = resultado;
  if (typeof motivo === 'string') linha.motivo = motivo;
  if (
    typeof duracao_ms === 'number' &&
    Number.isInteger(duracao_ms) &&
    duracao_ms >= 0
  ) {
    linha.duracao_ms = duracao_ms;
  }
  if (typeof variavel === 'string' && /^[A-Z0-9_]{1,60}$/.test(variavel)) {
    linha.variavel = variavel;
  }
  return JSON.stringify(linha);
}

export type Auditoria = {
  registrar(evento: Record<string, unknown>): boolean;
};

export function criarAuditoria(
  opcoes: { escrever?: (linha: string) => void; agora?: () => Date } = {},
): Auditoria {
  const escrever =
    opcoes.escrever ??
    ((linha: string) => void process.stdout.write(`${linha}\n`));
  const agora = opcoes.agora ?? (() => new Date());
  return {
    registrar(evento) {
      const linha = montarLinha(evento, agora());
      if (linha === null) return false;
      escrever(linha);
      return true;
    },
  };
}
