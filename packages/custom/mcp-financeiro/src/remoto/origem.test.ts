import { describe, expect, it } from 'vitest';

import { ipDoPedido, ipNaFaixa, origemPermitida } from './origem';

describe('ipDoPedido', () => {
  it('usa a última entrada do X-Forwarded-For (a que o frontend confiável acrescentou)', () => {
    expect(ipDoPedido({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' })).toBe(
      '3.3.3.3',
    );
  });

  it('pula N proxies confiáveis no fim', () => {
    expect(
      ipDoPedido(
        { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
        { saltos: 1 },
      ),
    ).toBe('2.2.2.2');
  });

  it('usa o IP do socket quando não há cabeçalho', () => {
    expect(ipDoPedido({}, { socketIp: '10.0.0.5' })).toBe('10.0.0.5');
  });

  it('aceita cabeçalho repetido como lista e ignora lixo', () => {
    expect(ipDoPedido({ 'x-forwarded-for': ['9.9.9.9', '8.8.8.8'] })).toBe(
      '8.8.8.8',
    );
    expect(ipDoPedido({ 'x-forwarded-for': 'não é ip' })).toBeNull();
    expect(ipDoPedido({})).toBeNull();
  });
});

describe('ipNaFaixa', () => {
  it('IPv4 em /21 (faixa publicada do Claude)', () => {
    expect(ipNaFaixa('160.79.104.1', ['160.79.104.0/21'])).toBe(true);
    expect(ipNaFaixa('160.79.111.255', ['160.79.104.0/21'])).toBe(true);
    expect(ipNaFaixa('160.79.112.0', ['160.79.104.0/21'])).toBe(false);
    expect(ipNaFaixa('160.79.103.255', ['160.79.104.0/21'])).toBe(false);
  });

  it('IPv6 e IPv4 mapeado em IPv6', () => {
    expect(ipNaFaixa('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(ipNaFaixa('2001:db9::1', ['2001:db8::/32'])).toBe(false);
    expect(ipNaFaixa('::ffff:160.79.104.9', ['160.79.104.0/21'])).toBe(true);
  });

  it('/32 e várias faixas', () => {
    expect(ipNaFaixa('1.2.3.4', ['9.9.9.9/32', '1.2.3.4/32'])).toBe(true);
    expect(ipNaFaixa('1.2.3.5', ['1.2.3.4/32'])).toBe(false);
  });
});

describe('origemPermitida', () => {
  it('lista vazia = filtro desligado: tudo passa, inclusive IP desconhecido', () => {
    expect(origemPermitida('1.2.3.4', [])).toBe(true);
    expect(origemPermitida(null, [])).toBe(true);
  });

  it('com lista, IP desconhecido ou fora da faixa é recusado', () => {
    expect(origemPermitida(null, ['1.2.3.0/24'])).toBe(false);
    expect(origemPermitida('9.9.9.9', ['1.2.3.0/24'])).toBe(false);
    expect(origemPermitida('1.2.3.9', ['1.2.3.0/24'])).toBe(true);
  });
});
