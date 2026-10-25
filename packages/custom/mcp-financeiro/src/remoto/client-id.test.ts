import { describe, expect, it } from 'vitest';

import { criarClientsStore, redirectPermitido } from './client-id';
import { REDIRECTS_PADRAO } from './config';
import { deriveKey } from './tokens';

const chave = deriveKey(Buffer.alloc(48, 3), 'client');

describe('redirectPermitido', () => {
  it('aceita exatamente os retornos conhecidos (Claude e ChatGPT)', () => {
    for (const uri of [
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.com/api/mcp/auth_callback',
      'https://chatgpt.com/connector/oauth/abc123',
      'https://chatgpt.com/connector_platform_oauth_redirect',
    ]) {
      expect(redirectPermitido(uri, REDIRECTS_PADRAO)).toBe(true);
    }
  });

  it('curinga casa UM segmento de caminho, nunca o host nem vários níveis', () => {
    expect(
      redirectPermitido(
        'https://chatgpt.com/connector/oauth/',
        REDIRECTS_PADRAO,
      ),
    ).toBe(false);
    expect(
      redirectPermitido(
        'https://chatgpt.com/connector/oauth/a/b',
        REDIRECTS_PADRAO,
      ),
    ).toBe(false);
    expect(
      redirectPermitido(
        'https://chatgpt.com.evil.com/connector/oauth/x',
        REDIRECTS_PADRAO,
      ),
    ).toBe(false);
    expect(
      redirectPermitido('https://evil.com/connector/oauth/x', REDIRECTS_PADRAO),
    ).toBe(false);
  });

  it('recusa host estranho, caminho diferente, query, fragmento e credenciais na URL', () => {
    const recusadas = [
      'https://evil.example/api/mcp/auth_callback',
      'https://claude.ai/outro/caminho',
      'https://claude.ai/api/mcp/auth_callback?x=1',
      'https://claude.ai/api/mcp/auth_callback#frag',
      'https://usuario:senha@claude.ai/api/mcp/auth_callback',
      'http://claude.ai/api/mcp/auth_callback',
    ];
    for (const uri of recusadas) {
      expect(redirectPermitido(uri, REDIRECTS_PADRAO)).toBe(false);
    }
  });

  it('aceita loopback com qualquer porta e caminho (CLIs e IDEs), só em http', () => {
    expect(
      redirectPermitido('http://localhost:3118/callback', REDIRECTS_PADRAO),
    ).toBe(true);
    expect(
      redirectPermitido(
        'http://127.0.0.1:7777/oauth/callback',
        REDIRECTS_PADRAO,
      ),
    ).toBe(true);
    expect(redirectPermitido('http://[::1]:5555/cb', REDIRECTS_PADRAO)).toBe(
      true,
    );
    expect(
      redirectPermitido('https://localhost:3118/callback', REDIRECTS_PADRAO),
    ).toBe(false);
    expect(
      redirectPermitido(
        'http://localhost.evil.com:3118/callback',
        REDIRECTS_PADRAO,
      ),
    ).toBe(false);
  });

  it('recusa esquemas personalizados e lixo', () => {
    for (const uri of [
      ['java', 'script:alert(1)'].join(''),
      'cursor://anysphere/cb',
      'file:///etc/passwd',
      'não é url',
      '',
    ]) {
      expect(redirectPermitido(uri, REDIRECTS_PADRAO)).toBe(false);
    }
  });
});

describe('criarClientsStore (DCR sem estado)', () => {
  const store = criarClientsStore({
    chave,
    redirectsPermitidos: REDIRECTS_PADRAO,
  });
  const meta = {
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    token_endpoint_auth_method: 'none',
    client_name: 'Claude',
  };

  it('registra devolvendo um client_id assinado e lembra do cliente sem guardar nada', async () => {
    const registrado = await store.registerClient!(meta);
    expect(registrado.client_id).toBeTruthy();
    expect(registrado.client_secret).toBeUndefined();
    expect(registrado.token_endpoint_auth_method).toBe('none');
    const lido = await store.getClient(registrado.client_id);
    expect(lido?.redirect_uris).toEqual(meta.redirect_uris);
    expect(lido?.client_name).toBe('Claude');
  });

  it('omitir o método de autenticação conta como cliente público', async () => {
    const { token_endpoint_auth_method: _omitido, ...semMetodo } = meta;
    const registrado = await store.registerClient!(semMetodo);
    expect(registrado.token_endpoint_auth_method).toBe('none');
    expect(registrado.client_secret).toBeUndefined();
  });

  it('recusa método confidencial explícito (invalid_client_metadata)', async () => {
    await expect(
      store.registerClient!({
        ...meta,
        token_endpoint_auth_method: 'client_secret_post',
      }),
    ).rejects.toMatchObject({ errorCode: 'invalid_client_metadata' });
  });

  it('recusa redirect fora da política citando o host e nada mais (invalid_redirect_uri)', async () => {
    const erro = await Promise.resolve(
      store.registerClient!({
        ...meta,
        redirect_uris: ['https://evil.example/cb'],
      }),
    ).catch((e: Error & { errorCode?: string }) => e);
    expect((erro as { errorCode?: string }).errorCode).toBe(
      'invalid_redirect_uri',
    );
    expect((erro as Error).message).toContain('evil.example');
  });

  it('recusa se QUALQUER redirect da lista for inválido', async () => {
    await expect(
      store.registerClient!({
        ...meta,
        redirect_uris: [
          'https://claude.ai/api/mcp/auth_callback',
          'https://evil.example/cb',
        ],
      }),
    ).rejects.toMatchObject({ errorCode: 'invalid_redirect_uri' });
  });

  it('recusa lista de redirects vazia', async () => {
    await expect(
      store.registerClient!({ ...meta, redirect_uris: [] }),
    ).rejects.toBeTruthy();
  });

  it('client_id adulterado, de outra chave ou lixo não vira cliente', async () => {
    const registrado = await store.registerClient!(meta);
    const [corpo] = registrado.client_id.split('.');
    expect(await store.getClient(`${corpo}.assinaturaFalsa`)).toBeUndefined();
    expect(await store.getClient('lixo')).toBeUndefined();
    const outro = criarClientsStore({
      chave: deriveKey(Buffer.alloc(48, 4), 'client'),
      redirectsPermitidos: REDIRECTS_PADRAO,
    });
    expect(await outro.getClient(registrado.client_id)).toBeUndefined();
  });

  it('retira a confiança de provedores removidos da política (rechecagem a cada uso)', async () => {
    const registrado = await store.registerClient!(meta);
    const restrito = criarClientsStore({
      chave,
      redirectsPermitidos: ['https://chatgpt.com/connector/oauth/*'],
    });
    expect(await restrito.getClient(registrado.client_id)).toBeUndefined();
  });

  it('nome do cliente é truncado a 60 caracteres', async () => {
    const registrado = await store.registerClient!({
      ...meta,
      client_name: 'x'.repeat(200),
    });
    expect(
      (await store.getClient(registrado.client_id))?.client_name?.length,
    ).toBeLessThanOrEqual(60);
  });
});
