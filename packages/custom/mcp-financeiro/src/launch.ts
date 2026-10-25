// Monta o comando que sobe o NOSSO servidor MCP (somente leitura). Puro e
// testável: quem lê o Chaveiro e executa o processo é bin/actual-mcp-financeiro.mjs.

import { homedir } from 'node:os';
import { join } from 'node:path';

export type LaunchErrorCode =
  | 'missing-url'
  | 'missing-token'
  | 'missing-sync-id'
  | 'insecure-url'
  | 'invalid-url';

export class LaunchConfigError extends Error {
  readonly code: LaunchErrorCode;

  constructor(code: LaunchErrorCode, message: string) {
    super(message);
    this.name = 'LaunchConfigError';
    this.code = code;
  }
}

export type Credentials = {
  url: string;
  /** Token de sessão do Actual (a produção entra por login Google, sem senha). */
  token: string;
  syncId: string;
  /** Senha de criptografia ponta a ponta do orçamento, se houver. */
  budgetPassword?: string;
};

export type LaunchOptions = {
  /** Caminho absoluto do servidor (bin/servidor.mjs). */
  serverPath: string;
  ambientEnv?: Record<string, string | undefined>;
  home?: string;
};

export type LaunchSpec = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

const SECRET_KEYS = new Set(['ACTUAL_SESSION_TOKEN', 'ACTUAL_BUDGET_PASSWORD']);

// Só estas variáveis do ambiente do Pedro chegam ao processo filho.
const PASSTHROUGH_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL'];

function isLocalhost(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

function validateCredentials(credentials: Credentials): void {
  if (!credentials.url) {
    throw new LaunchConfigError(
      'missing-url',
      'URL do servidor do Actual não configurada no Chaveiro.',
    );
  }
  if (!credentials.token) {
    throw new LaunchConfigError(
      'missing-token',
      'Token de sessão do Actual não configurado no Chaveiro.',
    );
  }
  if (!credentials.syncId) {
    throw new LaunchConfigError(
      'missing-sync-id',
      'Sync ID do orçamento não configurado no Chaveiro.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(credentials.url);
  } catch {
    throw new LaunchConfigError('invalid-url', 'A URL do Actual é inválida.');
  }
  if (parsed.protocol !== 'https:' && !isLocalhost(parsed.hostname)) {
    throw new LaunchConfigError(
      'insecure-url',
      'A URL do Actual deve ser https (http só em localhost).',
    );
  }
}

export function buildLaunchSpec(
  credentials: Credentials,
  options: LaunchOptions,
): LaunchSpec {
  validateCredentials(credentials);

  const ambient = options.ambientEnv ?? process.env;
  const home = options.home ?? homedir();
  const workDir = join(home, '.cache', 'actual-financas-mcp');

  const env: Record<string, string> = {};
  for (const key of PASSTHROUGH_ENV) {
    const value = ambient[key];
    if (value !== undefined) env[key] = value;
  }

  Object.assign(env, {
    ACTUAL_SERVER_URL: credentials.url,
    ACTUAL_SESSION_TOKEN: credentials.token,
    ACTUAL_BUDGET_SYNC_ID: credentials.syncId,
    FINANCAS_DATA_DIR: join(workDir, 'data'),
  });
  if (credentials.budgetPassword) {
    env.ACTUAL_BUDGET_PASSWORD = credentials.budgetPassword;
  }

  return {
    command: 'node',
    args: [options.serverPath],
    cwd: workDir,
    env,
  };
}

/** Descrição legível para diagnóstico. Nunca inclui segredo. */
export function describeLaunch(spec: LaunchSpec): string {
  const envText = Object.entries(spec.env)
    .filter(([key]) => key.startsWith('ACTUAL_') || key.startsWith('FINANCAS_'))
    .map(([key, value]) => `${key}=${SECRET_KEYS.has(key) ? '***' : value}`)
    .join(' ');
  return `${spec.command} ${spec.args.join(' ')} (cwd=${spec.cwd}) [${envText}]`;
}
