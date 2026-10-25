import { describe, expect, it } from 'vitest';

import { criarAutorizadas } from './autorizadas';
import { criarIdentidade } from './google-identity';
import type { PedidoAuthorize } from './google-identity';
import { deriveKey } from './tokens';

const CHAVE = deriveKey(Buffer.alloc(48, 5), 'estado-login');
const GOOGLE = {
  clientId: 'cli.apps.googleusercontent.com',
  clientSecret: 'segredo-google-de-teste',
};
const CALLBACK = 'https://servico.exemplo/google/callback';

const pedido: PedidoAuthorize = {
  clientId: 'cid',
  clientNome: 'Claude',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  codeChallenge: 'desafio-pkce',
  state: 'estado-do-cliente',
  resource: 'https://servico.exemplo/mcp',
  scopes: ['financas'],
};

function idToken(claims: Record<string, unknown>): string {
  const b = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256' })}.${b(claims)}.assinatura-do-google`;
}

type Corpo = Record<string, string>;

function montar(
  opcoes: {
    claims?: (nonce: string) => Record<string, unknown>;
    resposta?: Response;
    agora?: () => number;
  } = {},
) {
  const chamadas: { url: string; corpo: Corpo }[] = [];
  let nonceDoPedido = '';
  const identidade = criarIdentidade({
    google: GOOGLE,
    callbackUrl: CALLBACK,
    chaveEstado: CHAVE,
    autorizadas: criarAutorizadas({
      ler: async () =>
        JSON.stringify({
          pedro: 'pedro@exemplo.com',
          julia: 'julia@exemplo.com',
        }),
      ttlMs: 30_000,
      agora: () => 0,
    }),
    agora: opcoes.agora ?? (() => 1_700_000_000_000),
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      const corpo = Object.fromEntries(new URLSearchParams(String(init?.body)));
      chamadas.push({ url: String(url), corpo });
      if (opcoes.resposta) return opcoes.resposta;
      const claims = (opcoes.claims ?? defaultClaims)(nonceDoPedido);
      return new Response(
        JSON.stringify({
          id_token: idToken(claims),
          access_token: 'at-google',
          refresh_token: 'rt-google',
        }),
        {
          status: 200,
        },
      );
    }) as typeof fetch,
  });
  const iniciar = (p: PedidoAuthorize = pedido) => {
    const r = identidade.iniciar(p);
    const url = new URL(r.urlGoogle);
    nonceDoPedido = url.searchParams.get('nonce') ?? '';
    return { ...r, url, state: url.searchParams.get('state') ?? '' };
  };
  return { identidade, iniciar, chamadas };
}

const defaultClaims = (nonce: string) => ({
  iss: 'https://accounts.google.com',
  aud: GOOGLE.clientId,
  exp: 1_700_000_000 + 3600,
  nonce,
  email: 'Pedro@exemplo.com',
  email_verified: true,
});

describe('iniciar', () => {
  it('monta a URL do Google com code flow, nonce, state e só os escopos openid email', () => {
    const { url, cookie } = montar().iniciar();
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('client_id')).toBe(GOOGLE.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('nonce')?.length).toBeGreaterThan(20);
    expect(url.searchParams.get('state')?.length).toBeGreaterThan(40);
    expect(url.searchParams.get('prompt')).toBe('select_account');
    expect(cookie.length).toBeGreaterThan(20);
    expect(url.toString()).not.toContain(GOOGLE.clientSecret);
  });
});

describe('concluir', () => {
  it('aceita o fluxo feliz e devolve a pessoa (a chave) e o pedido original, sem e-mail', async () => {
    const t = montar();
    const { state, cookie } = t.iniciar();
    const r = await t.identidade.concluir({
      code: 'codigo-google',
      state,
      cookie,
    });
    expect(r).toMatchObject({ ok: true, pessoa: 'pedro', pedido });
    expect(JSON.stringify(r)).not.toContain('pedro@exemplo.com');
    expect(JSON.stringify(r)).not.toContain('at-google');
  });

  it('troca o código no endpoint do Google com o segredo do cliente, só no servidor', async () => {
    const t = montar();
    const { state, cookie } = t.iniciar();
    await t.identidade.concluir({ code: 'codigo-google', state, cookie });
    expect(t.chamadas).toHaveLength(1);
    expect(t.chamadas[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(t.chamadas[0].corpo).toMatchObject({
      code: 'codigo-google',
      client_id: GOOGLE.clientId,
      client_secret: GOOGLE.clientSecret,
      redirect_uri: CALLBACK,
      grant_type: 'authorization_code',
    });
  });

  it('recusa state adulterado, vencido ou sem cookie igual ao do navegador', async () => {
    const t = montar();
    const { state, cookie } = t.iniciar();
    expect(
      await t.identidade.concluir({ code: 'c', state: `${state}x`, cookie }),
    ).toEqual({ ok: false, motivo: 'estado' });
    expect(
      await t.identidade.concluir({ code: 'c', state, cookie: undefined }),
    ).toEqual({ ok: false, motivo: 'estado' });
    expect(
      await t.identidade.concluir({ code: 'c', state, cookie: `${cookie}x` }),
    ).toEqual({ ok: false, motivo: 'estado' });
    expect(
      await t.identidade.concluir({ code: 'c', state: undefined, cookie }),
    ).toEqual({ ok: false, motivo: 'estado' });
    expect(t.chamadas).toHaveLength(0);

    let agora = 1_700_000_000_000;
    const vencido = montar({ agora: () => agora });
    const s = vencido.iniciar();
    agora += 11 * 60_000;
    expect(
      await vencido.identidade.concluir({
        code: 'c',
        state: s.state,
        cookie: s.cookie,
      }),
    ).toEqual({
      ok: false,
      motivo: 'estado',
    });
  });

  it('recusa erro devolvido pelo Google e falha na troca do código', async () => {
    const t = montar();
    const { state, cookie } = t.iniciar();
    expect(
      await t.identidade.concluir({ error: 'access_denied', state, cookie }),
    ).toEqual({ ok: false, motivo: 'google' });
    const ruim = montar({
      resposta: new Response('{"error":"invalid_grant"}', { status: 400 }),
    });
    const s = ruim.iniciar();
    expect(
      await ruim.identidade.concluir({
        code: 'c',
        state: s.state,
        cookie: s.cookie,
      }),
    ).toEqual({ ok: false, motivo: 'google' });
  });

  it.each([
    [
      'nonce diferente',
      (n: string) => ({ ...defaultClaims(n), nonce: 'outro' }),
    ],
    [
      'audiência diferente',
      (n: string) => ({ ...defaultClaims(n), aud: 'outro-cliente' }),
    ],
    [
      'emissor diferente',
      (n: string) => ({ ...defaultClaims(n), iss: 'https://evil.example' }),
    ],
    [
      'token vencido',
      (n: string) => ({ ...defaultClaims(n), exp: 1_699_999_000 }),
    ],
    [
      'e-mail não verificado',
      (n: string) => ({ ...defaultClaims(n), email_verified: false }),
    ],
    ['sem e-mail', (n: string) => ({ ...defaultClaims(n), email: undefined })],
  ])('recusa id_token com %s', async (_nome, claims) => {
    const t = montar({ claims });
    const { state, cookie } = t.iniciar();
    expect(await t.identidade.concluir({ code: 'c', state, cookie })).toEqual({
      ok: false,
      motivo: 'google',
    });
  });

  it('aceita o emissor sem esquema (accounts.google.com)', async () => {
    const t = montar({
      claims: n => ({ ...defaultClaims(n), iss: 'accounts.google.com' }),
    });
    const { state, cookie } = t.iniciar();
    expect((await t.identidade.concluir({ code: 'c', state, cookie })).ok).toBe(
      true,
    );
  });

  it('conta Google válida fora da lista: pessoa-nao-autorizada, sem expor o e-mail', async () => {
    const t = montar({
      claims: n => ({ ...defaultClaims(n), email: 'estranho@exemplo.com' }),
    });
    const { state, cookie } = t.iniciar();
    const r = await t.identidade.concluir({ code: 'c', state, cookie });
    expect(r).toEqual({ ok: false, motivo: 'pessoa-nao-autorizada' });
    expect(JSON.stringify(r)).not.toContain('estranho');
  });
});
