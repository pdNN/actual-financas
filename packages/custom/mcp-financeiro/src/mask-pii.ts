// Máscara determinística de dados que a constituição (princípio VIII) proíbe
// de chegar ao provider de IA: CNPJ, número de cartão e de conta/agência.
// O CPF NÃO é mascarado desde a constituição 1.2.0 (decisão do Pedro,
// 2026-10-25): o payee de um Pix costuma ser só o CPF, e sem ele não dá para
// distinguir salário de transferência.
// Sem modelo, sem rede: expressões regulares e dígitos verificadores.

function digitsOf(text: string): number[] {
  return [...text.replace(/\D/g, '')].map(Number);
}

function isValidCnpj(text: string): boolean {
  const d = digitsOf(text);
  if (d.length !== 14 || d.every(x => x === d[0])) return false;
  const check = (len: number) => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * d[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === d[12] && check(13) === d[13];
}

function passesLuhn(text: string): boolean {
  const d = digitsOf(text);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let digit = d[d.length - 1 - i];
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

const CNPJ_PUNCTUATED =
  /(?<![\d.\-/])\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?![\d])/g;
const DIGIT_RUN_14 = /(?<![\d.,\-/])\d{14}(?![\d.,\-/])/g;
// 13 a 19 dígitos, com espaços ou hífens entre grupos.
const CARD_CANDIDATE = /(?<![\d.,\-/])\d(?:[ -]?\d){12,18}(?![\d.,\-/])/g;
// "ag 1234", "agência: 0001", "conta 56789-0", "cc 123456-7".
const LABELED_ACCOUNT =
  /\b(ag(?:[êe]ncia)?|conta|cc)(\s*[:.]?\s*)(\d[\d-]{2,}\d)/gi;

export function maskPii<T>(value: T): T {
  if (typeof value !== 'string') return value;

  let text: string = value;
  text = text.replace(CNPJ_PUNCTUATED, '[CNPJ]');
  text = text.replace(DIGIT_RUN_14, match =>
    isValidCnpj(match) ? '[CNPJ]' : match,
  );
  text = text.replace(CARD_CANDIDATE, match =>
    passesLuhn(match) ? '[CARTAO]' : match,
  );
  text = text.replace(LABELED_ACCOUNT, '$1$2[NUM]');
  return text as unknown as T;
}

/** Mascara toda string de uma estrutura qualquer, preservando o formato. */
export function maskDeep<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return maskPii(node);
    if (typeof node !== 'object' || node === null) return node;

    const known = seen.get(node);
    if (known !== undefined) return known;

    if (Array.isArray(node)) {
      const copy: unknown[] = [];
      seen.set(node, copy);
      for (const item of node) copy.push(walk(item));
      return copy;
    }

    const copy: Record<string, unknown> = {};
    seen.set(node, copy);
    for (const [key, item] of Object.entries(node)) copy[key] = walk(item);
    return copy;
  };

  return walk(value) as T;
}
