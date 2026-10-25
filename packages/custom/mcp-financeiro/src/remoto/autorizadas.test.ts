import { describe, expect, it } from 'vitest';

import { criarAutorizadas, parseAutorizadas } from './autorizadas';

const DOIS = JSON.stringify({
  pedro: 'Pedro@Exemplo.com',
  julia: 'julia@exemplo.com',
});

describe('parseAutorizadas', () => {
  it('aceita 1 ou 2 pessoas', () => {
    expect(parseAutorizadas(DOIS)).toEqual({
      ok: true,
      pessoas: { pedro: 'pedro@exemplo.com', julia: 'julia@exemplo.com' },
    });
    expect(parseAutorizadas('{"pedro":"p@x.com"}').ok).toBe(true);
  });

  it('falha fechada: ausente, inválido, vazio e mais de 2 entradas', () => {
    expect(parseAutorizadas(undefined)).toEqual({
      ok: false,
      motivo: 'ausente',
    });
    expect(parseAutorizadas('')).toEqual({ ok: false, motivo: 'ausente' });
    expect(parseAutorizadas('{não é json')).toEqual({
      ok: false,
      motivo: 'invalido',
    });
    expect(parseAutorizadas('[]')).toEqual({ ok: false, motivo: 'invalido' });
    expect(parseAutorizadas('{}')).toEqual({ ok: false, motivo: 'vazio' });
    expect(
      parseAutorizadas('{"a":"a@x.com","b":"b@x.com","c":"c@x.com"}'),
    ).toEqual({ ok: false, motivo: 'excesso' });
  });

  it('recusa chaves ou e-mails fora do formato', () => {
    expect(parseAutorizadas('{"Pedro Silva":"p@x.com"}').ok).toBe(false);
    expect(parseAutorizadas('{"pedro":"sem-arroba"}').ok).toBe(false);
    expect(parseAutorizadas('{"pedro":123}').ok).toBe(false);
  });
});

describe('criarAutorizadas', () => {
  function criar(conteudo: () => string | undefined, agora: () => number) {
    let lidas = 0;
    const a = criarAutorizadas({
      ler: async () => {
        lidas++;
        return conteudo();
      },
      ttlMs: 30_000,
      agora,
    });
    return { a, lidas: () => lidas };
  }

  it('resolve e-mail para a chave sem diferenciar maiúsculas e sem expor o e-mail', async () => {
    const { a } = criar(
      () => DOIS,
      () => 0,
    );
    expect(await a.pessoaPorEmail('PEDRO@exemplo.COM')).toBe('pedro');
    expect(await a.pessoaPorEmail(' julia@exemplo.com ')).toBe('julia');
    expect(await a.pessoaPorEmail('estranho@exemplo.com')).toBeNull();
    expect(await a.pessoasAtuais()).toEqual(['pedro', 'julia']);
    expect(JSON.stringify(await a.pessoasAtuais())).not.toContain('@');
  });

  it('arquivo inválido ou com excesso ⇒ ninguém entra', async () => {
    for (const ruim of [
      undefined,
      '{',
      '{}',
      '{"a":"a@x.com","b":"b@x.com","c":"c@x.com"}',
    ]) {
      const { a } = criar(
        () => ruim,
        () => 0,
      );
      expect(await a.pessoaPorEmail('a@x.com')).toBeNull();
      expect(await a.pessoasAtuais()).toEqual([]);
    }
  });

  it('erro ao ler também falha fechado', async () => {
    const a = criarAutorizadas({
      ler: async () => {
        throw new Error('disco');
      },
      ttlMs: 30_000,
      agora: () => 0,
    });
    expect(await a.pessoasAtuais()).toEqual([]);
  });

  it('relê depois de 30 s e enxerga a mudança (remover pessoa)', async () => {
    let conteudo = DOIS;
    let agora = 0;
    const { a, lidas } = criar(
      () => conteudo,
      () => agora,
    );
    expect(await a.pessoasAtuais()).toEqual(['pedro', 'julia']);
    conteudo = '{"pedro":"pedro@exemplo.com"}';
    agora = 20_000;
    expect(await a.pessoasAtuais()).toEqual(['pedro', 'julia']);
    expect(lidas()).toBe(1);
    agora = 31_000;
    expect(await a.pessoasAtuais()).toEqual(['pedro']);
    expect(await a.pessoaPorEmail('julia@exemplo.com')).toBeNull();
    conteudo = '{}';
    agora = 62_000;
    expect(await a.pessoasAtuais()).toEqual([]);
  });
});
