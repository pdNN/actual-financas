// Montagem de um serviço remoto completo em memória para os testes de contrato
// e de segurança (spec 010). Google e Actual são falsos; todo o resto é real.

import { createHash, randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createFinancasServer } from '../server';
import type { BudgetSource } from '../source';

import { estadoVazio } from './acessos';
import type { Estado } from './acessos';
import { criarApp } from './app';
import { criarAuditoria } from './auditoria';
import { criarAutorizadas } from './autorizadas';
import { loadConfig } from './config';
import type { Config } from './config';
import { criarEstadoEmMemoria, criarGerenciadorEstado } from './estado-store';
import type { EstadoStore } from './estado-store';

export const PESSOAS = {
  pedro: 'pedro@exemplo.com',
  julia: 'julia@exemplo.com',
};

export const SEGREDO_MESTRE = Buffer.alloc(48, 11).toString('base64');

export function configDeTeste(extra: Record<string, string> = {}): Config {
  const r = loadConfig({
    URL_PUBLICA: 'https://servico.exemplo',
    ACTUAL_SERVER_URL: 'https://actual.exemplo',
    ACTUAL_SESSION_TOKEN: 'TOKEN-SECRETO-DO-ACTUAL',
    ACTUAL_BUDGET_SYNC_ID: 'sync',
    GOOGLE_CLIENT_ID: 'cli.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'SEGREDO-GOOGLE',
    SEGREDO_MESTRE,
    BUCKET_ESTADO: 'bucket',
    ...extra,
  });
  if (!r.ok) throw new Error(`config de teste inválida: ${r.falhas.join(',')}`);
  return r.config;
}

export function fonteFalsa(): BudgetSource & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    async loadTransactions() {
      chamadas.push('loadTransactions');
      return [
        {
          id: '1',
          date: '2026-09-04',
          amount: -35000,
          account: 'Conta',
          payee: 'Mercado',
          notes: 'CPF 123.456.789-09',
          category: 'Mercado',
          categoryGroup: 'Despesas',
          isIncomeCategory: false,
          transferId: null,
          isParent: false,
        },
      ];
    },
    async listAccounts() {
      chamadas.push('listAccounts');
      return [{ id: 'a1', name: 'Conta', balance: 1000, closed: false }];
    },
    async listCategories() {
      chamadas.push('listCategories');
      return [{ name: 'Mercado', group: 'Despesas', isIncome: false }];
    },
    async close() {
      return undefined;
    },
  };
}

function idToken(claims: Record<string, unknown>): string {
  const b = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256' })}.${b(claims)}.sig`;
}

export type Servico = {
  url: string;
  config: Config;
  store: EstadoStore;
  fonte: ReturnType<typeof fonteFalsa>;
  auditoria: string[];
  /** E-mail que o "Google" vai afirmar no próximo login. */
  definirEmailGoogle(email: string): void;
  /** O nonce que o "Google" devolverá no id_token (o teste lê do redirecionamento). */
  definirNonceGoogle(nonce: string): void;
  definirPessoas(json: string | undefined): void;
  avancarTempo(ms: number): void;
  fechar(): Promise<void>;
};

export async function subirServico(
  opcoes: {
    config?: Config;
    estadoInicial?: Estado;
    pessoas?: string | undefined;
    fabricaMcp?: () => ReturnType<typeof createFinancasServer>;
  } = {},
): Promise<Servico> {
  const config = opcoes.config ?? configDeTeste();
  const store = criarEstadoEmMemoria(opcoes.estadoInicial ?? estadoVazio());
  let agora = Date.now();
  const gerenciador = criarGerenciadorEstado(store, {
    ttlMs: 30_000,
    agora: () => agora,
  });
  let pessoas: string | undefined =
    'pessoas' in opcoes ? opcoes.pessoas : JSON.stringify(PESSOAS);
  const autorizadas = criarAutorizadas({
    ler: async () => pessoas,
    ttlMs: 0,
    agora: () => agora,
  });
  const auditoria: string[] = [];
  const fonte = fonteFalsa();
  let emailGoogle = PESSOAS.pedro;
  let ultimoNonce = '';

  const app = criarApp({
    config,
    gerenciador,
    autorizadas,
    auditoria: criarAuditoria({
      escrever: l => auditoria.push(l),
      agora: () => new Date(agora),
    }),
    fabricaMcp:
      opcoes.fabricaMcp ??
      (() => createFinancasServer(fonte, { ambiente: 'remoto' })),
    agora: () => new Date(agora),
    fetchImpl: (async () => {
      return new Response(
        JSON.stringify({
          id_token: idToken({
            iss: 'https://accounts.google.com',
            aud: config.google.clientId,
            exp: Math.floor(agora / 1000) + 3600,
            nonce: ultimoNonce,
            email: emailGoogle,
            email_verified: true,
          }),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch,
  });

  const servidor: Server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const porta = (servidor.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${porta}`,
    config,
    store,
    fonte,
    auditoria,
    definirEmailGoogle: e => {
      emailGoogle = e;
    },
    definirNonceGoogle: n => {
      ultimoNonce = n;
    },
    definirPessoas: p => {
      pessoas = p;
    },
    avancarTempo: ms => {
      agora += ms;
    },
    fechar: () => new Promise(r => servidor.close(() => r())),
  };
}

// ---------------------------------------------------------------------------
// Cliente OAuth genérico (sem fornecedor): faz a dança completa por HTTP.
// ---------------------------------------------------------------------------

export const REDIRECT_CLAUDE = 'https://claude.ai/api/mcp/auth_callback';

export type Conexao = {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  verifier: string;
};

export type OpcoesConexao = {
  rotulo?: string;
  redirectUri?: string;
  verifierDoToken?: string;
  /** Para testar PKCE errado. */
};

export async function registrarCliente(
  s: Servico,
  redirectUri = REDIRECT_CLAUDE,
): Promise<string> {
  const r = await fetch(`${s.url}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      client_name: 'Claude',
    }),
  });
  if (r.status !== 201) throw new Error(`registro falhou: ${r.status}`);
  return ((await r.json()) as { client_id: string }).client_id;
}

export function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function cookieDe(r: Response): string {
  const bruto = r.headers.get('set-cookie') ?? '';
  return bruto.split(';')[0] ?? '';
}

/** Passos 1–5 (até a tela de consentimento). Devolve o HTML e o necessário para o POST. */
export async function irAteConsentimento(
  s: Servico,
  clientId: string,
  p: ReturnType<typeof pkce>,
  redirectUri = REDIRECT_CLAUDE,
) {
  const auth = new URL(`${s.url}/authorize`);
  auth.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: 'estado-do-cliente',
    resource: s.config.resourceUrl.href,
    scope: 'financas',
  }).toString();
  const r1 = await fetch(auth, { redirect: 'manual' });
  const local = r1.headers.get('location') ?? '';
  if (r1.status !== 302 || !local.startsWith('https://accounts.google.com/')) {
    return { etapa: 'authorize' as const, resposta: r1, html: await r1.text() };
  }
  const google = new URL(local);
  s.definirNonceGoogle(google.searchParams.get('nonce') ?? '');
  const cookie = cookieDe(r1);
  const r2 = await fetch(
    `${s.url}/google/callback?code=codigo-google&state=${encodeURIComponent(google.searchParams.get('state') ?? '')}`,
    {
      headers: { cookie },
      redirect: 'manual',
    },
  );
  const html = await r2.text();
  return { etapa: 'callback' as const, resposta: r2, html, cookie };
}

export function camposOcultos(html: string): { csrf: string; sessao: string } {
  const pega = (nome: string) =>
    new RegExp(`name="${nome}" value="([^"]*)"`).exec(html)?.[1] ?? '';
  return { csrf: pega('csrf'), sessao: pega('sessao') };
}

export async function conectar(
  s: Servico,
  o: OpcoesConexao = {},
): Promise<Conexao> {
  const clientId = await registrarCliente(s, o.redirectUri);
  const p = pkce();
  const passo = await irAteConsentimento(s, clientId, p, o.redirectUri);
  if (passo.etapa !== 'callback' || passo.resposta.status !== 200) {
    throw new Error(
      `login não chegou ao consentimento (${passo.resposta.status})`,
    );
  }
  const { csrf, sessao } = camposOcultos(passo.html);
  const r3 = await fetch(`${s.url}/consentimento`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: passo.cookie,
    },
    body: new URLSearchParams({
      csrf,
      sessao,
      rotulo: o.rotulo ?? 'celular do Pedro',
    }),
    redirect: 'manual',
  });
  const retorno = new URL(r3.headers.get('location') ?? 'x:');
  const code = retorno.searchParams.get('code');
  if (r3.status !== 302 || !code) {
    throw new Error(`consentimento falhou (${r3.status})`);
  }
  const r4 = await fetch(`${s.url}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: o.verifierDoToken ?? p.verifier,
      redirect_uri: o.redirectUri ?? REDIRECT_CLAUDE,
      client_id: clientId,
      resource: s.config.resourceUrl.href,
    }),
  });
  const json = (await r4.json()) as Record<string, unknown>;
  if (r4.status !== 200) {
    throw Object.assign(new Error('troca de código falhou'), {
      corpo: json,
      status: r4.status,
    });
  }
  return {
    clientId,
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token as string,
    expiresIn: json.expires_in as number,
    verifier: p.verifier,
  };
}

export async function renovar(
  s: Servico,
  c: { clientId: string; refreshToken: string },
) {
  return fetch(`${s.url}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: c.refreshToken,
      client_id: c.clientId,
    }),
  });
}

export function chamarMcp(
  s: Servico,
  token: string | null,
  corpo: unknown,
  extra: Record<string, string> = {},
) {
  return fetch(`${s.url}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: JSON.stringify(corpo),
  });
}

export const INICIALIZAR = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'teste', version: '1' },
  },
};
export const LISTAR_FERRAMENTAS = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
};
export const chamarFerramenta = (
  nome: string,
  args: Record<string, unknown> = {},
) => ({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: { name: nome, arguments: args },
});
