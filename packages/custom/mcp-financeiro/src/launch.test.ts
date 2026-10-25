import { describe, expect, it } from 'vitest';

import { buildLaunchSpec, describeLaunch, LaunchConfigError } from './launch';

const credentials = {
  url: 'https://actual.example.com',
  token: 'token-de-sessao-super-secreto',
  syncId: 'abc-sync-id',
};

const options = {
  serverPath: '/repo/packages/custom/mcp-financeiro/bin/servidor.mjs',
  home: '/Users/exemplo',
};

describe('buildLaunchSpec', () => {
  it('executa o nosso servidor com node, sem npx nem pacote de terceiros', () => {
    const spec = buildLaunchSpec(credentials, options);
    expect(spec.command).toBe('node');
    expect(spec.args).toEqual([options.serverPath]);
    expect(JSON.stringify(spec)).not.toContain('actual-mcp-server');
  });

  it('entrega o token só no env, nunca em args nem na descrição', () => {
    const spec = buildLaunchSpec(
      { ...credentials, budgetPassword: 'outra-senha' },
      options,
    );
    expect(spec.env.ACTUAL_SESSION_TOKEN).toBe(credentials.token);
    expect(spec.env.ACTUAL_BUDGET_PASSWORD).toBe('outra-senha');
    expect(JSON.stringify(spec.args)).not.toContain(credentials.token);
    const text = describeLaunch(spec);
    expect(text).not.toContain(credentials.token);
    expect(text).not.toContain('outra-senha');
  });

  it('não passa senha de servidor: a produção entra por token', () => {
    const spec = buildLaunchSpec(credentials, options);
    expect(spec.env.ACTUAL_PASSWORD).toBeUndefined();
  });

  it('mantém dados fora do repositório', () => {
    const spec = buildLaunchSpec(credentials, options);
    expect(spec.cwd).toBe('/Users/exemplo/.cache/actual-financas-mcp');
    expect(spec.env.FINANCAS_DATA_DIR).toBe(
      '/Users/exemplo/.cache/actual-financas-mcp/data',
    );
  });

  it('só repassa as variáveis necessárias do ambiente (sem vazar o resto)', () => {
    const spec = buildLaunchSpec(credentials, {
      ...options,
      ambientEnv: { PATH: '/usr/bin', HOME: '/h', AWS_SECRET_ACCESS_KEY: 'x' },
    });
    expect(spec.env.PATH).toBe('/usr/bin');
    expect(spec.env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it('recusa http:// fora de localhost', () => {
    expect(() =>
      buildLaunchSpec(
        { ...credentials, url: 'http://actual.example.com' },
        options,
      ),
    ).toThrow(LaunchConfigError);
    expect(() =>
      buildLaunchSpec(
        { ...credentials, url: 'http://localhost:5006' },
        options,
      ),
    ).not.toThrow();
  });

  it.each([
    ['url', { ...credentials, url: '' }, 'missing-url'],
    ['token', { ...credentials, token: '' }, 'missing-token'],
    ['sync id', { ...credentials, syncId: '' }, 'missing-sync-id'],
  ])('erro distinguível quando falta %s', (_label, creds, code) => {
    try {
      buildLaunchSpec(creds, options);
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect(error).toBeInstanceOf(LaunchConfigError);
      expect((error as LaunchConfigError).code).toBe(code);
      expect((error as LaunchConfigError).message).not.toContain(
        credentials.token,
      );
    }
  });
});
