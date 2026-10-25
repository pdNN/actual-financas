// Provedor OAuth do serviço (spec 010, R-3 e R-6), plugado no roteador do SDK.
// O SDK cuida do protocolo (PKCE, redirect, formulários, erros RFC 6749); aqui
// ficam as regras nossas: código de uso único, acesso por aparelho, refresh
// rotativo e a checagem do acesso no estado a cada pedido.

import { randomBytes, timingSafeEqual } from 'node:crypto';

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Response } from 'express';
import { z } from 'zod';

import {
  conceder,
  encerrar,
  limpar,
  registrarUso,
  rotacionar,
  validar,
} from './acessos.ts';
import type { Regras } from './acessos.ts';
import type { Auditoria } from './auditoria.ts';
import type { Autorizadas } from './autorizadas.ts';
import type { Config } from './config.ts';
import type { GerenciadorEstado } from './estado-store.ts';
import { COOKIE_LOGIN } from './google-identity.ts';
import type { Identidade, PedidoAuthorize } from './google-identity.ts';
import { validarRotulo } from './paginas.ts';
import {
  hashToken,
  signDocument,
  signJwt,
  verifyDocument,
  verifyJwt,
} from './tokens.ts';

const ESCOPO = 'financas';
const VALIDADE_CODIGO_S = 60;
const VALIDADE_CONSENTIMENTO_S = 300;
const FORMATO_REFRESH = /^(a_[A-Za-z0-9_-]{6,})\.[A-Za-z0-9_-]{20,}$/;

export type Dependencias = {
  config: Config;
  gerenciador: GerenciadorEstado;
  autorizadas: Autorizadas;
  clientsStore: OAuthRegisteredClientsStore;
  identidade: Identidade;
  chaves: { token: Buffer; codigo: Buffer; consentimento: Buffer };
  auditoria: Auditoria;
  agora: () => Date;
  regras: Regras;
};

const codigoSchema = z.object({
  pessoa: z.string(),
  rotulo: z.string(),
  pedido: z.object({
    clientId: z.string(),
    clientNome: z.string(),
    redirectUri: z.string(),
    codeChallenge: z.string(),
    state: z.string().optional(),
    resource: z.string().optional(),
    scopes: z.array(z.string()),
  }),
  jti: z.string(),
  exp: z.number(),
});

const consentimentoSchema = z.object({
  pessoa: z.string(),
  pedido: codigoSchema.shape.pedido,
  bind: z.string(),
  csrf: z.string(),
  exp: z.number(),
});

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type ResultadoConsentimento =
  | { ok: true; redirectUrl: string }
  | { ok: false; motivo: 'sessao' | 'rotulo' | 'pessoa' };

export type Provedor = OAuthServerProvider & {
  emitirCodigo(args: {
    pessoa: string;
    rotulo: string;
    pedido: PedidoAuthorize;
  }): string;
  prepararConsentimento(args: {
    pessoa: string;
    pedido: PedidoAuthorize;
    bind: string;
  }): { sessao: string; csrf: string };
  concluirConsentimento(args: {
    sessao?: string;
    csrf?: string;
    rotulo?: string;
    cookieBind?: string;
  }): Promise<ResultadoConsentimento>;
};

export function criarProvedor(deps: Dependencias): Provedor {
  const { config, gerenciador, chaves, regras } = deps;
  const recurso = config.resourceUrl.href;
  const segundos = () => Math.floor(deps.agora().getTime() / 1000);
  /** jti de códigos já trocados → exp (em memória: o código dura 60 s). */
  const usados = new Map<string, number>();

  const podarUsados = () => {
    const agora = segundos();
    for (const [jti, exp] of usados) {
      if (exp <= agora) {
        usados.delete(jti);
      }
    }
  };

  const conferirRecurso = (resource: URL | undefined) => {
    if (resource && resource.href !== recurso) {
      throw new InvalidTargetError('recurso desconhecido');
    }
  };

  const emitirTokens = (gid: string, refreshToken: string): OAuthTokens => {
    const iat = segundos();
    const exp = iat + config.ttlAccessMin * 60;
    return {
      access_token: signJwt({ gid, aud: recurso, iat, exp }, chaves.token),
      token_type: 'Bearer',
      expires_in: config.ttlAccessMin * 60,
      refresh_token: refreshToken,
      scope: ESCOPO,
    };
  };

  const novoRefresh = (gid: string) =>
    `${gid}.${randomBytes(32).toString('base64url')}`;

  const provedor: Provedor = {
    get clientsStore() {
      return deps.clientsStore;
    },

    async authorize(client, params, res: Response) {
      conferirRecurso(params.resource);
      const escopos = params.scopes ?? [];
      if (escopos.some(e => e !== ESCOPO)) {
        throw new InvalidScopeError('escopo desconhecido');
      }
      const { urlGoogle, cookie } = deps.identidade.iniciar({
        clientId: client.client_id,
        clientNome: client.client_name ?? 'um cliente de IA',
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        ...(params.state !== undefined ? { state: params.state } : {}),
        ...(params.resource ? { resource: params.resource.href } : {}),
        scopes: [ESCOPO],
      });
      res.cookie(COOKIE_LOGIN, cookie, {
        httpOnly: true,
        secure: config.publicUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: 600_000,
      });
      res.redirect(urlGoogle);
    },

    emitirCodigo({ pessoa, rotulo, pedido }) {
      return signDocument(
        {
          pessoa,
          rotulo,
          pedido,
          jti: randomBytes(12).toString('base64url'),
          exp: segundos() + VALIDADE_CODIGO_S,
        },
        chaves.codigo,
      );
    },

    async challengeForAuthorizationCode(_client, authorizationCode) {
      const doc = codigoSchema.safeParse(
        verifyDocument(authorizationCode, chaves.codigo, { now: segundos() }),
      );
      if (!doc.success) {
        throw new InvalidGrantError('código inválido ou expirado');
      }
      return doc.data.pedido.codeChallenge;
    },

    async exchangeAuthorizationCode(
      client,
      authorizationCode,
      _verifier,
      redirectUri,
      resource,
    ) {
      const doc = codigoSchema.safeParse(
        verifyDocument(authorizationCode, chaves.codigo, { now: segundos() }),
      );
      if (!doc.success) {
        throw new InvalidGrantError('código inválido ou expirado');
      }
      const { pessoa, rotulo, pedido, jti, exp } = doc.data;
      if (client.client_id !== pedido.clientId) {
        throw new InvalidGrantError('código emitido para outro cliente');
      }
      if (redirectUri !== undefined && redirectUri !== pedido.redirectUri) {
        throw new InvalidGrantError(
          'redirect_uri diferente do pedido de autorização',
        );
      }
      conferirRecurso(resource);
      podarUsados();
      if (usados.has(jti)) {
        throw new InvalidGrantError('código já utilizado');
      }
      usados.set(jti, exp);

      const gid = `a_${randomBytes(6).toString('base64url')}`;
      const refresh = novoRefresh(gid);
      const agora = deps.agora();
      await gerenciador.atualizar(estado =>
        limpar(
          conceder(
            estado,
            {
              id: gid,
              rotulo,
              pessoa,
              cliente: pedido.clientNome,
              now: agora,
              refreshHash: hashToken(refresh),
            },
            regras,
          ),
          agora,
          regras,
        ),
      );
      deps.auditoria.registrar({
        evento: 'acesso_concedido',
        rotulo,
        resultado: 'ok',
      });
      return emitirTokens(gid, refresh);
    },

    async exchangeRefreshToken(_client, refreshToken, _scopes, resource) {
      conferirRecurso(resource);
      const gid = FORMATO_REFRESH.exec(refreshToken)?.[1];
      if (!gid) {
        throw new InvalidGrantError('refresh token inválido');
      }
      const pessoas = await deps.autorizadas.pessoasAtuais();
      const novo = novoRefresh(gid);
      const agora = deps.agora();
      const saida: { falha: string | null; reuso: boolean } = {
        falha: null,
        reuso: false,
      };

      await gerenciador.atualizar(estado => {
        saida.falha = null;
        saida.reuso = false;
        const v = validar(estado, gid, agora, pessoas, regras);
        if (!v.ok) {
          saida.falha =
            v.motivo === 'expirado'
              ? 'acesso expirado'
              : v.motivo === 'inexistente'
                ? 'refresh token inválido'
                : 'acesso encerrado';
          return estado;
        }
        const r = rotacionar(
          estado,
          gid,
          hashToken(refreshToken),
          hashToken(novo),
          agora,
          regras,
        );
        if (r.ok) {
          return r.estado;
        }
        saida.falha =
          r.motivo === 'expirado'
            ? 'acesso expirado'
            : r.motivo === 'invalido'
              ? 'refresh token inválido'
              : 'acesso encerrado';
        saida.reuso = r.motivo === 'reuso-de-refresh';
        return r.estado; // no reuso, o estado vem com o acesso encerrado e precisa ser gravado
      });

      const rotulo = (await gerenciador.ler()).acessos[gid]?.rotulo;
      if (saida.falha !== null) {
        deps.auditoria.registrar({
          evento: saida.reuso ? 'acesso_encerrado' : 'recusado',
          ...(rotulo ? { rotulo } : {}),
          resultado: 'negado',
          motivo: saida.reuso ? 'reuso-de-refresh' : 'encerrado',
        });
        throw new InvalidGrantError(saida.falha);
      }
      deps.auditoria.registrar({
        evento: 'acesso_renovado',
        ...(rotulo ? { rotulo } : {}),
        resultado: 'ok',
      });
      return emitirTokens(gid, novo);
    },

    async verifyAccessToken(token): Promise<AuthInfo> {
      const jwt = verifyJwt(token, chaves.token, {
        aud: recurso,
        now: segundos(),
      });
      if (!jwt.ok) {
        throw new InvalidTokenError('token inválido');
      }
      const { gid, exp } = jwt.payload;
      const agora = deps.agora();
      const estado = await gerenciador.ler();
      const pessoas = await deps.autorizadas.pessoasAtuais();
      const v = validar(estado, gid, agora, pessoas, regras);
      if (!v.ok) {
        throw new InvalidTokenError('token inválido');
      }
      // "Último uso" é gravado no máximo a cada 10 min; falha aqui não derruba o pedido.
      if (registrarUso(estado, gid, agora, regras) !== estado) {
        void gerenciador
          .atualizar(e => registrarUso(e, gid, agora, regras))
          .catch(() => undefined);
      }
      return {
        token,
        clientId: gid,
        scopes: [ESCOPO],
        expiresAt: exp,
        resource: config.resourceUrl,
        extra: { rotulo: v.acesso.rotulo, pessoa: v.acesso.pessoa },
      };
    },

    async revokeToken(_client, { token }) {
      // RFC 7009: a resposta é sempre de sucesso, mesmo para token desconhecido.
      let gid: string | undefined;
      const refresh = FORMATO_REFRESH.exec(token);
      if (refresh) {
        gid = refresh[1];
        const hash = hashToken(token);
        const estado = await gerenciador.ler();
        const acesso = gid ? estado.acessos[gid] : undefined;
        if (
          !acesso ||
          (acesso.refreshAtualHash !== hash &&
            acesso.refreshAnteriorHash !== hash)
        ) {
          return;
        }
      } else {
        const jwt = verifyJwt(token, chaves.token, { aud: recurso, now: 0 });
        gid = jwt.ok ? jwt.payload.gid : undefined;
      }
      if (!gid) {
        return;
      }
      const alvo = gid;
      const agora = deps.agora();
      const antes = await gerenciador.ler();
      await gerenciador.atualizar(e => encerrar(e, alvo, 'manual', agora));
      deps.auditoria.registrar({
        evento: 'acesso_encerrado',
        ...(antes.acessos[alvo]?.rotulo
          ? { rotulo: antes.acessos[alvo]?.rotulo }
          : {}),
        resultado: 'ok',
        motivo: 'manual',
      });
    },

    prepararConsentimento({ pessoa, pedido, bind }) {
      const csrf = randomBytes(16).toString('base64url');
      const sessao = signDocument(
        {
          pessoa,
          pedido,
          bind,
          csrf,
          exp: segundos() + VALIDADE_CONSENTIMENTO_S,
        },
        chaves.consentimento,
      );
      return { sessao, csrf };
    },

    async concluirConsentimento({ sessao, csrf, rotulo, cookieBind }) {
      if (!sessao || !csrf || !cookieBind) {
        return { ok: false, motivo: 'sessao' };
      }
      const doc = consentimentoSchema.safeParse(
        verifyDocument(sessao, chaves.consentimento, { now: segundos() }),
      );
      if (
        !doc.success ||
        !iguais(csrf, doc.data.csrf) ||
        !iguais(cookieBind, doc.data.bind)
      ) {
        return { ok: false, motivo: 'sessao' };
      }
      const nome = validarRotulo(rotulo);
      if (nome === null) {
        return { ok: false, motivo: 'rotulo' };
      }
      if (!(await deps.autorizadas.pessoasAtuais()).includes(doc.data.pessoa)) {
        return { ok: false, motivo: 'pessoa' };
      }
      const code = provedor.emitirCodigo({
        pessoa: doc.data.pessoa,
        rotulo: nome,
        pedido: doc.data.pedido,
      });
      const retorno = new URL(doc.data.pedido.redirectUri);
      retorno.searchParams.set('code', code);
      if (doc.data.pedido.state !== undefined) {
        retorno.searchParams.set('state', doc.data.pedido.state);
      }
      return { ok: true, redirectUrl: retorno.toString() };
    },
  };
  return provedor;
}
