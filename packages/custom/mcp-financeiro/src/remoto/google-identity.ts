// Login pelo Google (OIDC, fluxo "authorization code") — spec 010, R-5.
// O Google só diz QUEM é a pessoa. Os tokens dele são descartados na hora e o
// e-mail nunca é gravado nem logado: só a chave da pessoa na lista de autorizadas.

import { randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { Autorizadas } from './autorizadas.ts';
import { signDocument, verifyDocument } from './tokens.ts';

export const COOKIE_LOGIN = 'financas_login';
const VALIDADE_ESTADO_S = 600;

const pedidoSchema = z.object({
  clientId: z.string(),
  clientNome: z.string(),
  redirectUri: z.string(),
  codeChallenge: z.string(),
  state: z.string().optional(),
  resource: z.string().optional(),
  scopes: z.array(z.string()),
});

export type PedidoAuthorize = z.infer<typeof pedidoSchema>;

const estadoSchema = z.object({
  p: pedidoSchema,
  nonce: z.string(),
  bind: z.string(),
  exp: z.number(),
});

export type ResultadoLogin =
  | { ok: true; pessoa: string; pedido: PedidoAuthorize; bind: string }
  | { ok: false; motivo: 'estado' | 'google' | 'pessoa-nao-autorizada' };

export type Identidade = {
  iniciar(pedido: PedidoAuthorize): { urlGoogle: string; cookie: string };
  concluir(entrada: {
    code?: string;
    state?: string;
    error?: string;
    cookie?: string;
  }): Promise<ResultadoLogin>;
};

type Dependencias = {
  google: { clientId: string; clientSecret: string };
  callbackUrl: string;
  chaveEstado: Buffer;
  autorizadas: Autorizadas;
  /** Relógio em milissegundos. */
  agora: () => number;
  fetchImpl?: typeof fetch;
};

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  exp: z.number(),
  nonce: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
});

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * O `id_token` chega direto do endpoint de token do Google, por TLS: a assinatura
 * dispensa verificação (OIDC Core §3.1.3.7). Conferimos as claims.
 */
function lerClaims(idToken: unknown): z.infer<typeof claimsSchema> | null {
  if (typeof idToken !== 'string') {
    return null;
  }
  const corpo = idToken.split('.')[1];
  if (!corpo) {
    return null;
  }
  try {
    const lidas = claimsSchema.safeParse(
      JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')),
    );
    return lidas.success ? lidas.data : null;
  } catch {
    return null;
  }
}

export function criarIdentidade(deps: Dependencias): Identidade {
  const http = deps.fetchImpl ?? fetch;

  return {
    iniciar(pedido) {
      const nonce = randomBytes(16).toString('base64url');
      const bind = randomBytes(24).toString('base64url');
      const exp = Math.floor(deps.agora() / 1000) + VALIDADE_ESTADO_S;
      const state = signDocument(
        { p: pedido, nonce, bind, exp },
        deps.chaveEstado,
      );
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({
        client_id: deps.google.clientId,
        redirect_uri: deps.callbackUrl,
        response_type: 'code',
        scope: 'openid email',
        state,
        nonce,
        prompt: 'select_account',
      }).toString();
      return { urlGoogle: url.toString(), cookie: bind };
    },

    async concluir({ code, state, error, cookie }) {
      if (!state || !cookie) {
        return { ok: false, motivo: 'estado' };
      }
      const doc = estadoSchema.safeParse(
        verifyDocument(state, deps.chaveEstado, {
          now: Math.floor(deps.agora() / 1000),
        }),
      );
      if (!doc.success || !iguais(cookie, doc.data.bind)) {
        return { ok: false, motivo: 'estado' };
      }
      if (error || !code) {
        return { ok: false, motivo: 'google' };
      }

      let resposta: Response;
      try {
        resposta = await http('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: deps.google.clientId,
            client_secret: deps.google.clientSecret,
            redirect_uri: deps.callbackUrl,
            grant_type: 'authorization_code',
          }),
        });
      } catch {
        return { ok: false, motivo: 'google' };
      }
      if (!resposta.ok) {
        return { ok: false, motivo: 'google' };
      }

      const corpo = (await resposta.json().catch(() => null)) as {
        id_token?: unknown;
      } | null;
      const claims = lerClaims(corpo?.id_token);
      const emissorOk =
        claims?.iss === 'https://accounts.google.com' ||
        claims?.iss === 'accounts.google.com';
      if (
        !claims ||
        !emissorOk ||
        claims.aud !== deps.google.clientId ||
        claims.exp * 1000 <= deps.agora() ||
        claims.nonce !== doc.data.nonce ||
        claims.email_verified !== true ||
        !claims.email
      ) {
        return { ok: false, motivo: 'google' };
      }

      const pessoa = await deps.autorizadas.pessoaPorEmail(claims.email);
      if (pessoa === null) {
        return { ok: false, motivo: 'pessoa-nao-autorizada' };
      }
      return { ok: true, pessoa, pedido: doc.data.p, bind: doc.data.bind };
    },
  };
}
