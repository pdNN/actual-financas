// Erros das ferramentas e as mensagens que o usuário vê (spec 010, RF-022).
// Dois ambientes: o local (Claude Code no Mac, credencial no Chaveiro — textos da
// 005) e o remoto (nuvem, sem Chaveiro, "avise o Pedro").

export type Ambiente = 'local' | 'remoto';

/** Parâmetro inválido: a mensagem é da própria ferramenta e vai ao usuário. */
export class InputError extends Error {}

export class OrcamentoCarregandoError extends Error {
  constructor() {
    super('Orçamento ainda carregando.');
    this.name = 'OrcamentoCarregandoError';
  }
}

export class LimiteConsultasError extends Error {
  constructor() {
    super('Limite de consultas atingido.');
    this.name = 'LimiteConsultasError';
  }
}

const TOKEN_INVALIDO = /token-expired|invalid or expired session token/i;
const REDE =
  /network-failure|offline or unreachable|ECONN|ENOTFOUND|fetch failed/i;
const CRIPTOGRAFADO =
  /missing-key|is encrypted|decrypt|invalid-password|wrong.?password/i;
const NAO_ENCONTRADO = /not.?found|file-not-found/i;

export function describeError(
  error: unknown,
  ambiente: Ambiente = 'local',
): string {
  if (error instanceof InputError) {
    return error.message;
  }
  if (error instanceof OrcamentoCarregandoError) {
    return 'O orçamento está carregando; tente de novo em instantes.';
  }
  if (error instanceof LimiteConsultasError) {
    return 'Muitas consultas seguidas. Aguarde um minuto.';
  }

  // Erros de bibliotecas chegam como objetos quaisquer: só lemos nome, código e mensagem.
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const raw =
    error instanceof Error ? `${error.name} ${code} ${error.message}` : '';

  if (TOKEN_INVALIDO.test(raw)) {
    return ambiente === 'remoto'
      ? 'O assistente perdeu o acesso ao Actual. Avise o Pedro para renovar a credencial.'
      : 'O token de sessão do Actual expirou ou é inválido. Gere outro e atualize o Chaveiro.';
  }
  if (REDE.test(raw)) {
    return ambiente === 'remoto'
      ? 'O servidor do Actual está inacessível agora. Tente de novo em alguns minutos.'
      : 'O servidor do Actual está inacessível.';
  }
  if (CRIPTOGRAFADO.test(raw)) {
    return ambiente === 'remoto'
      ? 'O orçamento é criptografado e o assistente não tem a senha dele. Avise o Pedro.'
      : 'O orçamento é criptografado: guarde a senha dele no Chaveiro (conta budget-password do serviço actual-financas-mcp).';
  }
  if (NAO_ENCONTRADO.test(raw)) {
    return 'Orçamento não encontrado (confira o Sync ID).';
  }
  return 'Falha ao consultar o orçamento do Actual.';
}
