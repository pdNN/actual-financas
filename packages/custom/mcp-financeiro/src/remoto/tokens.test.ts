import { describe, expect, it } from 'vitest';

import {
  deriveKey,
  hashToken,
  newRefreshToken,
  signDocument,
  signJwt,
  verifyDocument,
  verifyJwt,
} from './tokens';

const master = Buffer.alloc(48, 9);
const AUD = 'https://servico.exemplo/mcp';
const NOW = 1_700_000_000;

describe('deriveKey', () => {
  it('deriva subchaves distintas por finalidade e estáveis', () => {
    const a = deriveKey(master, 'token');
    const b = deriveKey(master, 'client');
    expect(a.equals(b)).toBe(false);
    expect(deriveKey(master, 'token').equals(a)).toBe(true);
    expect(a.length).toBe(32);
  });

  it('muda tudo se o segredo mestre mudar', () => {
    const outro = Buffer.alloc(48, 10);
    expect(deriveKey(outro, 'token').equals(deriveKey(master, 'token'))).toBe(
      false,
    );
  });
});

describe('JWT HS256', () => {
  const key = deriveKey(master, 'token');
  const payload = { gid: 'a_1', aud: AUD, iat: NOW, exp: NOW + 900 };

  it('assina e verifica', () => {
    const jwt = signJwt(payload, key);
    const result = verifyJwt(jwt, key, { aud: AUD, now: NOW + 10 });
    expect(result).toEqual({ ok: true, payload });
  });

  it('recusa token expirado', () => {
    const jwt = signJwt(payload, key);
    expect(verifyJwt(jwt, key, { aud: AUD, now: NOW + 900 })).toEqual({
      ok: false,
      motivo: 'expirado',
    });
  });

  it('recusa audiência errada', () => {
    const jwt = signJwt(payload, key);
    expect(verifyJwt(jwt, key, { aud: 'https://outro/mcp', now: NOW })).toEqual(
      { ok: false, motivo: 'audiencia' },
    );
  });

  it('recusa assinatura adulterada e chave diferente', () => {
    const jwt = signJwt(payload, key);
    const [h, p, s] = jwt.split('.');
    const adulterado = `${h}.${Buffer.from(
      JSON.stringify({ ...payload, gid: 'a_2' }),
    ).toString('base64url')}.${s}`;
    expect(verifyJwt(adulterado, key, { aud: AUD, now: NOW })).toEqual({
      ok: false,
      motivo: 'assinatura',
    });
    expect(
      verifyJwt(jwt, deriveKey(master, 'client'), { aud: AUD, now: NOW }),
    ).toEqual({ ok: false, motivo: 'assinatura' });
    expect(p).toBeTruthy();
  });

  it('recusa algoritmo diferente de HS256 (inclusive alg none)', () => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(
      verifyJwt(`${header}.${body}.`, key, { aud: AUD, now: NOW }),
    ).toEqual({ ok: false, motivo: 'algoritmo' });
  });

  it('recusa lixo e formatos incompletos', () => {
    for (const lixo of ['', 'abc', 'a.b', 'a.b.c.d', '....']) {
      expect(verifyJwt(lixo, key, { aud: AUD, now: NOW }).ok).toBe(false);
    }
  });
});

describe('documentos assinados (client_id, estado de login, código)', () => {
  const key = deriveKey(master, 'client');

  it('faz ida e volta do conteúdo', () => {
    const doc = signDocument({ nome: 'Claude', n: 1 }, key);
    expect(verifyDocument(doc, key, {})).toEqual({ nome: 'Claude', n: 1 });
  });

  it('recusa adulteração, chave errada e lixo', () => {
    const doc = signDocument({ nome: 'Claude' }, key);
    const [p, s] = doc.split('.');
    const forjado = `${Buffer.from(JSON.stringify({ nome: 'Outro' })).toString('base64url')}.${s}`;
    expect(verifyDocument(forjado, key, {})).toBeNull();
    expect(verifyDocument(doc, deriveKey(master, 'token'), {})).toBeNull();
    expect(verifyDocument('lixo', key, {})).toBeNull();
    expect(p).toBeTruthy();
  });

  it('respeita exp (segundos) quando presente', () => {
    const doc = signDocument({ x: 1, exp: NOW + 60 }, key);
    expect(verifyDocument(doc, key, { now: NOW })).not.toBeNull();
    expect(verifyDocument(doc, key, { now: NOW + 60 })).toBeNull();
  });
});

describe('refresh token', () => {
  it('gera tokens aleatórios, longos e com hash estável', () => {
    const a = newRefreshToken();
    const b = newRefreshToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash.startsWith('sha256:')).toBe(true);
    expect(a.hash).not.toContain(a.token);
  });
});
