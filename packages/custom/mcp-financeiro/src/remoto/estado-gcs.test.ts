import { describe, expect, it } from 'vitest';

import { estadoVazio } from './acessos';
import { criarEstadoGcs } from './estado-gcs';

type Chamada = { url: string; init: RequestInit | undefined };

function fetchFalso(respostas: Response[]) {
  const chamadas: Chamada[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    const r = respostas.shift();
    if (!r) throw new Error('sem resposta preparada');
    return r;
  }) as typeof fetch;
  return { impl, chamadas };
}

const TOKEN = 'ya29.token-secreto-de-teste';
const opts = (impl: typeof fetch) => ({
  bucket: 'meu-bucket',
  obterToken: async () => TOKEN,
  fetchImpl: impl,
});

describe('criarEstadoGcs', () => {
  it('lê o objeto e devolve a geração do cabeçalho', async () => {
    const f = fetchFalso([
      new Response(JSON.stringify(estadoVazio()), {
        status: 200,
        headers: { 'x-goog-generation': '1730000000000001' },
      }),
    ]);
    const store = criarEstadoGcs(opts(f.impl));
    const r = await store.ler();
    expect(r.geracao).toBe('1730000000000001');
    expect(r.estado).toEqual(estadoVazio());
    expect(f.chamadas[0].url).toContain('/b/meu-bucket/o/estado.json');
    expect(f.chamadas[0].url).toContain('alt=media');
    const headers = new Headers(f.chamadas[0].init?.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
  });

  it('objeto ausente (404) vira estado vazio com geração 0', async () => {
    const f = fetchFalso([new Response('nada', { status: 404 })]);
    const r = await criarEstadoGcs(opts(f.impl)).ler();
    expect(r).toEqual({ estado: estadoVazio(), geracao: '0' });
  });

  it('grava com ifGenerationMatch e devolve a nova geração', async () => {
    const f = fetchFalso([
      new Response(JSON.stringify({ generation: '1730000000000002' }), {
        status: 200,
      }),
    ]);
    const r = await criarEstadoGcs(opts(f.impl)).gravar(
      estadoVazio(),
      '1730000000000001',
    );
    expect(r).toEqual({ ok: true, geracao: '1730000000000002' });
    expect(f.chamadas[0].url).toContain('ifGenerationMatch=1730000000000001');
    expect(f.chamadas[0].url).toContain('uploadType=media');
    expect(f.chamadas[0].init?.method).toBe('POST');
  });

  it('412 (precondition failed) vira conflito', async () => {
    const f = fetchFalso([new Response('', { status: 412 })]);
    const r = await criarEstadoGcs(opts(f.impl)).gravar(estadoVazio(), '1');
    expect(r).toEqual({ ok: false, motivo: 'conflito' });
  });

  it('erro do servidor vira exceção SEM token, corpo nem URL com segredo', async () => {
    const f = fetchFalso([
      new Response('corpo com detalhe interno', { status: 500 }),
    ]);
    let erro: unknown;
    try {
      await criarEstadoGcs(opts(f.impl)).ler();
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(Error);
    const msg = String((erro as Error).message);
    expect(msg).not.toContain(TOKEN);
    expect(msg).not.toContain('corpo com detalhe interno');
  });

  it('estado malformado no bucket é recusado (não é aceito às cegas)', async () => {
    const f = fetchFalso([
      new Response(JSON.stringify({ versao: 99 }), {
        status: 200,
        headers: { 'x-goog-generation': '5' },
      }),
    ]);
    await expect(criarEstadoGcs(opts(f.impl)).ler()).rejects.toThrow();
  });
});
