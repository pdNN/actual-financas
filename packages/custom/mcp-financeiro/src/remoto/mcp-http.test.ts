import { afterEach, describe, expect, it } from 'vitest';

import {
  chamarFerramenta,
  chamarMcp,
  conectar,
  INICIALIZAR,
  LISTAR_FERRAMENTAS,
  subirServico,
} from './testes-util';
import type { Servico } from './testes-util';

let s: Servico;
afterEach(async () => {
  await s?.fechar();
});

describe('POST /mcp sem credencial válida', () => {
  it('responde 401 IDÊNTICO para todas as variações de credencial ruim', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const variacoes: (string | null)[] = [
      null,
      'lixo',
      `${c.accessToken}x`,
      `${c.accessToken.split('.')[0]}.${c.accessToken.split('.')[1]}.assinaturaFalsa`,
    ];
    const respostas = [];
    for (const token of variacoes) {
      const r = await chamarMcp(s, token, INICIALIZAR);
      respostas.push({
        status: r.status,
        www: r.headers.get('www-authenticate'),
        corpo: await r.text(),
      });
    }
    s.avancarTempo(16 * 60_000);
    const expirado = await chamarMcp(s, c.accessToken, INICIALIZAR);
    respostas.push({
      status: expirado.status,
      www: expirado.headers.get('www-authenticate'),
      corpo: await expirado.text(),
    });

    for (const r of respostas) {
      expect(r.status).toBe(401);
      expect(r).toEqual(respostas[0]);
    }
    expect(respostas[0]?.www).toContain('Bearer resource_metadata="');
    expect(respostas[0]?.www).toContain(
      '/.well-known/oauth-protected-resource',
    );
    expect(respostas[0]?.corpo).toBe('{"error":"unauthorized"}');
  });

  it('ignora token na query string (tratado como ausente)', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const r = await fetch(`${s.url}/mcp?access_token=${c.accessToken}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(INICIALIZAR),
    });
    expect(r.status).toBe(401);
  });
});

describe('POST /mcp autorizado (sem sessão)', () => {
  it('initialize devolve as instruções do servidor e não cria sessão', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const r = await chamarMcp(s, c.accessToken, INICIALIZAR);
    expect(r.status).toBe(200);
    expect(r.headers.get('mcp-session-id')).toBeNull();
    const json = (await r.json()) as {
      result: { serverInfo: { name: string }; instructions?: string };
    };
    expect(json.result.serverInfo.name).toBe('financas');
    expect(json.result.instructions).toContain('sobra = receita − despesa');
  });

  it('pedidos independentes funcionam sem initialize prévio (cada um carrega seu bearer)', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const r = await chamarMcp(s, c.accessToken, LISTAR_FERRAMENTAS);
    expect(r.status).toBe(200);
    const json = (await r.json()) as { result: { tools: { name: string }[] } };
    expect(json.result.tools.map(t => t.name)).toContain('gasto_por_categoria');
  });

  it('tools/call roda a ferramenta e devolve dados mascarados', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const r = await chamarMcp(
      s,
      c.accessToken,
      chamarFerramenta('transacoes', {
        inicio: '2026-09-01',
        fim: '2026-09-30',
      }),
    );
    const texto = JSON.stringify(await r.json());
    expect(texto).toContain('Mercado');
    expect(texto).not.toContain('123.456.789-09');
    expect(texto).toContain('[CPF]');
  });
});

describe('outros métodos e origens', () => {
  it('GET e DELETE em /mcp ⇒ 405 com Allow: POST', async () => {
    s = await subirServico();
    for (const method of ['GET', 'DELETE']) {
      const r = await fetch(`${s.url}/mcp`, { method });
      expect(r.status).toBe(405);
      expect(r.headers.get('allow')).toBe('POST');
    }
  });

  it('Origin estranho ⇒ 403; sem Origin (cliente de servidor) segue; Origin de provedor conhecido segue', async () => {
    s = await subirServico();
    const c = await conectar(s);
    expect(
      (
        await chamarMcp(s, c.accessToken, INICIALIZAR, {
          origin: 'https://evil.example',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await chamarMcp(s, c.accessToken, INICIALIZAR, {
          origin: 'https://claude.ai',
        })
      ).status,
    ).toBe(200);
    expect((await chamarMcp(s, c.accessToken, INICIALIZAR)).status).toBe(200);
  });

  it('corpo acima de 100 kB é recusado', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const grande = {
      ...INICIALIZAR,
      params: { ...INICIALIZAR.params, lixo: 'x'.repeat(120_000) },
    };
    const r = await chamarMcp(s, c.accessToken, grande);
    expect(r.status).toBe(413);
  });
});
