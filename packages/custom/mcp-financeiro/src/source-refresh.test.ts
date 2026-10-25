import { describe, expect, it } from 'vitest';

import { OrcamentoCarregandoError } from './erros';
import {
  envolverComRefresh,
  fonteDeAberturaAssincrona,
} from './source-refresh';
import type { FonteComSync } from './source-refresh';

const MIN = 60_000;

function base(): FonteComSync & { syncs: number; leituras: number } {
  const f = {
    syncs: 0,
    leituras: 0,
    async sync() {
      f.syncs++;
    },
    async loadTransactions() {
      f.leituras++;
      return [];
    },
    async listAccounts() {
      f.leituras++;
      return [];
    },
    async listCategories() {
      f.leituras++;
      return [];
    },
    async close() {
      return undefined;
    },
  };
  return f;
}

describe('envolverComRefresh', () => {
  it('não sincroniza enquanto o orçamento tem menos de 5 minutos', async () => {
    let agora = 0;
    const b = base();
    const f = envolverComRefresh(b, {
      maxIdadeMs: 5 * MIN,
      agora: () => agora,
      iniciadoEm: 0,
    });
    agora = 4 * MIN;
    await f.loadTransactions({ start: '2026-01-01', end: '2026-01-31' });
    expect(b.syncs).toBe(0);
    expect(b.leituras).toBe(1);
  });

  it('sincroniza antes de ler quando passou do limite, e atualiza o instante', async () => {
    let agora = 0;
    const b = base();
    const f = envolverComRefresh(b, {
      maxIdadeMs: 5 * MIN,
      agora: () => agora,
      iniciadoEm: 0,
    });
    agora = 6 * MIN;
    await f.listAccounts();
    expect(b.syncs).toBe(1);
    expect(f.atualizadoEm?.()).toBe(new Date(6 * MIN).toISOString());
    agora = 8 * MIN;
    await f.listCategories();
    expect(b.syncs).toBe(1);
  });

  it('serializa pedidos simultâneos: uma única sincronização', async () => {
    let agora = 0;
    const b = base();
    let liberar!: () => void;
    b.sync = () =>
      new Promise<void>(ok => {
        b.syncs++;
        liberar = ok;
      });
    const f = envolverComRefresh(b, {
      maxIdadeMs: 5 * MIN,
      agora: () => agora,
      iniciadoEm: 0,
    });
    agora = 6 * MIN;
    const leituras = Promise.all([
      f.listAccounts(),
      f.listCategories(),
      f.loadTransactions({ start: 'a', end: 'b' }),
    ]);
    await new Promise(r => setTimeout(r, 5));
    liberar();
    await leituras;
    expect(b.syncs).toBe(1);
    expect(b.leituras).toBe(3);
  });

  it('se a sincronização falha, o erro chega ao chamador e o instante NÃO avança', async () => {
    let agora = 0;
    const b = base();
    b.sync = async () => {
      throw new Error('fetch failed');
    };
    const f = envolverComRefresh(b, {
      maxIdadeMs: 5 * MIN,
      agora: () => agora,
      iniciadoEm: 0,
    });
    agora = 6 * MIN;
    await expect(f.listAccounts()).rejects.toThrow('fetch failed');
    expect(f.atualizadoEm?.()).toBe(new Date(0).toISOString());
  });
});

describe('fonteDeAberturaAssincrona', () => {
  it('as leituras esperam a abertura terminar', async () => {
    let abrir!: (f: FonteComSync) => void;
    const promessa = new Promise<FonteComSync>(ok => {
      abrir = ok;
    });
    const f = fonteDeAberturaAssincrona(promessa, { esperaMaxMs: 1000 });
    const leitura = f.listAccounts();
    abrir(base());
    await expect(leitura).resolves.toEqual([]);
  });

  it('passando do tempo de espera ⇒ OrcamentoCarregandoError (e a abertura segue em segundo plano)', async () => {
    const f = fonteDeAberturaAssincrona(
      new Promise<FonteComSync>(() => undefined),
      { esperaMaxMs: 10 },
    );
    await expect(f.listAccounts()).rejects.toBeInstanceOf(
      OrcamentoCarregandoError,
    );
  });

  it('erro na abertura chega às leituras como o erro original', async () => {
    const f = fonteDeAberturaAssincrona(
      Promise.reject(new Error('invalid or expired session token')),
      { esperaMaxMs: 1000 },
    );
    await expect(f.listAccounts()).rejects.toThrow(
      'invalid or expired session token',
    );
  });
});
