import { describe, expect, it } from 'vitest';

import { criarLimitador } from './limites';

describe('criarLimitador', () => {
  it('permite até o máximo na janela e depois bloqueia com Retry-After', () => {
    let agora = 0;
    const l = criarLimitador({ janelaMs: 60_000, max: 3, agora: () => agora });
    expect(l.tentar('ip1').permitido).toBe(true);
    agora = 1_000;
    expect(l.tentar('ip1').permitido).toBe(true);
    agora = 2_000;
    expect(l.tentar('ip1').permitido).toBe(true);
    agora = 3_000;
    const r = l.tentar('ip1');
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.retryAfterSeg).toBe(57);
  });

  it('a janela desliza: depois do tempo volta a permitir', () => {
    let agora = 0;
    const l = criarLimitador({ janelaMs: 60_000, max: 1, agora: () => agora });
    expect(l.tentar('k').permitido).toBe(true);
    agora = 30_000;
    expect(l.tentar('k').permitido).toBe(false);
    agora = 60_001;
    expect(l.tentar('k').permitido).toBe(true);
  });

  it('chaves são independentes', () => {
    const l = criarLimitador({ janelaMs: 60_000, max: 1, agora: () => 0 });
    expect(l.tentar('a').permitido).toBe(true);
    expect(l.tentar('b').permitido).toBe(true);
    expect(l.tentar('a').permitido).toBe(false);
  });

  it('verificar não consome; registrar consome', () => {
    const l = criarLimitador({ janelaMs: 60_000, max: 1, agora: () => 0 });
    expect(l.verificar('k').permitido).toBe(true);
    expect(l.verificar('k').permitido).toBe(true);
    l.registrar('k');
    expect(l.verificar('k').permitido).toBe(false);
  });

  it('descarta chaves antigas (memória limitada)', () => {
    let agora = 0;
    const l = criarLimitador({
      janelaMs: 1_000,
      max: 5,
      agora: () => agora,
      maxChaves: 10,
    });
    for (let i = 0; i < 10; i++) l.tentar(`k${i}`);
    expect(l.tamanho()).toBe(10);
    agora = 5_000;
    l.tentar('nova');
    expect(l.tamanho()).toBeLessThanOrEqual(2);
  });
});
