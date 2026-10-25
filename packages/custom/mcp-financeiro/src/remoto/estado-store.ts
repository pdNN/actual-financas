// Armazenamento do estado dos acessos (spec 010, data-model.md §1): uma interface
// pequena, uma versão em memória (testes) e um gerenciador com cache curto e
// escrita otimista (releitura e nova tentativa em caso de conflito).

import { estadoVazio } from './acessos.ts';
import type { Estado } from './acessos.ts';

export type Versionado = { estado: Estado; geracao: string };

export type ResultadoGravacao =
  | { ok: true; geracao: string }
  | { ok: false; motivo: 'conflito' };

export type EstadoStore = {
  ler(): Promise<Versionado>;
  /** Só grava se a geração atual for `geracaoEsperada`. */
  gravar(estado: Estado, geracaoEsperada: string): Promise<ResultadoGravacao>;
};

export class ErroConflitoEstado extends Error {
  constructor() {
    super('Não foi possível gravar o estado: conflito persistente de geração.');
    this.name = 'ErroConflitoEstado';
  }
}

export function criarEstadoEmMemoria(
  inicial: Estado = estadoVazio(),
): EstadoStore {
  let estado = inicial;
  let geracao = 1;
  return {
    async ler() {
      return { estado, geracao: String(geracao) };
    },
    async gravar(novo, geracaoEsperada) {
      if (geracaoEsperada !== String(geracao)) {
        return { ok: false, motivo: 'conflito' };
      }
      estado = novo;
      geracao += 1;
      return { ok: true, geracao: String(geracao) };
    },
  };
}

export type GerenciadorEstado = {
  /** Leitura com cache de até `ttlMs`. */
  ler(): Promise<Estado>;
  /**
   * Lê o estado FRESCO, aplica `alterar` e grava. Em conflito relê e reaplica
   * (até 5 vezes). Se `alterar` devolver o mesmo objeto, não grava.
   */
  atualizar(
    alterar: (estado: Estado) => Estado | Promise<Estado>,
  ): Promise<Estado>;
};

const MAX_TENTATIVAS = 5;

export function criarGerenciadorEstado(
  store: EstadoStore,
  opcoes: { ttlMs: number; agora: () => number },
): GerenciadorEstado {
  let cache: { estado: Estado; em: number } | null = null;

  return {
    async ler() {
      if (cache && opcoes.agora() - cache.em < opcoes.ttlMs) {
        return cache.estado;
      }
      const { estado } = await store.ler();
      cache = { estado, em: opcoes.agora() };
      return estado;
    },

    async atualizar(alterar) {
      for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa++) {
        const { estado, geracao } = await store.ler();
        const novo = await alterar(estado);
        if (novo === estado) {
          cache = { estado, em: opcoes.agora() };
          return estado;
        }
        const resultado = await store.gravar(novo, geracao);
        if (resultado.ok) {
          cache = { estado: novo, em: opcoes.agora() };
          return novo;
        }
      }
      throw new ErroConflitoEstado();
    },
  };
}
