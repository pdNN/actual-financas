// Lista de pessoas autorizadas (spec 010, data-model.md §2): arquivo montado de
// um secret, relido a cada ≤ ttlMs. FALHA FECHADA: ausente, inválido, vazio ou
// com mais de 2 entradas ⇒ ninguém entra. Nunca expõe o e-mail para fora daqui.

export type ResultadoParse =
  | { ok: true; pessoas: Record<string, string> }
  | { ok: false; motivo: 'ausente' | 'invalido' | 'vazio' | 'excesso' };

const CHAVE = /^[a-z0-9_-]{1,20}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_PESSOAS = 2;

export function parseAutorizadas(texto: string | undefined): ResultadoParse {
  if (texto === undefined || texto.trim() === '') {
    return { ok: false, motivo: 'ausente' };
  }

  let bruto: unknown; // JSON externo: validado campo a campo abaixo
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'invalido' };
  }
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    return { ok: false, motivo: 'invalido' };
  }

  const entradas = Object.entries(bruto as Record<string, unknown>);
  if (entradas.length === 0) return { ok: false, motivo: 'vazio' };
  if (entradas.length > MAX_PESSOAS) return { ok: false, motivo: 'excesso' };

  const pessoas: Record<string, string> = {};
  for (const [chave, email] of entradas) {
    if (!CHAVE.test(chave) || typeof email !== 'string') {
      return { ok: false, motivo: 'invalido' };
    }
    const limpo = email.trim().toLowerCase();
    if (!EMAIL.test(limpo)) return { ok: false, motivo: 'invalido' };
    pessoas[chave] = limpo;
  }
  return { ok: true, pessoas };
}

export type Autorizadas = {
  /** Chave da pessoa dona do e-mail, ou `null`. Nunca devolve o e-mail. */
  pessoaPorEmail(email: string): Promise<string | null>;
  pessoasAtuais(): Promise<string[]>;
};

export function criarAutorizadas(opcoes: {
  ler: () => Promise<string | undefined>;
  ttlMs: number;
  agora: () => number;
}): Autorizadas {
  let cache: { pessoas: Record<string, string>; em: number } | null = null;

  const obter = async (): Promise<Record<string, string>> => {
    if (cache && opcoes.agora() - cache.em < opcoes.ttlMs) return cache.pessoas;
    let pessoas: Record<string, string> = {};
    try {
      const resultado = parseAutorizadas(await opcoes.ler());
      if (resultado.ok) pessoas = resultado.pessoas;
    } catch {
      pessoas = {}; // falha fechada
    }
    cache = { pessoas, em: opcoes.agora() };
    return pessoas;
  };

  return {
    async pessoaPorEmail(email) {
      const alvo = email.trim().toLowerCase();
      const achou = Object.entries(await obter()).find(([, e]) => e === alvo);
      return achou ? achou[0] : null;
    },
    async pessoasAtuais() {
      return Object.keys(await obter());
    },
  };
}
