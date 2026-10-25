import { describe, expect, it } from 'vitest';

import { estadoVazio } from './acessos';
import type { Estado } from './acessos';
import {
  criarEstadoEmMemoria,
  criarGerenciadorEstado,
  ErroConflitoEstado,
} from './estado-store';
import type { EstadoStore } from './estado-store';

function comRotulo(estado: Estado, id: string): Estado {
  return {
    ...estado,
    acessos: {
      ...estado.acessos,
      [id]: {
        rotulo: id,
        pessoa: 'pedro',
        cliente: 'c',
        criadoEm: '2026-10-25T00:00:00.000Z',
        ultimoUsoEm: '2026-10-25T00:00:00.000Z',
        expiraEm: '2026-11-25T00:00:00.000Z',
        expiraAbsolutoEm: '2027-04-25T00:00:00.000Z',
        estado: 'ativo',
        encerradoEm: null,
        motivoEncerramento: null,
        refreshAtualHash: 'h',
        refreshAnteriorHash: null,
        rotacionadoEm: '2026-10-25T00:00:00.000Z',
      },
    },
  };
}

describe('criarEstadoEmMemoria', () => {
  it('começa vazio e grava só com a geração esperada', async () => {
    const store = criarEstadoEmMemoria();
    const { estado, geracao } = await store.ler();
    expect(estado).toEqual(estadoVazio());
    const ok = await store.gravar(comRotulo(estado, 'a'), geracao);
    expect(ok.ok).toBe(true);
    const conflito = await store.gravar(comRotulo(estado, 'b'), geracao);
    expect(conflito).toEqual({ ok: false, motivo: 'conflito' });
  });
});

describe('criarGerenciadorEstado', () => {
  it('serve leituras do cache por até 30 s e relê depois', async () => {
    let leituras = 0;
    const base = criarEstadoEmMemoria();
    const store: EstadoStore = {
      ler: async () => {
        leituras++;
        return base.ler();
      },
      gravar: (e, g) => base.gravar(e, g),
    };
    let agora = 1_000_000;
    const g = criarGerenciadorEstado(store, {
      ttlMs: 30_000,
      agora: () => agora,
    });
    await g.ler();
    await g.ler();
    agora += 29_000;
    await g.ler();
    expect(leituras).toBe(1);
    agora += 2_000;
    await g.ler();
    expect(leituras).toBe(2);
  });

  it('atualizar aplica a função sobre o estado atual e atualiza o cache', async () => {
    const store = criarEstadoEmMemoria();
    const g = criarGerenciadorEstado(store, { ttlMs: 30_000, agora: () => 0 });
    await g.atualizar(e => comRotulo(e, 'a'));
    expect(Object.keys((await g.ler()).acessos)).toEqual(['a']);
    expect(Object.keys((await store.ler()).estado.acessos)).toEqual(['a']);
  });

  it('em conflito de geração relê, reaplica e tenta de novo', async () => {
    const base = criarEstadoEmMemoria();
    let intrusoUsado = false;
    const store: EstadoStore = {
      ler: () => base.ler(),
      gravar: async (e, g) => {
        if (!intrusoUsado) {
          // outro processo (ex.: o CLI do Pedro) grava entre a leitura e a escrita
          intrusoUsado = true;
          const atual = await base.ler();
          await base.gravar(comRotulo(atual.estado, 'externo'), atual.geracao);
        }
        return base.gravar(e, g);
      },
    };
    const g = criarGerenciadorEstado(store, { ttlMs: 0, agora: () => 0 });
    const resultado = await g.atualizar(e => comRotulo(e, 'meu'));
    expect(Object.keys(resultado.acessos).sort()).toEqual(['externo', 'meu']);
  });

  it('desiste depois de 5 tentativas com erro distinguível, sem gravar às cegas', async () => {
    const base = criarEstadoEmMemoria();
    let tentativas = 0;
    const store: EstadoStore = {
      ler: () => base.ler(),
      gravar: async () => {
        tentativas++;
        return { ok: false, motivo: 'conflito' };
      },
    };
    const g = criarGerenciadorEstado(store, { ttlMs: 0, agora: () => 0 });
    await expect(g.atualizar(e => comRotulo(e, 'x'))).rejects.toBeInstanceOf(
      ErroConflitoEstado,
    );
    expect(tentativas).toBe(5);
  });

  it('não grava se a função devolve o mesmo estado (nada a fazer)', async () => {
    const base = criarEstadoEmMemoria();
    let gravacoes = 0;
    const store: EstadoStore = {
      ler: () => base.ler(),
      gravar: async (e, g) => {
        gravacoes++;
        return base.gravar(e, g);
      },
    };
    const g = criarGerenciadorEstado(store, { ttlMs: 0, agora: () => 0 });
    await g.atualizar(e => e);
    expect(gravacoes).toBe(0);
  });
});
