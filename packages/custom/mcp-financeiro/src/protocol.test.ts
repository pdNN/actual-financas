import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FRASES_CHAVE, INSTRUCTIONS } from './protocol';

const here = dirname(fileURLToPath(import.meta.url));
const subagente = resolve(
  here,
  '../../../../.claude/agents/assistente-financeiro.md',
);

const normalizar = (texto: string) =>
  texto.replace(/\*/g, '').replace(/\s+/g, ' ').trim();

describe('INSTRUCTIONS (o protocolo que viaja com o servidor)', () => {
  it('está em pt-BR, com a definição de sobra e a regra de "sem dados"', () => {
    const texto = normalizar(INSTRUCTIONS);
    expect(texto).toContain('sobra = receita − despesa');
    expect(texto).toContain('não há dados no período');
    expect(texto).toContain('R$');
  });

  it('manda declarar período e definições ao final da análise', () => {
    expect(INSTRUCTIONS).toMatch(/Período:/);
    expect(INSTRUCTIONS).toMatch(/Definições:/);
  });

  it('nas histórias 1 a 3 só lê: recusa escrita com a frase combinada', () => {
    expect(normalizar(INSTRUCTIONS)).toContain(
      'Nesta versão eu só consigo ler o orçamento. Para alterar, faça no Actual.',
    );
  });

  it('manda nunca citar número de conta, cartão, CPF ou CNPJ', () => {
    expect(INSTRUCTIONS).toMatch(/CPF/);
    expect(INSTRUCTIONS).toMatch(/cart/i);
  });

  it('não é gigante (cabe como instrução de servidor)', () => {
    expect(INSTRUCTIONS.length).toBeLessThan(6000);
  });
});

describe('sincronia com o subagente do Claude Code', () => {
  const doSubagente = normalizar(readFileSync(subagente, 'utf8'));

  it.each(FRASES_CHAVE)('a frase-chave existe nos dois lados: %s', frase => {
    expect(normalizar(INSTRUCTIONS)).toContain(frase);
    expect(doSubagente).toContain(frase);
  });
});
