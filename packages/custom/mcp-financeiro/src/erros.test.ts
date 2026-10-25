import { describe, expect, it } from 'vitest';

import {
  describeError,
  InputError,
  LimiteConsultasError,
  OrcamentoCarregandoError,
} from './erros';

const erro = (mensagem: string) => new Error(mensagem);

describe('describeError — ambiente local (mensagens da 005, com Chaveiro)', () => {
  it('token inválido manda atualizar o Chaveiro', () => {
    expect(
      describeError(erro('invalid or expired session token'), 'local'),
    ).toContain('Chaveiro');
  });

  it('orçamento criptografado cita a conta do Chaveiro', () => {
    expect(describeError(erro('file is encrypted'), 'local')).toContain(
      'Chaveiro',
    );
  });
});

describe('describeError — ambiente remoto (sem Chaveiro, distinguível)', () => {
  const remoto = (e: unknown) => describeError(e, 'remoto');

  it('Actual fora do ar', () => {
    expect(remoto(erro('fetch failed'))).toBe(
      'O servidor do Actual está inacessível agora. Tente de novo em alguns minutos.',
    );
    expect(remoto(erro('ECONNREFUSED'))).toContain('inacessível');
  });

  it('token do Actual inválido: pede ao Pedro, sem falar de Chaveiro', () => {
    const msg = remoto(erro('invalid or expired session token'));
    expect(msg).toBe(
      'O assistente perdeu o acesso ao Actual. Avise o Pedro para renovar a credencial.',
    );
    expect(msg).not.toContain('Chaveiro');
  });

  it('orçamento criptografado: sem Chaveiro', () => {
    const msg = remoto(erro('file is encrypted'));
    expect(msg).not.toContain('Chaveiro');
    expect(msg).toContain('criptografado');
  });

  it('orçamento não encontrado', () => {
    expect(remoto(erro('file-not-found'))).toBe(
      'Orçamento não encontrado (confira o Sync ID).',
    );
  });

  it('orçamento ainda carregando', () => {
    expect(remoto(new OrcamentoCarregandoError())).toBe(
      'O orçamento está carregando; tente de novo em instantes.',
    );
  });

  it('limite de consultas', () => {
    expect(remoto(new LimiteConsultasError())).toBe(
      'Muitas consultas seguidas. Aguarde um minuto.',
    );
  });

  it('erro de validação de parâmetro mantém a mensagem da ferramenta', () => {
    expect(remoto(new InputError('Período invertido.'))).toBe(
      'Período invertido.',
    );
  });

  it('erro desconhecido: mensagem genérica, sem detalhe interno', () => {
    const msg = remoto(
      erro('SQLITE_CORRUPT em /tmp/budget/db.sqlite com token=abc'),
    );
    expect(msg).toBe('Falha ao consultar o orçamento do Actual.');
    expect(msg).not.toContain('sqlite');
  });

  it('os quatro estados são distintos entre si', () => {
    const textos = new Set([
      remoto(erro('fetch failed')),
      remoto(erro('invalid or expired session token')),
      remoto(new OrcamentoCarregandoError()),
      remoto(new LimiteConsultasError()),
    ]);
    expect(textos.size).toBe(4);
  });
});
