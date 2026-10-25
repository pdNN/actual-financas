// Janela deslizante em memória (spec 010, RF-019). Um limitador por finalidade:
// falhas de autenticação por IP, registros por IP, consultas por acesso.

export type ResultadoLimite =
  | { permitido: true }
  | { permitido: false; retryAfterSeg: number };

export type Limitador = {
  /** Conta o pedido e diz se cabe. */
  tentar(chave: string): ResultadoLimite;
  /** Só olha, sem contar. */
  verificar(chave: string): ResultadoLimite;
  /** Só conta (ex.: depois de uma falha de autenticação). */
  registrar(chave: string): void;
  tamanho(): number;
};

type Opcoes = {
  janelaMs: number;
  max: number;
  agora: () => number;
  maxChaves?: number;
};

export function criarLimitador(opcoes: Opcoes): Limitador {
  const { janelaMs, max, agora } = opcoes;
  const maxChaves = opcoes.maxChaves ?? 10_000;
  const hits = new Map<string, number[]>();

  const podar = (chave: string, agoraMs: number): number[] => {
    const vigentes = (hits.get(chave) ?? []).filter(
      t => t > agoraMs - janelaMs,
    );
    if (vigentes.length === 0) hits.delete(chave);
    else hits.set(chave, vigentes);
    return vigentes;
  };

  const varrer = (agoraMs: number) => {
    if (hits.size < maxChaves) return;
    for (const chave of [...hits.keys()]) podar(chave, agoraMs);
  };

  const decidir = (vigentes: number[], agoraMs: number): ResultadoLimite => {
    if (vigentes.length < max) return { permitido: true };
    const maisAntigo = vigentes[0] as number;
    const restanteMs = maisAntigo + janelaMs - agoraMs;
    return {
      permitido: false,
      retryAfterSeg: Math.max(1, Math.ceil(restanteMs / 1000)),
    };
  };

  return {
    tentar(chave) {
      const t = agora();
      varrer(t);
      const vigentes = podar(chave, t);
      const resultado = decidir(vigentes, t);
      if (resultado.permitido) hits.set(chave, [...vigentes, t]);
      return resultado;
    },
    verificar(chave) {
      const t = agora();
      return decidir(podar(chave, t), t);
    },
    registrar(chave) {
      const t = agora();
      varrer(t);
      hits.set(chave, [...podar(chave, t), t]);
    },
    tamanho: () => hits.size,
  };
}
