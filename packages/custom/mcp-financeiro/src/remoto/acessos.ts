// Regras dos acessos (spec 010, data-model.md §1). Puras: sem I/O, sem relógio
// próprio — quem chama passa `now`. Toda função devolve um estado NOVO.

import { z } from 'zod';

export type Regras = {
  inatividadeDias: number;
  absolutoDias: number;
  /** Tolerância a retentativa do cliente com o refresh anterior. */
  graceRefreshSeg: number;
  tetoPorPessoa: number;
  retencaoDias: number;
  /** Intervalo mínimo entre gravações de "último uso". */
  usoIntervaloMin: number;
};

export const REGRAS_PADRAO: Regras = {
  inatividadeDias: 30,
  absolutoDias: 180,
  graceRefreshSeg: 60,
  tetoPorPessoa: 10,
  retencaoDias: 90,
  usoIntervaloMin: 10,
};

export const MOTIVOS_ENCERRAMENTO = [
  'manual',
  'todos',
  'reuso-de-refresh',
  'pessoa-removida',
  'teto',
] as const;
export type MotivoEncerramento = (typeof MOTIVOS_ENCERRAMENTO)[number];

const acessoSchema = z.object({
  rotulo: z.string(),
  pessoa: z.string(),
  cliente: z.string(),
  criadoEm: z.string(),
  ultimoUsoEm: z.string(),
  expiraEm: z.string(),
  expiraAbsolutoEm: z.string(),
  estado: z.enum(['ativo', 'encerrado']),
  encerradoEm: z.string().nullable(),
  motivoEncerramento: z.enum(MOTIVOS_ENCERRAMENTO).nullable(),
  refreshAtualHash: z.string(),
  refreshAnteriorHash: z.string().nullable(),
  rotacionadoEm: z.string(),
});

const estadoSchema = z.object({
  versao: z.literal(1),
  revogadoAntesDe: z.string().nullable().default(null),
  escritaHabilitada: z.boolean().default(true),
  acessos: z.record(z.string(), acessoSchema).default({}),
});

export type Acesso = z.infer<typeof acessoSchema>;
export type Estado = z.infer<typeof estadoSchema>;

export const estadoVazio = (): Estado => ({
  versao: 1,
  revogadoAntesDe: null,
  escritaHabilitada: true,
  acessos: {},
});

/** Valida o JSON vindo do armazenamento. Lança se não for um estado conhecido. */
export function parseEstado(bruto: unknown): Estado {
  return estadoSchema.parse(bruto);
}

const DIA_MS = 86_400_000;
const iso = (d: Date) => d.toISOString();
const somaDias = (d: Date, dias: number) =>
  new Date(d.getTime() + dias * DIA_MS);
const menor = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);

function prazoInatividade(now: Date, acesso: Acesso, regras: Regras): string {
  return iso(
    menor(
      somaDias(now, regras.inatividadeDias),
      new Date(acesso.expiraAbsolutoEm),
    ),
  );
}

function expirou(acesso: Acesso, now: Date): boolean {
  return (
    now.getTime() >= new Date(acesso.expiraEm).getTime() ||
    now.getTime() >= new Date(acesso.expiraAbsolutoEm).getTime()
  );
}

function comAcesso(estado: Estado, id: string, acesso: Acesso): Estado {
  return { ...estado, acessos: { ...estado.acessos, [id]: acesso } };
}

function fechar(acesso: Acesso, motivo: MotivoEncerramento, now: Date): Acesso {
  return {
    ...acesso,
    estado: 'encerrado',
    encerradoEm: iso(now),
    motivoEncerramento: motivo,
  };
}

// ---------------------------------------------------------------------------

export type NovoAcesso = {
  id: string;
  rotulo: string;
  pessoa: string;
  cliente: string;
  now: Date;
  refreshHash: string;
};

export function conceder(
  estado: Estado,
  novo: NovoAcesso,
  regras: Regras,
): Estado {
  let atual = estado;

  // Teto por pessoa: encerra o ativo mais antigo sem uso em vez de recusar o login.
  const ativosDaPessoa = Object.entries(atual.acessos)
    .filter(([, a]) => a.pessoa === novo.pessoa && a.estado === 'ativo')
    .sort(([, a], [, b]) => a.ultimoUsoEm.localeCompare(b.ultimoUsoEm));
  const excesso = ativosDaPessoa.length - regras.tetoPorPessoa + 1;
  for (const [id, acesso] of ativosDaPessoa.slice(0, Math.max(0, excesso))) {
    atual = comAcesso(atual, id, fechar(acesso, 'teto', novo.now));
  }

  const absoluto = somaDias(novo.now, regras.absolutoDias);
  const acesso: Acesso = {
    rotulo: novo.rotulo,
    pessoa: novo.pessoa,
    cliente: novo.cliente,
    criadoEm: iso(novo.now),
    ultimoUsoEm: iso(novo.now),
    expiraEm: iso(menor(somaDias(novo.now, regras.inatividadeDias), absoluto)),
    expiraAbsolutoEm: iso(absoluto),
    estado: 'ativo',
    encerradoEm: null,
    motivoEncerramento: null,
    refreshAtualHash: novo.refreshHash,
    refreshAnteriorHash: null,
    rotacionadoEm: iso(novo.now),
  };
  return comAcesso(atual, novo.id, acesso);
}

export type ResultadoValidacao =
  | { ok: true; acesso: Acesso }
  | {
      ok: false;
      motivo:
        | 'inexistente'
        | 'encerrado'
        | 'revogado-em-massa'
        | 'pessoa-removida'
        | 'expirado';
    };

export function validar(
  estado: Estado,
  gid: string,
  now: Date,
  pessoasAutorizadas: string[],
  _regras: Regras,
): ResultadoValidacao {
  const acesso = estado.acessos[gid];
  if (!acesso) return { ok: false, motivo: 'inexistente' };
  if (acesso.estado === 'encerrado') return { ok: false, motivo: 'encerrado' };
  if (
    estado.revogadoAntesDe !== null &&
    new Date(acesso.criadoEm).getTime() <
      new Date(estado.revogadoAntesDe).getTime()
  ) {
    return { ok: false, motivo: 'revogado-em-massa' };
  }
  if (!pessoasAutorizadas.includes(acesso.pessoa)) {
    return { ok: false, motivo: 'pessoa-removida' };
  }
  if (expirou(acesso, now)) return { ok: false, motivo: 'expirado' };
  return { ok: true, acesso };
}

/** Grava "último uso" no máximo a cada `usoIntervaloMin`; senão devolve o MESMO estado. */
export function registrarUso(
  estado: Estado,
  gid: string,
  now: Date,
  regras: Regras,
): Estado {
  const acesso = estado.acessos[gid];
  if (!acesso || acesso.estado !== 'ativo') return estado;
  const desdeUltimo = now.getTime() - new Date(acesso.ultimoUsoEm).getTime();
  if (desdeUltimo < regras.usoIntervaloMin * 60_000) return estado;
  return comAcesso(estado, gid, {
    ...acesso,
    ultimoUsoEm: iso(now),
    expiraEm: prazoInatividade(now, acesso, regras),
  });
}

export type ResultadoRotacao =
  | { ok: true; estado: Estado }
  | {
      ok: false;
      estado: Estado;
      motivo: 'invalido' | 'encerrado' | 'expirado' | 'reuso-de-refresh';
    };

export function rotacionar(
  estado: Estado,
  gid: string,
  apresentadoHash: string,
  novoHash: string,
  now: Date,
  regras: Regras,
): ResultadoRotacao {
  const acesso = estado.acessos[gid];
  if (!acesso) return { ok: false, estado, motivo: 'invalido' };
  if (acesso.estado === 'encerrado') {
    return { ok: false, estado, motivo: 'encerrado' };
  }
  if (expirou(acesso, now)) return { ok: false, estado, motivo: 'expirado' };

  const girar = (): ResultadoRotacao => ({
    ok: true,
    estado: comAcesso(estado, gid, {
      ...acesso,
      refreshAnteriorHash: acesso.refreshAtualHash,
      refreshAtualHash: novoHash,
      rotacionadoEm: iso(now),
      ultimoUsoEm: iso(now),
      expiraEm: prazoInatividade(now, acesso, regras),
    }),
  });

  if (apresentadoHash === acesso.refreshAtualHash) return girar();

  if (
    acesso.refreshAnteriorHash !== null &&
    apresentadoHash === acesso.refreshAnteriorHash
  ) {
    const desdeRotacao =
      now.getTime() - new Date(acesso.rotacionadoEm).getTime();
    if (desdeRotacao <= regras.graceRefreshSeg * 1000) return girar(); // retentativa legítima
    return {
      ok: false,
      motivo: 'reuso-de-refresh',
      estado: comAcesso(estado, gid, fechar(acesso, 'reuso-de-refresh', now)),
    };
  }
  return { ok: false, estado, motivo: 'invalido' };
}

export function encerrar(
  estado: Estado,
  gid: string,
  motivo: MotivoEncerramento,
  now: Date,
): Estado {
  const acesso = estado.acessos[gid];
  if (!acesso || acesso.estado !== 'ativo') return estado;
  return comAcesso(estado, gid, fechar(acesso, motivo, now));
}

export function encerrarTodos(estado: Estado, now: Date): Estado {
  let atual: Estado = { ...estado, revogadoAntesDe: iso(now) };
  for (const [id, acesso] of Object.entries(atual.acessos)) {
    if (acesso.estado === 'ativo') {
      atual = comAcesso(atual, id, fechar(acesso, 'todos', now));
    }
  }
  return atual;
}

export function encerrarPessoa(
  estado: Estado,
  pessoa: string,
  now: Date,
): Estado {
  let atual = estado;
  for (const [id, acesso] of Object.entries(atual.acessos)) {
    if (acesso.pessoa === pessoa && acesso.estado === 'ativo') {
      atual = comAcesso(atual, id, fechar(acesso, 'pessoa-removida', now));
    }
  }
  return atual;
}

/** Tira do estado o que terminou há mais de `retencaoDias`. */
export function limpar(estado: Estado, now: Date, regras: Regras): Estado {
  const corte = now.getTime() - regras.retencaoDias * DIA_MS;
  const acessos: Record<string, Acesso> = {};
  for (const [id, acesso] of Object.entries(estado.acessos)) {
    const terminouEm =
      acesso.estado === 'encerrado'
        ? new Date(acesso.encerradoEm ?? acesso.criadoEm).getTime()
        : Math.min(
            new Date(acesso.expiraEm).getTime(),
            new Date(acesso.expiraAbsolutoEm).getTime(),
          );
    const terminou = acesso.estado === 'encerrado' || expirou(acesso, now);
    if (!(terminou && terminouEm < corte)) acessos[id] = acesso;
  }
  return { ...estado, acessos };
}

export type LinhaAcesso = {
  id: string;
  rotulo: string;
  pessoa: string;
  cliente: string;
  criadoEm: string;
  ultimoUsoEm: string;
  expiraEm: string;
  estado: 'ativo' | 'expirado' | 'encerrado';
};

/** Visão para o CLI: sem hashes e sem dado pessoal. */
export function listar(
  estado: Estado,
  now: Date,
  _pessoasAutorizadas: string[],
): LinhaAcesso[] {
  return Object.entries(estado.acessos)
    .map(([id, a]) => ({
      id,
      rotulo: a.rotulo,
      pessoa: a.pessoa,
      cliente: a.cliente,
      criadoEm: a.criadoEm,
      ultimoUsoEm: a.ultimoUsoEm,
      expiraEm: a.expiraEm,
      estado:
        a.estado === 'encerrado'
          ? ('encerrado' as const)
          : expirou(a, now)
            ? ('expirado' as const)
            : ('ativo' as const),
    }))
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}
