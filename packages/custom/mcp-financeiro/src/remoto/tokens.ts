// Tokens e documentos assinados (spec 010, data-model.md §3).
// Só `node:crypto`: JWT HS256, HKDF por finalidade e refresh opaco guardado em hash.

import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { z } from 'zod';

export type Finalidade =
  | 'client'
  | 'token'
  | 'estado-login'
  | 'consentimento'
  | 'codigo';

/** Subchave por finalidade a partir do segredo mestre (HKDF-SHA256, 32 bytes). */
export function deriveKey(master: Buffer, finalidade: Finalidade): Buffer {
  const chave = hkdfSync(
    'sha256',
    master,
    Buffer.alloc(0),
    Buffer.from(`financas-mcp:${finalidade}`),
    32,
  );
  return Buffer.from(chave);
}

const b64 = (dados: Buffer | string) =>
  Buffer.from(dados).toString('base64url');

function hmac(chave: Buffer, dados: string): Buffer {
  return createHmac('sha256', chave).update(dados).digest();
}

function iguais(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// JWT HS256 (access token)
// ---------------------------------------------------------------------------

const payloadSchema = z.object({
  gid: z.string().min(1),
  aud: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
});

export type JwtPayload = z.infer<typeof payloadSchema>;

export type VerificacaoJwt =
  | { ok: true; payload: JwtPayload }
  | {
      ok: false;
      motivo:
        | 'malformado'
        | 'algoritmo'
        | 'assinatura'
        | 'expirado'
        | 'audiencia';
    };

export function signJwt(payload: JwtPayload, chave: Buffer): string {
  const cabecalho = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64(JSON.stringify(payload));
  const assinatura = b64(hmac(chave, `${cabecalho}.${corpo}`));
  return `${cabecalho}.${corpo}.${assinatura}`;
}

function decodificarJson(parte: string): unknown {
  try {
    return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

/** `now` em segundos (Unix). */
export function verifyJwt(
  token: string,
  chave: Buffer,
  esperado: { aud: string; now: number },
): VerificacaoJwt {
  const partes = token.split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'malformado' };
  const [cabecalhoTxt, corpoTxt, assinaturaTxt] = partes as [
    string,
    string,
    string,
  ];

  const cabecalho = z
    .object({ alg: z.string() })
    .safeParse(decodificarJson(cabecalhoTxt));
  if (!cabecalho.success) return { ok: false, motivo: 'malformado' };
  if (cabecalho.data.alg !== 'HS256') return { ok: false, motivo: 'algoritmo' };

  const esperada = hmac(chave, `${cabecalhoTxt}.${corpoTxt}`);
  if (!iguais(esperada, Buffer.from(assinaturaTxt, 'base64url'))) {
    return { ok: false, motivo: 'assinatura' };
  }

  const payload = payloadSchema.safeParse(decodificarJson(corpoTxt));
  if (!payload.success) return { ok: false, motivo: 'malformado' };
  if (esperado.now >= payload.data.exp) {
    return { ok: false, motivo: 'expirado' };
  }
  if (payload.data.aud !== esperado.aud) {
    return { ok: false, motivo: 'audiencia' };
  }
  return { ok: true, payload: payload.data };
}

// ---------------------------------------------------------------------------
// Documentos assinados sem estado (client_id, estado de login, código)
// ---------------------------------------------------------------------------

export function signDocument(
  payload: Record<string, unknown>,
  chave: Buffer,
): string {
  const corpo = b64(JSON.stringify(payload));
  return `${corpo}.${b64(hmac(chave, corpo))}`;
}

/** Devolve o conteúdo ou `null` se a assinatura falha ou `exp` (segundos) venceu. */
export function verifyDocument(
  documento: string,
  chave: Buffer,
  opcoes: { now?: number },
): Record<string, unknown> | null {
  const partes = documento.split('.');
  if (partes.length !== 2) return null;
  const [corpo, assinatura] = partes as [string, string];
  if (!iguais(hmac(chave, corpo), Buffer.from(assinatura, 'base64url'))) {
    return null;
  }
  const conteudo = z
    .record(z.string(), z.unknown())
    .safeParse(decodificarJson(corpo));
  if (!conteudo.success) return null;
  const exp = conteudo.data.exp;
  if (
    typeof exp === 'number' &&
    opcoes.now !== undefined &&
    opcoes.now >= exp
  ) {
    return null;
  }
  return conteudo.data;
}

// ---------------------------------------------------------------------------
// Refresh token opaco
// ---------------------------------------------------------------------------

export function hashToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}

export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
