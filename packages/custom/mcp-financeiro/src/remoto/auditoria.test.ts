import { describe, expect, it } from 'vitest';

import { criarAuditoria, montarLinha } from './auditoria';

const AGORA = new Date('2026-10-25T18:40:12.345Z');

describe('montarLinha', () => {
  it('emite os campos permitidos em uma linha JSON', () => {
    const linha = montarLinha(
      {
        evento: 'consulta',
        rotulo: 'celular do Pedro',
        ferramenta: 'gasto_por_categoria',
        resultado: 'ok',
        duracao_ms: 412,
      },
      AGORA,
    );
    expect(linha).not.toBeNull();
    expect(JSON.parse(linha as string)).toEqual({
      ts: '2026-10-25T18:40:12.345Z',
      servico: 'financas-mcp',
      evento: 'consulta',
      rotulo: 'celular do Pedro',
      ferramenta: 'gasto_por_categoria',
      resultado: 'ok',
      duracao_ms: 412,
    });
    expect(linha).not.toContain('\n');
  });

  it('DESCARTA qualquer campo fora da lista fechada (e-mail, IP, valor, parâmetros, tokens)', () => {
    const linha = montarLinha(
      {
        evento: 'recusado',
        resultado: 'negado',
        motivo: 'token-invalido',
        email: 'pedro@exemplo.com',
        ip: '203.0.113.9',
        valor: 12345,
        descricao: 'PIX MERCADO',
        parametros: { inicio: '2026-09-01' },
        code: 'abc123',
        state: 'xyz',
        token: 'eyJhbGciOi',
        authorization: 'Bearer eyJhbGciOi',
        userAgent: 'Mozilla',
      },
      AGORA,
    ) as string;
    const obj = JSON.parse(linha);
    expect(Object.keys(obj).sort()).toEqual([
      'evento',
      'motivo',
      'resultado',
      'servico',
      'ts',
    ]);
    for (const proibido of [
      'pedro@exemplo.com',
      '203.0.113.9',
      '12345',
      'PIX MERCADO',
      '2026-09-01',
      'abc123',
      'eyJhbGciOi',
      'Mozilla',
    ]) {
      expect(linha).not.toContain(proibido);
    }
  });

  it('o rótulo livre não pode carregar e-mail, IP, CPF ou cartão', () => {
    const linha = montarLinha(
      {
        evento: 'acesso_concedido',
        resultado: 'ok',
        rotulo:
          'pedro@exemplo.com 203.0.113.9 111.444.777-35 4111 1111 1111 1111',
      },
      AGORA,
    ) as string;
    expect(linha).not.toContain('pedro@exemplo.com');
    expect(linha).not.toContain('203.0.113.9');
    expect(linha).not.toContain('111.444.777-35');
    expect(linha).not.toContain('4111 1111 1111 1111');
  });

  it('trunca textos longos e remove caracteres de controle', () => {
    const linha = montarLinha(
      {
        evento: 'consulta',
        resultado: 'ok',
        rotulo: `${'a'.repeat(200)}\n\rfim`,
      },
      AGORA,
    ) as string;
    const obj = JSON.parse(linha);
    expect(obj.rotulo.length).toBeLessThanOrEqual(60);
    expect(obj.rotulo).not.toMatch(/[\n\r]/);
  });

  it('recusa evento ou resultado fora dos valores do contrato (devolve null)', () => {
    expect(
      montarLinha({ evento: 'inventado', resultado: 'ok' }, AGORA),
    ).toBeNull();
    expect(
      montarLinha({ evento: 'consulta', resultado: 'talvez' }, AGORA),
    ).toBeNull();
    expect(
      montarLinha(
        { evento: 'recusado', resultado: 'negado', motivo: 'inventado' },
        AGORA,
      ),
    ).toBeNull();
  });

  it('em configuracao_invalida só o NOME da variável', () => {
    const linha = montarLinha(
      {
        evento: 'configuracao_invalida',
        resultado: 'erro',
        variavel: 'SEGREDO_MESTRE',
      },
      AGORA,
    ) as string;
    expect(JSON.parse(linha).variavel).toBe('SEGREDO_MESTRE');
  });
});

describe('criarAuditoria', () => {
  it('escreve a linha pelo destino injetado e ignora eventos inválidos', () => {
    const saida: string[] = [];
    const a = criarAuditoria({
      escrever: l => saida.push(l),
      agora: () => AGORA,
    });
    a.registrar({ evento: 'consulta', resultado: 'ok', ferramenta: 'contas' });
    a.registrar({ evento: 'inventado', resultado: 'ok' });
    expect(saida).toHaveLength(1);
    expect(JSON.parse(saida[0]).ferramenta).toBe('contas');
  });
});
