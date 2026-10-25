// Fonte do orçamento para o serviço remoto (spec 010, R-10 e R-12): sincroniza
// antes de ler quando o orçamento tem mais de N minutos, e deixa a abertura inicial
// (download do Actual) acontecer em segundo plano sem bloquear o OAuth.

import { OrcamentoCarregandoError } from './erros.ts';
import type { BudgetSource } from './source.ts';

export type FonteComSync = BudgetSource & { sync(): Promise<void> };

export function envolverComRefresh(
  interna: FonteComSync,
  opcoes: { maxIdadeMs: number; agora: () => number; iniciadoEm: number },
): BudgetSource {
  let ultimaSync = opcoes.iniciadoEm;
  let emAndamento: Promise<void> | null = null;

  const garantirFresco = async (): Promise<void> => {
    if (opcoes.agora() - ultimaSync < opcoes.maxIdadeMs) {
      return;
    }
    if (!emAndamento) {
      emAndamento = interna
        .sync()
        .then(() => {
          ultimaSync = opcoes.agora();
        })
        .finally(() => {
          emAndamento = null;
        });
    }
    await emAndamento;
  };

  return {
    async loadTransactions(range) {
      await garantirFresco();
      return interna.loadTransactions(range);
    },
    async listAccounts() {
      await garantirFresco();
      return interna.listAccounts();
    },
    async listCategories() {
      await garantirFresco();
      return interna.listCategories();
    },
    close: () => interna.close(),
    atualizadoEm: () => new Date(ultimaSync).toISOString(),
  };
}

/**
 * As leituras esperam a abertura terminar, por no máximo `esperaMaxMs`; passado
 * disso respondem "carregando" e a abertura segue em segundo plano.
 */
export function fonteDeAberturaAssincrona(
  abertura: Promise<BudgetSource>,
  opcoes: { esperaMaxMs: number },
): BudgetSource {
  let aberta: BudgetSource | null = null;
  abertura.then(
    fonte => {
      aberta = fonte;
    },
    () => undefined, // o erro volta às leituras pelo `esperar`; aqui só evitamos rejeição solta
  );

  const esperar = async (): Promise<BudgetSource> => {
    if (aberta) {
      return aberta;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(
        () => rejeitar(new OrcamentoCarregandoError()),
        opcoes.esperaMaxMs,
      );
    });
    try {
      return await Promise.race([abertura, limite]);
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    loadTransactions: async range => (await esperar()).loadTransactions(range),
    listAccounts: async () => (await esperar()).listAccounts(),
    listCategories: async () => (await esperar()).listCategories(),
    close: async () => {
      if (aberta) {
        await aberta.close();
      }
    },
    atualizadoEm: () => aberta?.atualizadoEm?.() ?? null,
  };
}
