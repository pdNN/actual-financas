import { describe, expect, it } from 'vitest';

import { loadConfig } from './config';

const SEGREDO = Buffer.alloc(48, 7).toString('base64');

const base = {
  URL_PUBLICA: 'https://financas-mcp-abc-ue.a.run.app',
  ACTUAL_SERVER_URL: 'https://actual.exemplo.com',
  ACTUAL_SESSION_TOKEN: 'token-do-actual',
  ACTUAL_BUDGET_SYNC_ID: 'sync-id',
  GOOGLE_CLIENT_ID: 'cliente.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'segredo-google',
  SEGREDO_MESTRE: SEGREDO,
  BUCKET_ESTADO: 'bucket-estado',
};

describe('loadConfig', () => {
  it('aceita a configuração mínima e aplica os padrões', () => {
    const result = loadConfig(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.config;
    expect(c.resourceUrl.href).toBe(
      'https://financas-mcp-abc-ue.a.run.app/mcp',
    );
    expect(c.ttlAccessMin).toBe(15);
    expect(c.inatividadeDias).toBe(30);
    expect(c.limiteAbsolutoDias).toBe(180);
    expect(c.syncMaxIdadeMin).toBe(5);
    expect(c.limiteConsultasPorMin).toBe(60);
    expect(c.limiteFalhasPorMin).toBe(10);
    expect(c.arquivoPessoas).toBe('/segredos/pessoas.json');
    expect(c.origensPermitidasCidr).toEqual([]);
    expect(c.redirectsPermitidos).toEqual(
      expect.arrayContaining([
        'https://claude.ai/api/mcp/auth_callback',
        'https://claude.com/api/mcp/auth_callback',
        'https://chatgpt.com/connector/oauth/*',
        'https://chatgpt.com/connector_platform_oauth_redirect',
      ]),
    );
    expect(c.segredoMestre.length).toBe(48);
  });

  it('falha fechada e devolve só o NOME das variáveis ausentes', () => {
    const { ACTUAL_SESSION_TOKEN: _removida, ...semToken } = base;
    const result = loadConfig(semToken);
    expect(result).toEqual({ ok: false, falhas: ['ACTUAL_SESSION_TOKEN'] });
  });

  it('nunca inclui valores de segredo na falha', () => {
    const result = loadConfig({ ...base, SEGREDO_MESTRE: 'curto' });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('curto');
    expect(JSON.stringify(result)).not.toContain('token-do-actual');
    if (!result.ok) expect(result.falhas).toContain('SEGREDO_MESTRE');
  });

  it('exige segredo mestre com pelo menos 32 bytes', () => {
    const result = loadConfig({
      ...base,
      SEGREDO_MESTRE: Buffer.alloc(31, 1).toString('base64'),
    });
    expect(result.ok).toBe(false);
  });

  it('exige URL pública https (localhost é permitido para desenvolvimento)', () => {
    expect(loadConfig({ ...base, URL_PUBLICA: 'http://exemplo.com' }).ok).toBe(
      false,
    );
    expect(loadConfig({ ...base, URL_PUBLICA: 'não é url' }).ok).toBe(false);
    expect(
      loadConfig({ ...base, URL_PUBLICA: 'http://localhost:8080' }).ok,
    ).toBe(true);
  });

  it('rejeita números inválidos nas variáveis opcionais', () => {
    const result = loadConfig({ ...base, TTL_ACCESS_MIN: '0' });
    expect(result).toEqual({ ok: false, falhas: ['TTL_ACCESS_MIN'] });
    expect(loadConfig({ ...base, INATIVIDADE_DIAS: 'abc' }).ok).toBe(false);
  });

  it('lê redirects e faixas de origem de listas separadas por vírgula', () => {
    const result = loadConfig({
      ...base,
      REDIRECTS_PERMITIDOS: 'https://a.exemplo/cb, https://b.exemplo/*',
      ORIGENS_PERMITIDAS_CIDR: '160.79.104.0/21',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.redirectsPermitidos).toEqual([
      'https://a.exemplo/cb',
      'https://b.exemplo/*',
    ]);
    expect(result.config.origensPermitidasCidr).toEqual(['160.79.104.0/21']);
  });

  it('rejeita CIDR malformado', () => {
    expect(loadConfig({ ...base, ORIGENS_PERMITIDAS_CIDR: 'lixo' }).ok).toBe(
      false,
    );
  });
});
