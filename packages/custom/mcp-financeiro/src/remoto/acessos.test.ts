import { describe, expect, it } from 'vitest';

import {
  conceder,
  encerrar,
  encerrarPessoa,
  encerrarTodos,
  estadoVazio,
  limpar,
  listar,
  parseEstado,
  registrarUso,
  REGRAS_PADRAO,
  rotacionar,
  validar,
} from './acessos';
import type { Estado } from './acessos';

const T0 = new Date('2026-10-25T12:00:00Z');
const minutos = (n: number) => new Date(T0.getTime() + n * 60_000);
const dias = (n: number) => new Date(T0.getTime() + n * 86_400_000);
const PESSOAS = ['pedro', 'julia'];

function comAcesso(extra: Partial<Parameters<typeof conceder>[1]> = {}) {
  return conceder(
    estadoVazio(),
    {
      id: 'a_1',
      rotulo: 'celular do Pedro',
      pessoa: 'pedro',
      cliente: 'Claude',
      now: T0,
      refreshHash: 'sha256:r0',
      ...extra,
    },
    REGRAS_PADRAO,
  );
}

describe('conceder', () => {
  it('cria um acesso ativo com prazos de inatividade e absoluto', () => {
    const estado = comAcesso();
    const a = estado.acessos.a_1;
    expect(a.estado).toBe('ativo');
    expect(a.pessoa).toBe('pedro');
    expect(a.rotulo).toBe('celular do Pedro');
    expect(new Date(a.expiraEm).getTime()).toBe(dias(30).getTime());
    expect(new Date(a.expiraAbsolutoEm).getTime()).toBe(dias(180).getTime());
    expect(a.refreshAtualHash).toBe('sha256:r0');
    expect(a.refreshAnteriorHash).toBeNull();
  });

  it('não muta o estado original', () => {
    const antes = estadoVazio();
    conceder(
      antes,
      {
        id: 'x',
        rotulo: 'r',
        pessoa: 'pedro',
        cliente: 'c',
        now: T0,
        refreshHash: 'h',
      },
      REGRAS_PADRAO,
    );
    expect(Object.keys(antes.acessos)).toHaveLength(0);
  });

  it('aplica o teto de 10 acessos ativos por pessoa encerrando o mais antigo sem uso', () => {
    let estado: Estado = estadoVazio();
    for (let i = 0; i < 10; i++) {
      estado = conceder(
        estado,
        {
          id: `a_${i}`,
          rotulo: `aparelho ${i}`,
          pessoa: 'pedro',
          cliente: 'c',
          now: minutos(i),
          refreshHash: `h${i}`,
        },
        REGRAS_PADRAO,
      );
    }
    estado = conceder(
      estado,
      {
        id: 'a_novo',
        rotulo: 'novo',
        pessoa: 'pedro',
        cliente: 'c',
        now: minutos(20),
        refreshHash: 'hn',
      },
      REGRAS_PADRAO,
    );
    const ativos = Object.values(estado.acessos).filter(
      a => a.estado === 'ativo',
    );
    expect(ativos).toHaveLength(10);
    expect(estado.acessos.a_0.estado).toBe('encerrado');
    expect(estado.acessos.a_0.motivoEncerramento).toBe('teto');
    expect(estado.acessos.a_novo.estado).toBe('ativo');
  });

  it('o teto é por pessoa: acessos da Julia não contam para o Pedro', () => {
    let estado: Estado = estadoVazio();
    for (let i = 0; i < 10; i++) {
      estado = conceder(
        estado,
        {
          id: `j_${i}`,
          rotulo: `j${i}`,
          pessoa: 'julia',
          cliente: 'c',
          now: minutos(i),
          refreshHash: `h${i}`,
        },
        REGRAS_PADRAO,
      );
    }
    estado = conceder(
      estado,
      {
        id: 'p_1',
        rotulo: 'p',
        pessoa: 'pedro',
        cliente: 'c',
        now: minutos(30),
        refreshHash: 'hp',
      },
      REGRAS_PADRAO,
    );
    expect(Object.values(estado.acessos).every(a => a.estado === 'ativo')).toBe(
      true,
    );
  });
});

describe('validar', () => {
  it('aceita um acesso ativo, dentro dos prazos, de pessoa autorizada', () => {
    const r = validar(comAcesso(), 'a_1', minutos(5), PESSOAS, REGRAS_PADRAO);
    expect(r.ok).toBe(true);
  });

  it('recusa acesso inexistente', () => {
    expect(
      validar(comAcesso(), 'nao_existe', T0, PESSOAS, REGRAS_PADRAO),
    ).toEqual({
      ok: false,
      motivo: 'inexistente',
    });
  });

  it('expira por inatividade (30 dias)', () => {
    const r = validar(comAcesso(), 'a_1', dias(31), PESSOAS, REGRAS_PADRAO);
    expect(r).toEqual({ ok: false, motivo: 'expirado' });
  });

  it('expira pelo limite absoluto (180 dias) mesmo com uso contínuo', () => {
    let estado = comAcesso();
    // uso a cada 20 dias mantém a janela de inatividade, mas não passa dos 180
    for (let d = 20; d <= 180; d += 20) {
      estado = registrarUso(estado, 'a_1', dias(d), REGRAS_PADRAO);
    }
    expect(validar(estado, 'a_1', dias(170), PESSOAS, REGRAS_PADRAO).ok).toBe(
      true,
    );
    expect(validar(estado, 'a_1', dias(181), PESSOAS, REGRAS_PADRAO)).toEqual({
      ok: false,
      motivo: 'expirado',
    });
  });

  it('recusa acesso encerrado', () => {
    const estado = encerrar(comAcesso(), 'a_1', 'manual', T0);
    expect(validar(estado, 'a_1', T0, PESSOAS, REGRAS_PADRAO)).toEqual({
      ok: false,
      motivo: 'encerrado',
    });
  });

  it('recusa acesso de pessoa removida da lista de autorizadas', () => {
    expect(validar(comAcesso(), 'a_1', T0, ['julia'], REGRAS_PADRAO)).toEqual({
      ok: false,
      motivo: 'pessoa-removida',
    });
  });

  it('recusa com a lista de autorizadas vazia (encerrar tudo de emergência)', () => {
    expect(validar(comAcesso(), 'a_1', T0, [], REGRAS_PADRAO)).toEqual({
      ok: false,
      motivo: 'pessoa-removida',
    });
  });

  it('recusa acesso concedido antes de revogadoAntesDe, mesmo que ativo', () => {
    const estado = {
      ...comAcesso(),
      revogadoAntesDe: minutos(1).toISOString(),
    };
    expect(validar(estado, 'a_1', minutos(2), PESSOAS, REGRAS_PADRAO)).toEqual({
      ok: false,
      motivo: 'revogado-em-massa',
    });
  });
});

describe('registrarUso', () => {
  it('só grava ultimoUsoEm/expiraEm se passaram 10 minutos desde o último uso', () => {
    const estado = comAcesso();
    const igual = registrarUso(estado, 'a_1', minutos(5), REGRAS_PADRAO);
    expect(igual).toBe(estado);
    const novo = registrarUso(estado, 'a_1', minutos(11), REGRAS_PADRAO);
    expect(novo).not.toBe(estado);
    expect(novo.acessos.a_1.ultimoUsoEm).toBe(minutos(11).toISOString());
    expect(new Date(novo.acessos.a_1.expiraEm).getTime()).toBe(
      minutos(11).getTime() + 30 * 86_400_000,
    );
  });
});

describe('rotacionar (refresh rotativo)', () => {
  it('troca o refresh vigente e guarda o anterior', () => {
    const r = rotacionar(
      comAcesso(),
      'a_1',
      'sha256:r0',
      'sha256:r1',
      minutos(10),
      REGRAS_PADRAO,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.estado.acessos.a_1;
    expect(a.refreshAtualHash).toBe('sha256:r1');
    expect(a.refreshAnteriorHash).toBe('sha256:r0');
    expect(a.rotacionadoEm).toBe(minutos(10).toISOString());
  });

  it('aceita o refresh anterior em até 60 s (retry legítimo) e gira de novo', () => {
    const r1 = rotacionar(
      comAcesso(),
      'a_1',
      'sha256:r0',
      'sha256:r1',
      minutos(10),
      REGRAS_PADRAO,
    );
    if (!r1.ok) throw new Error('esperado ok');
    const retry = new Date(minutos(10).getTime() + 30_000);
    const r2 = rotacionar(
      r1.estado,
      'a_1',
      'sha256:r0',
      'sha256:r2',
      retry,
      REGRAS_PADRAO,
    );
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.estado.acessos.a_1.refreshAtualHash).toBe('sha256:r2');
    expect(r2.estado.acessos.a_1.estado).toBe('ativo');
  });

  it('REUSO: refresh anterior depois de 60 s encerra o acesso inteiro', () => {
    const r1 = rotacionar(
      comAcesso(),
      'a_1',
      'sha256:r0',
      'sha256:r1',
      minutos(10),
      REGRAS_PADRAO,
    );
    if (!r1.ok) throw new Error('esperado ok');
    const tarde = new Date(minutos(10).getTime() + 61_000);
    const r2 = rotacionar(
      r1.estado,
      'a_1',
      'sha256:r0',
      'sha256:r2',
      tarde,
      REGRAS_PADRAO,
    );
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.motivo).toBe('reuso-de-refresh');
    expect(r2.estado.acessos.a_1.estado).toBe('encerrado');
    expect(r2.estado.acessos.a_1.motivoEncerramento).toBe('reuso-de-refresh');
  });

  it('refresh desconhecido é inválido e não encerra nada', () => {
    const r = rotacionar(
      comAcesso(),
      'a_1',
      'sha256:lixo',
      'sha256:r1',
      minutos(1),
      REGRAS_PADRAO,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe('invalido');
    expect(r.estado.acessos.a_1.estado).toBe('ativo');
  });

  it('acesso encerrado ou expirado não rotaciona', () => {
    const enc = encerrar(comAcesso(), 'a_1', 'manual', T0);
    const r1 = rotacionar(
      enc,
      'a_1',
      'sha256:r0',
      'sha256:r1',
      T0,
      REGRAS_PADRAO,
    );
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.motivo).toBe('encerrado');
    const r2 = rotacionar(
      comAcesso(),
      'a_1',
      'sha256:r0',
      'sha256:r1',
      dias(40),
      REGRAS_PADRAO,
    );
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.motivo).toBe('expirado');
  });

  it('a rotação desliza a inatividade mas nunca passa do limite absoluto', () => {
    let estado = comAcesso();
    for (let d = 20; d <= 160; d += 20) {
      estado = registrarUso(estado, 'a_1', dias(d), REGRAS_PADRAO);
    }
    const r = rotacionar(
      estado,
      'a_1',
      'sha256:r0',
      'sha256:r1',
      dias(170),
      REGRAS_PADRAO,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(new Date(r.estado.acessos.a_1.expiraEm).getTime()).toBe(
      dias(180).getTime(),
    );
  });
});

describe('encerrar', () => {
  it('encerra um acesso sem afetar os outros', () => {
    let estado = comAcesso();
    estado = conceder(
      estado,
      {
        id: 'a_2',
        rotulo: 'celular da Julia',
        pessoa: 'julia',
        cliente: 'c',
        now: T0,
        refreshHash: 'h2',
      },
      REGRAS_PADRAO,
    );
    estado = encerrar(estado, 'a_1', 'manual', minutos(1));
    expect(estado.acessos.a_1.estado).toBe('encerrado');
    expect(estado.acessos.a_1.motivoEncerramento).toBe('manual');
    expect(estado.acessos.a_2.estado).toBe('ativo');
  });

  it('encerrarTodos define revogadoAntesDe e encerra os ativos', () => {
    const estado = encerrarTodos(comAcesso(), minutos(3));
    expect(estado.revogadoAntesDe).toBe(minutos(3).toISOString());
    expect(estado.acessos.a_1.estado).toBe('encerrado');
    expect(estado.acessos.a_1.motivoEncerramento).toBe('todos');
  });

  it('encerrarPessoa encerra só os acessos dela', () => {
    let estado = comAcesso();
    estado = conceder(
      estado,
      {
        id: 'a_2',
        rotulo: 'j',
        pessoa: 'julia',
        cliente: 'c',
        now: T0,
        refreshHash: 'h2',
      },
      REGRAS_PADRAO,
    );
    estado = encerrarPessoa(estado, 'julia', minutos(1));
    expect(estado.acessos.a_2.motivoEncerramento).toBe('pessoa-removida');
    expect(estado.acessos.a_1.estado).toBe('ativo');
  });
});

describe('limpar', () => {
  it('remove acessos encerrados ou expirados há mais de 90 dias, e só eles', () => {
    let estado = comAcesso();
    estado = encerrar(estado, 'a_1', 'manual', T0);
    estado = conceder(
      estado,
      {
        id: 'a_2',
        rotulo: 'ativo',
        pessoa: 'pedro',
        cliente: 'c',
        now: dias(95),
        refreshHash: 'h2',
      },
      REGRAS_PADRAO,
    );
    const limpo = limpar(estado, dias(95), REGRAS_PADRAO);
    expect(limpo.acessos.a_1).toBeUndefined();
    expect(limpo.acessos.a_2).toBeDefined();
    const recente = limpar(estado, dias(60), REGRAS_PADRAO);
    expect(recente.acessos.a_1).toBeDefined();
  });
});

describe('listar', () => {
  it('devolve linhas legíveis sem hashes e sem dados pessoais', () => {
    const linhas = listar(comAcesso(), T0, PESSOAS);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      id: 'a_1',
      rotulo: 'celular do Pedro',
      pessoa: 'pedro',
      cliente: 'Claude',
      estado: 'ativo',
    });
    expect(JSON.stringify(linhas)).not.toContain('sha256');
  });

  it('marca como expirado o que passou do prazo', () => {
    const linhas = listar(comAcesso(), dias(40), PESSOAS);
    expect(linhas[0].estado).toBe('expirado');
  });
});

describe('parseEstado', () => {
  it('aceita um estado válido e preenche padrões', () => {
    const e = parseEstado({ versao: 1, acessos: {} });
    expect(e.escritaHabilitada).toBe(true);
    expect(e.revogadoAntesDe).toBeNull();
  });

  it('recusa estado malformado', () => {
    expect(() => parseEstado({ versao: 2 })).toThrow();
    expect(() => parseEstado(null)).toThrow();
  });
});
