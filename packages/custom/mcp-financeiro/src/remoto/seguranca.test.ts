import { afterEach, describe, expect, it } from 'vitest';

import {
  chamarFerramenta,
  chamarMcp,
  conectar,
  configDeTeste,
  INICIALIZAR,
  subirServico,
} from './testes-util';
import type { Servico } from './testes-util';

let s: Servico;
afterEach(async () => {
  await s?.fechar();
});

const SEGREDOS = ['TOKEN-SECRETO-DO-ACTUAL', 'SEGREDO-GOOGLE'];

describe('cabeçalhos', () => {
  it('toda resposta leva HSTS, nosniff e referrer-policy; rotas de OAuth e /mcp não são cacheadas', async () => {
    s = await subirServico();
    for (const [caminho, init] of [
      ['/saude', {}],
      ['/.well-known/oauth-authorization-server', {}],
      [
        '/mcp',
        {
          method: 'POST',
          body: '{}',
          headers: { 'content-type': 'application/json' },
        },
      ],
      ['/nao-existe', {}],
    ] as const) {
      const r = await fetch(`${s.url}${caminho}`, init);
      expect(r.headers.get('strict-transport-security')).toContain('max-age=');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('referrer-policy')).toBe('no-referrer');
      if (caminho !== '/saude') {
        expect(r.headers.get('cache-control')).toContain('no-store');
      }
    }
  });

  it('/mcp não oferece CORS', async () => {
    s = await subirServico();
    const r = await fetch(`${s.url}/mcp`, { method: 'POST', body: '{}' });
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('/saude e rotas desconhecidas', () => {
  it('/saude responde 200 sem tocar o Actual', async () => {
    s = await subirServico();
    const r = await fetch(`${s.url}/saude`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(s.fonte.chamadas).toEqual([]);
  });

  it('rota desconhecida ⇒ 404 genérico, sem pista do que existe por trás', async () => {
    s = await subirServico();
    const r = await fetch(`${s.url}/admin`);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('{"error":"not_found"}');
  });
});

describe('limites', () => {
  it('falhas repetidas de autenticação por IP ⇒ 429 com Retry-After', async () => {
    s = await subirServico({
      config: configDeTeste({ LIMITE_FALHAS_POR_MIN: '3' }),
    });
    const status: number[] = [];
    for (let i = 0; i < 5; i++) {
      status.push((await chamarMcp(s, 'lixo', INICIALIZAR)).status);
    }
    expect(status.slice(0, 3)).toEqual([401, 401, 401]);
    const ultimo = await chamarMcp(s, 'lixo', INICIALIZAR);
    expect(ultimo.status).toBe(429);
    expect(Number(ultimo.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('consultas por acesso acima do limite ⇒ 429 (protege o Actual)', async () => {
    s = await subirServico({
      config: configDeTeste({ LIMITE_CONSULTAS_POR_MIN: '2' }),
    });
    const c = await conectar(s);
    const status: number[] = [];
    for (let i = 0; i < 4; i++) {
      status.push((await chamarMcp(s, c.accessToken, INICIALIZAR)).status);
    }
    expect(status).toEqual([200, 200, 429, 429]);
    const auditoria = s.auditoria.join('\n');
    expect(auditoria).toContain('"resultado":"limitado"');
  });

  it('/register em excesso por IP ⇒ 429', async () => {
    s = await subirServico();
    const status: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await fetch(`${s.url}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
          token_endpoint_auth_method: 'none',
        }),
      });
      status.push(r.status);
    }
    expect(status.slice(0, 10).every(c => c === 201)).toBe(true);
    expect(status.slice(10)).toContain(429);
  });
});

describe('filtro de origem (opcional)', () => {
  it('desligado por padrão: qualquer IP chega até a checagem do token', async () => {
    s = await subirServico();
    expect((await chamarMcp(s, null, INICIALIZAR)).status).toBe(401);
  });

  it('ligado: IP fora da faixa ⇒ 403; IP dentro ⇒ segue para o token', async () => {
    s = await subirServico({
      config: configDeTeste({ ORIGENS_PERMITIDAS_CIDR: '203.0.113.0/24' }),
    });
    expect((await chamarMcp(s, null, INICIALIZAR)).status).toBe(403);
    expect(
      (
        await chamarMcp(s, null, INICIALIZAR, {
          'x-forwarded-for': '203.0.113.9',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await chamarMcp(s, null, INICIALIZAR, {
          'x-forwarded-for': '198.51.100.1',
        })
      ).status,
    ).toBe(403);
  });
});

describe('nenhum segredo vaza', () => {
  it('respostas de erro e de sucesso nunca contêm credenciais do serviço', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const respostas = await Promise.all([
      chamarMcp(s, null, INICIALIZAR),
      chamarMcp(s, c.accessToken, chamarFerramenta('contas')),
      chamarMcp(s, c.accessToken, chamarFerramenta('inexistente')),
      fetch(`${s.url}/.well-known/oauth-authorization-server`),
      fetch(`${s.url}/token`, {
        method: 'POST',
        body: 'grant_type=lixo',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    ]);
    for (const r of respostas) {
      const texto = await r.text();
      for (const segredo of SEGREDOS) expect(texto).not.toContain(segredo);
    }
    for (const segredo of SEGREDOS) {
      expect(s.auditoria.join('\n')).not.toContain(segredo);
    }
  });

  it('a auditoria nunca contém token, e-mail nem parâmetros de consulta', async () => {
    s = await subirServico();
    const c = await conectar(s);
    await chamarMcp(
      s,
      c.accessToken,
      chamarFerramenta('gasto_por_categoria', {
        inicio: '2026-09-01',
        fim: '2026-09-30',
      }),
    );
    const log = s.auditoria.join('\n');
    expect(log).toContain('"ferramenta":"gasto_por_categoria"');
    for (const proibido of [
      c.accessToken,
      c.refreshToken,
      'pedro@exemplo.com',
      '2026-09-01',
      '127.0.0.1',
    ]) {
      expect(log).not.toContain(proibido);
    }
  });
});
