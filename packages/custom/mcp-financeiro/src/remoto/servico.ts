// Montagem do serviço remoto a partir do ambiente (spec 010): é o que
// bin/servidor-remoto.mjs usa. Aceita tudo que toca o mundo de fora (Actual,
// arquivo de pessoas, token do GCS, saída de log) por injeção, para teste.

import type { Express } from 'express';
import express from 'express';

import { createFinancasServer } from '../server.ts';
import {
  envolverComRefresh,
  fonteDeAberturaAssincrona,
} from '../source-refresh.ts';
import type { FonteComSync } from '../source-refresh.ts';

import { criarApp } from './app.ts';
import { criarAuditoria } from './auditoria.ts';
import { criarAutorizadas } from './autorizadas.ts';
import { loadConfig } from './config.ts';
import type { Config } from './config.ts';
import { criarEstadoGcs } from './estado-gcs.ts';
import {
  criarEstadoEmMemoria,
  criarGerenciadorEstado,
} from './estado-store.ts';
import type { EstadoStore } from './estado-store.ts';

const ESPERA_ABERTURA_MS = 40_000;
const TTL_CACHE_MS = 30_000;

export type MontagemServico = {
  env: Record<string, string | undefined>;
  /** Abre o orçamento do Actual (download) — roda em segundo plano. */
  abrirOrcamento: (actual: Config['actual']) => Promise<FonteComSync>;
  /** Conteúdo do arquivo de pessoas autorizadas (ou `undefined` se ausente). */
  lerPessoas: () => Promise<string | undefined>;
  obterTokenGcs: () => Promise<string>;
  /** Para teste: não fala com o GCS. */
  estadoEmMemoria?: boolean;
  escrever?: (linha: string) => void;
};

export type ServicoRemoto = {
  app: Express;
  configValida: boolean;
};

export function montarServicoRemoto(m: MontagemServico): ServicoRemoto {
  const auditoria = criarAuditoria({ escrever: m.escrever });
  const resultado = loadConfig(m.env);

  if (!resultado.ok) {
    // Falha fechada: sobe só com /saude (o Cloud Run precisa de um processo vivo
    // para mostrar o erro) e recusa todo o resto. Registra só o NOME da variável.
    for (const variavel of resultado.falhas) {
      auditoria.registrar({
        evento: 'configuracao_invalida',
        resultado: 'erro',
        variavel,
      });
    }
    const app = express();
    app.disable('x-powered-by');
    app.get('/saude', (_req, res) => {
      res.json({ ok: true });
    });
    app.use((_req, res) => {
      res.status(503).json({ error: 'service_unavailable' });
    });
    return { app, configValida: false };
  }

  const { config } = resultado;
  const agora = () => Date.now();

  const store: EstadoStore = m.estadoEmMemoria
    ? criarEstadoEmMemoria()
    : criarEstadoGcs({
        bucket: config.bucketEstado,
        obterToken: m.obterTokenGcs,
      });
  const gerenciador = criarGerenciadorEstado(store, {
    ttlMs: TTL_CACHE_MS,
    agora,
  });
  const autorizadas = criarAutorizadas({
    ler: m.lerPessoas,
    ttlMs: TTL_CACHE_MS,
    agora,
  });

  // O download do orçamento acontece em segundo plano: descoberta, registro e
  // token respondem na hora, mesmo na partida a frio.
  const iniciadoEm = agora();
  const fonte = fonteDeAberturaAssincrona(
    m.abrirOrcamento(config.actual).then(aberta =>
      envolverComRefresh(aberta, {
        maxIdadeMs: config.syncMaxIdadeMin * 60_000,
        agora,
        iniciadoEm,
      }),
    ),
    { esperaMaxMs: ESPERA_ABERTURA_MS },
  );

  const app = criarApp({
    config,
    gerenciador,
    autorizadas,
    auditoria,
    fabricaMcp: () => createFinancasServer(fonte, { ambiente: 'remoto' }),
  });
  return { app, configValida: true };
}
