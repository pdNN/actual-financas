// Composição do serviço HTTP (spec 010, plan.md): rotas OAuth do SDK, login pelo
// Google, consentimento, /mcp e /saude. Não depende do orçamento do Actual para
// responder descoberta, registro e token (o Claude dá 10 s a esses endpoints).

import {
  createOAuthMetadata,
  mcpAuthRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import type { Express, Request, RequestHandler, Response } from 'express';

import type { Regras } from './acessos.ts';
import { REGRAS_PADRAO } from './acessos.ts';
import type { Auditoria } from './auditoria.ts';
import type { Autorizadas } from './autorizadas.ts';
import { criarClientsStore } from './client-id.ts';
import type { Config } from './config.ts';
import type { GerenciadorEstado } from './estado-store.ts';
import { COOKIE_LOGIN, criarIdentidade } from './google-identity.ts';
import { criarLimitador } from './limites.ts';
import { criarMcpRouter, ipDe } from './mcp-http.ts';
import { criarProvedor } from './oauth-provider.ts';
import { origemPermitida } from './origem.ts';
import {
  cabecalhosDePagina,
  paginaConsentimento,
  paginaErro,
} from './paginas.ts';
import { deriveKey } from './tokens.ts';

export type AppDeps = {
  config: Config;
  gerenciador: GerenciadorEstado;
  autorizadas: Autorizadas;
  auditoria: Auditoria;
  fabricaMcp: () => McpServer;
  agora?: () => Date;
  fetchImpl?: typeof fetch;
  regras?: Regras;
};

function cookieDe(req: Request, nome: string): string | undefined {
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) {
      return resto.join('=');
    }
  }
  return undefined;
}

function enviarPagina(
  res: Response,
  status: number,
  html: string,
  origemRetorno?: string,
) {
  res.status(status).set(cabecalhosDePagina({ origemRetorno })).send(html);
}

export function criarApp(deps: AppDeps): Express {
  const { config, auditoria } = deps;
  const agora = deps.agora ?? (() => new Date());
  const regras: Regras = deps.regras ?? {
    ...REGRAS_PADRAO,
    inatividadeDias: config.inatividadeDias,
    absolutoDias: config.limiteAbsolutoDias,
  };

  const chaves = {
    client: deriveKey(config.segredoMestre, 'client'),
    token: deriveKey(config.segredoMestre, 'token'),
    estadoLogin: deriveKey(config.segredoMestre, 'estado-login'),
    consentimento: deriveKey(config.segredoMestre, 'consentimento'),
    codigo: deriveKey(config.segredoMestre, 'codigo'),
  };

  const clientsStore = criarClientsStore({
    chave: chaves.client,
    redirectsPermitidos: config.redirectsPermitidos,
  });
  const identidade = criarIdentidade({
    google: config.google,
    callbackUrl: new URL('/google/callback', config.publicUrl).href,
    chaveEstado: chaves.estadoLogin,
    autorizadas: deps.autorizadas,
    agora: () => agora().getTime(),
    fetchImpl: deps.fetchImpl,
  });
  const provedor = criarProvedor({
    config,
    gerenciador: deps.gerenciador,
    autorizadas: deps.autorizadas,
    clientsStore,
    identidade,
    chaves: {
      token: chaves.token,
      codigo: chaves.codigo,
      consentimento: chaves.consentimento,
    },
    auditoria,
    agora,
    regras,
  });

  const relogio = () => agora().getTime();
  const limiteFalhas = criarLimitador({
    janelaMs: 60_000,
    max: config.limiteFalhasPorMin,
    agora: relogio,
  });
  const limiteConsultas = criarLimitador({
    janelaMs: 60_000,
    max: config.limiteConsultasPorMin,
    agora: relogio,
  });
  const limiteRegistro = criarLimitador({
    janelaMs: 60_000,
    max: 10,
    agora: relogio,
  });
  const limiteAutorizar = criarLimitador({
    janelaMs: 60_000,
    max: 30,
    agora: relogio,
  });

  const app = express();
  app.disable('x-powered-by');

  // Cabeçalhos de toda resposta.
  app.use((_req, res, next) => {
    res.set({
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  app.get('/saude', (_req, res) => {
    res.json({ ok: true });
  });

  // Tudo abaixo não é cacheado.
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const porIp =
    (limitador: ReturnType<typeof criarLimitador>): RequestHandler =>
    (req, res, next) => {
      const r = limitador.tentar(ipDe(req) ?? 'desconhecido');
      if (!r.permitido) {
        res
          .status(429)
          .set('Retry-After', String(r.retryAfterSeg))
          .json({ error: 'too_many_requests' });
        return;
      }
      next();
    };

  const soOrigemPermitida: RequestHandler = (req, res, next) => {
    if (!origemPermitida(ipDe(req), config.origensPermitidasCidr)) {
      auditoria.registrar({
        evento: 'recusado',
        resultado: 'negado',
        motivo: 'origem',
      });
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

  // --- Descoberta -----------------------------------------------------------
  const urlMetadataRecurso = new URL(
    '/.well-known/oauth-protected-resource/mcp',
    config.publicUrl,
  ).href;
  const metadataRecurso = {
    resource: config.resourceUrl.href,
    authorization_servers: [config.publicUrl.href],
    scopes_supported: ['financas'],
    bearer_methods_supported: ['header'],
    resource_name: 'Finanças do casal',
  };
  const metadataServidor = {
    ...createOAuthMetadata({
      provider: provedor,
      issuerUrl: config.publicUrl,
      baseUrl: config.publicUrl,
      scopesSupported: ['financas'],
    }),
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
  };
  app.get(
    [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ],
    (_req, res) => {
      res.json(metadataRecurso);
    },
  );
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json(metadataServidor);
  });

  // --- Limites e filtro nas rotas do SDK -------------------------------------
  app.use('/register', soOrigemPermitida, porIp(limiteRegistro));
  app.use('/authorize', porIp(limiteAutorizar));
  app.use('/token', soOrigemPermitida, porIp(limiteAutorizar));
  app.use('/revoke', soOrigemPermitida, porIp(limiteAutorizar));

  app.use(
    mcpAuthRouter({
      provider: provedor,
      issuerUrl: config.publicUrl,
      baseUrl: config.publicUrl,
      scopesSupported: ['financas'],
      resourceName: 'Finanças do casal',
      resourceServerUrl: config.resourceUrl,
      authorizationOptions: { rateLimit: false },
      clientRegistrationOptions: {
        rateLimit: false,
        clientIdGeneration: false,
      },
      tokenOptions: { rateLimit: false },
      revocationOptions: { rateLimit: false },
    }),
  );

  // --- Login Google e consentimento -------------------------------------------
  app.get('/google/callback', async (req, res) => {
    const consulta = req.query as Record<string, string | undefined>;
    const r = await identidade.concluir({
      code: consulta.code,
      state: consulta.state,
      error: consulta.error,
      cookie: cookieDe(req, COOKIE_LOGIN),
    });
    if (!r.ok) {
      auditoria.registrar({
        evento: 'recusado',
        resultado: 'negado',
        motivo:
          r.motivo === 'pessoa-nao-autorizada'
            ? 'pessoa-nao-autorizada'
            : 'token-invalido',
      });
      enviarPagina(
        res,
        r.motivo === 'pessoa-nao-autorizada' ? 403 : 400,
        paginaErro(
          r.motivo === 'pessoa-nao-autorizada'
            ? 'Esta conta não tem acesso.'
            : 'Não foi possível concluir o login. Tente de novo pelo conector.',
        ),
      );
      return;
    }
    const retorno = new URL(r.pedido.redirectUri);
    const { sessao, csrf } = provedor.prepararConsentimento({
      pessoa: r.pessoa,
      pedido: r.pedido,
      bind: r.bind,
    });
    enviarPagina(
      res,
      200,
      paginaConsentimento({
        nomeCliente: r.pedido.clientNome,
        hostRetorno: retorno.host,
        origemRetorno: retorno.origin,
        rotuloSugerido: `celular de ${r.pessoa}`,
        csrf,
        sessao,
      }),
      retorno.origin,
    );
  });

  app.post(
    '/consentimento',
    express.urlencoded({ extended: false, limit: '10kb' }),
    async (req, res) => {
      const corpo = (req.body ?? {}) as Record<string, string | undefined>;
      const r = await provedor.concluirConsentimento({
        sessao: corpo.sessao,
        csrf: corpo.csrf,
        rotulo: corpo.rotulo,
        cookieBind: cookieDe(req, COOKIE_LOGIN),
      });
      if (!r.ok) {
        enviarPagina(
          res,
          400,
          paginaErro(
            r.motivo === 'rotulo'
              ? 'Dê um nome de 1 a 40 caracteres para este acesso e tente de novo pelo conector.'
              : 'Não foi possível concluir. Tente de novo pelo conector.',
          ),
        );
        return;
      }
      res.clearCookie(COOKIE_LOGIN, { path: '/' });
      res.redirect(r.redirectUrl);
    },
  );

  // --- MCP ------------------------------------------------------------------
  app.use(
    criarMcpRouter({
      verificarToken: token => provedor.verifyAccessToken(token),
      fabricaMcp: deps.fabricaMcp,
      limiteFalhas,
      limiteConsultas,
      auditoria,
      origensPermitidasCidr: config.origensPermitidasCidr,
      redirectsPermitidos: config.redirectsPermitidos,
      urlMetadataRecurso,
    }),
  );

  app.use((_req, res) => {
    res.status(404).type('application/json').send('{"error":"not_found"}');
  });
  app.use(
    (
      _erro: Error,
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      res.status(500).json({ error: 'server_error' });
    },
  );

  return app;
}
