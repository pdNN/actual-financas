import { describe, expect, it } from 'vitest';

import { maskDeep, maskPii } from './mask-pii';

describe('maskPii', () => {
  it('mascara CPF com pontuação', () => {
    expect(maskPii('PIX de 123.456.789-09 recebido')).toBe(
      'PIX de [CPF] recebido',
    );
  });

  it('mascara CPF só com dígitos (válido)', () => {
    expect(maskPii('doc 12345678909 ok')).toBe('doc [CPF] ok');
  });

  it('mascara CNPJ com e sem pontuação', () => {
    expect(maskPii('12.345.678/0001-95')).toBe('[CNPJ]');
    expect(maskPii('cnpj 12345678000195')).toBe('cnpj [CNPJ]');
  });

  it('mascara cartão que passa em Luhn e deixa intacto o que não passa', () => {
    expect(maskPii('cartão 4539 1488 0343 6467 fim')).toBe(
      'cartão [CARTAO] fim',
    );
    expect(maskPii('4539148803436467')).toBe('[CARTAO]');
    expect(maskPii('1234 5678 9012 3456')).toBe('1234 5678 9012 3456');
  });

  it('mascara número de agência e conta quando rotulado', () => {
    expect(maskPii('ag 1234 conta 56789-0')).toBe('ag [NUM] conta [NUM]');
    expect(maskPii('Agência: 0001, CC 123456-7')).toBe(
      'Agência: [NUM], CC [NUM]',
    );
  });

  it('não altera valores monetários, datas, ids e texto comum', () => {
    const inputs = [
      'R$ 1.234,56',
      '-12345',
      '1234567',
      '2026-10-18',
      '18/10/2026',
      '3f2b8c1e-9d4a-4e7b-8c21-5a6f7e8d9c0b',
      'MERCADO CENTRAL 12/10',
      'Parcela 3/12 de 123,45',
    ];
    for (const input of inputs) {
      expect(maskPii(input)).toBe(input);
    }
  });

  it('é idempotente', () => {
    const once = maskPii('CPF 123.456.789-09 e cartão 4539148803436467');
    expect(maskPii(once)).toBe(once);
  });

  it('não lança com entrada inesperada', () => {
    for (const input of [null, undefined, 42, {}, [], true]) {
      expect(() => maskPii(input as unknown as string)).not.toThrow();
    }
  });
});

describe('maskDeep', () => {
  it('mascara toda string, preservando a estrutura', () => {
    const input = {
      content: [{ type: 'text', text: 'CPF 123.456.789-09' }],
      n: 7,
      ok: true,
      nested: { list: ['12.345.678/0001-95', 3] },
    };
    expect(maskDeep(input)).toEqual({
      content: [{ type: 'text', text: 'CPF [CPF]' }],
      n: 7,
      ok: true,
      nested: { list: ['[CNPJ]', 3] },
    });
  });

  it('não muta o original', () => {
    const input = { text: 'CPF 123.456.789-09' };
    maskDeep(input);
    expect(input.text).toBe('CPF 123.456.789-09');
  });

  it('aguenta referência circular sem lançar', () => {
    const a: Record<string, unknown> = { text: '12345678909' };
    a.self = a;
    expect(() => maskDeep(a)).not.toThrow();
  });
});
