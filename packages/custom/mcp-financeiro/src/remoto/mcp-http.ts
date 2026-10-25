// Endpoint MCP por HTTP, SEM sessão (spec 010, R-2 e contracts/mcp-endpoint.md).
// Cada pedido carrega o próprio bearer e cria um servidor MCP novo: com escala a
// zero não há sessão em memória para perder.

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Router } from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { Auditoria } from './auditoria.ts';
import type { Limitador } from './limites.ts';
import { ipDoPedido, origemPermitida } from './origem.ts';

export type Dependencias = {
  verificarToken: (token: string) => Promise<AuthInfo>;
  fabricaMcp: () => McpServer;
  limiteFalhas: Limitador;
  limiteConsultas: Limitador;
  auditoria: Auditoria;
  /** Faixas de IP aceitas; vazio = filtro desligado. */
  origensPermitidasCidr: string[];
  /** Padrões de retorno dos provedores: dão as origens web conhecidas. */
  redirectsPermitidos: string[];
  urlMetadataRecurso: string;
};

export function ipDe(req: Request): string | null {
  return ipDoPedido(req.headers, {
    socketIp: req.socket.remoteAddress ?? undefined,
  });
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Um Origin só é aceito se for de um provedor da lista de retornos (ou loopback). */
function origemWebConhecida(origin: string, redirects: string[]): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) {
    return true;
  }
  return redirects.some(r => /^(https:\/\/[^/]+)/.exec(r)?.[1] === url.origin);
}

function bearerDe(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
  return m?.[1] ?? null;
}

export function criarMcpRouter(deps: Dependencias): Router {
  const router = Router();

  const negar401 = (res: Response) => {
    res
      .status(401)
      .set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${deps.urlMetadataRecurso}", scope="financas"`,
      )
      .type('application/json')
      .send('{"error":"unauthorized"}');
  };

  const limitar429 = (res: Response, segundos: number) => {
    res
      .status(429)
      .set('Retry-After', String(segundos))
      .json({ error: 'too_many_requests' });
  };

  const autenticar: RequestHandler = async (req, res, next) => {
    const ip = ipDe(req) ?? 'desconhecido';

    const bloqueio = deps.limiteFalhas.verificar(ip);
    if (!bloqueio.permitido) {
      limitar429(res, bloqueio.retryAfterSeg);
      return;
    }
    if (!origemPermitida(ipDe(req), deps.origensPermitidasCidr)) {
      deps.auditoria.registrar({
        evento: 'recusado',
        resultado: 'negado',
        motivo: 'origem',
      });
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const origin = req.headers.origin;
    if (
      origin !== undefined &&
      !origemWebConhecida(origin, deps.redirectsPermitidos)
    ) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const token = bearerDe(req);
    if (token === null) {
      deps.limiteFalhas.registrar(ip);
      deps.auditoria.registrar({
        evento: 'recusado',
        resultado: 'negado',
        motivo: 'sem-token',
      });
      negar401(res);
      return;
    }
    let info: AuthInfo;
    try {
      info = await deps.verificarToken(token);
    } catch {
      deps.limiteFalhas.registrar(ip);
      deps.auditoria.registrar({
        evento: 'recusado',
        resultado: 'negado',
        motivo: 'token-invalido',
      });
      negar401(res);
      return;
    }

    const consulta = deps.limiteConsultas.tentar(info.clientId);
    if (!consulta.permitido) {
      deps.auditoria.registrar({
        evento: 'consulta',
        rotulo: String(info.extra?.rotulo ?? ''),
        resultado: 'limitado',
        motivo: 'limite',
      });
      limitar429(res, consulta.retryAfterSeg);
      return;
    }
    res.locals.auth = info;
    next();
  };

  const executar: RequestHandler = async (req, res) => {
    const info = res.locals.auth as AuthInfo;
    const inicio = Date.now();
    const corpo: unknown = req.body;
    const chamada =
      typeof corpo === 'object' &&
      corpo !== null &&
      (corpo as { method?: unknown }).method === 'tools/call'
        ? String(
            ((corpo as { params?: { name?: unknown } }).params ?? {}).name ??
              '',
          )
        : null;

    res.on('finish', () => {
      if (chamada === null) {
        return;
      }
      deps.auditoria.registrar({
        evento: 'consulta',
        rotulo: String(info.extra?.rotulo ?? ''),
        ferramenta: chamada,
        resultado: res.statusCode < 400 ? 'ok' : 'erro',
        duracao_ms: Date.now() - inicio,
      });
    });

    const servidor = deps.fabricaMcp();
    const transporte = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transporte.close();
      void servidor.close();
    });
    await servidor.connect(transporte);
    await transporte.handleRequest(req, res, corpo);
  };

  const naoPermitido: RequestHandler = (_req, res) => {
    res.status(405).set('Allow', 'POST').json({ error: 'method_not_allowed' });
  };

  const erroDeCorpo = (
    erro: Error & { type?: string },
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (erro.type === 'entity.too.large') {
      res.status(413).json({ error: 'payload_too_large' });
      return;
    }
    if (erro.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'invalid_json' });
      return;
    }
    next(erro);
  };

  router.get('/mcp', naoPermitido);
  router.delete('/mcp', naoPermitido);
  router.post(
    '/mcp',
    autenticar,
    express.json({ limit: '100kb' }),
    executar,
    erroDeCorpo,
  );
  return router;
}
