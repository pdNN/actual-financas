import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  chamarMcp,
  conectar,
  INICIALIZAR,
  irAteConsentimento,
  pkce,
  registrarCliente,
  renovar,
  subirServico,
} from './testes-util';
import type { Servico } from './testes-util';

let s: Servico;
afterEach(async () => {
  await s?.fechar();
});

describe('descoberta (RFC 9728 e RFC 8414)', () => {
  it('metadata do recurso: resource = URL do /mcp, um único servidor de autorização', async () => {
    s = await subirServico();
    for (const caminho of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      const r = await fetch(`${s.url}${caminho}`);
      expect(r.status).toBe(200);
      const j = (await r.json()) as Record<string, unknown>;
      expect(j.resource).toBe(s.config.resourceUrl.href);
      expect(j.authorization_servers).toEqual([s.config.publicUrl.href]);
    }
  });

  it('metadata do servidor de autorização: S256, DCR, cliente público', async () => {
    s = await subirServico();
    const r = await fetch(`${s.url}/.well-known/oauth-authorization-server`);
    const j = (await r.json()) as Record<string, unknown>;
    expect(j.issuer).toBe(s.config.publicUrl.href);
    expect(j.code_challenge_methods_supported).toEqual(['S256']);
    expect(j.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(j.grant_types_supported).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(String(j.registration_endpoint)).toMatch(/\/register$/);
    expect(String(j.authorization_endpoint)).toMatch(/\/authorize$/);
    expect(String(j.token_endpoint)).toMatch(/\/token$/);
    expect(j).not.toHaveProperty('client_id_metadata_document_supported');
  });
});

describe('fluxo completo com cliente genérico', () => {
  it('registro → autorização → Google → consentimento → token → MCP → refresh', async () => {
    s = await subirServico();
    const c = await conectar(s);
    expect(c.expiresIn).toBe(900);

    const transporte = new StreamableHTTPClientTransport(
      new URL(`${s.url}/mcp`),
      {
        requestInit: { headers: { authorization: `Bearer ${c.accessToken}` } },
      },
    );
    const cliente = new Client({ name: 'cliente-generico', version: '1' });
    await cliente.connect(transporte);
    const { tools } = await cliente.listTools();
    expect(tools.map(t => t.name)).toEqual(
      expect.arrayContaining([
        'contas',
        'categorias',
        'gasto_por_categoria',
        'comparar_periodos',
        'transacoes',
        'sem_categoria',
        'fluxo_e_sobra',
      ]),
    );
    expect(tools.every(t => t.annotations?.readOnlyHint === true)).toBe(true);
    const resultado = await cliente.callTool({ name: 'contas', arguments: {} });
    expect(JSON.stringify(resultado)).toContain('Conta');
    expect(cliente.getInstructions()).toContain('sobra = receita − despesa');
    await cliente.close();

    const r = await renovar(s, c);
    expect(r.status).toBe(200);
    const novo = (await r.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(novo.refresh_token).not.toBe(c.refreshToken);
    expect((await chamarMcp(s, novo.access_token, INICIALIZAR)).status).toBe(
      200,
    );
  });

  it('PKCE: code_verifier errado é invalid_grant', async () => {
    s = await subirServico();
    await expect(
      conectar(s, {
        verifierDoToken: 'verifier-errado-com-tamanho-suficiente-0123456789',
      }),
    ).rejects.toMatchObject({
      status: 400,
      corpo: { error: 'invalid_grant' },
    });
  });

  it('refresh vira invalid_grant com "acesso expirado" depois de 30 dias parado', async () => {
    s = await subirServico();
    const c = await conectar(s);
    s.avancarTempo(31 * 86_400_000);
    const r = await renovar(s, c);
    expect(r.status).toBe(400);
    const j = (await r.json()) as { error: string; error_description: string };
    expect(j.error).toBe('invalid_grant');
    expect(j.error_description).toContain('acesso expirado');
  });

  it('o rótulo escolhido aparece no estado e na auditoria, sem e-mail', async () => {
    s = await subirServico();
    await conectar(s, { rotulo: 'tablet da sala' });
    const { estado } = await s.store.ler();
    expect(Object.values(estado.acessos)[0]?.rotulo).toBe('tablet da sala');
    expect(s.auditoria.join('\n')).toContain('tablet da sala');
    expect(s.auditoria.join('\n')).not.toContain('pedro@exemplo.com');
    expect(JSON.stringify(estado)).not.toContain('pedro@exemplo.com');
  });
});

describe('bateria CS-004 — tentativas sem direito', () => {
  it('conta Google válida fora da lista: página de erro, nenhum acesso criado', async () => {
    s = await subirServico();
    s.definirEmailGoogle('estranho@exemplo.com');
    const id = await registrarCliente(s);
    const passo = await irAteConsentimento(s, id, pkce());
    expect(passo.etapa).toBe('callback');
    expect(passo.resposta.status).toBe(403);
    expect(passo.html).not.toContain('csrf');
    expect(passo.html).not.toContain('estranho@exemplo.com');
    expect(Object.keys((await s.store.ler()).estado.acessos)).toHaveLength(0);
  });

  it('lista de autorizadas inválida ⇒ ninguém entra', async () => {
    s = await subirServico({ pessoas: undefined });
    const id = await registrarCliente(s);
    const passo = await irAteConsentimento(s, id, pkce());
    expect(passo.resposta.status).toBe(403);
  });

  it('pessoa removida da lista: o token vigente para de funcionar no pedido seguinte', async () => {
    s = await subirServico();
    const c = await conectar(s);
    expect((await chamarMcp(s, c.accessToken, INICIALIZAR)).status).toBe(200);
    s.definirPessoas(JSON.stringify({ julia: 'julia@exemplo.com' }));
    expect((await chamarMcp(s, c.accessToken, INICIALIZAR)).status).toBe(401);
  });

  it('lista esvaziada ({}) é o "encerrar tudo" de emergência', async () => {
    s = await subirServico();
    const c = await conectar(s);
    s.definirPessoas('{}');
    expect((await chamarMcp(s, c.accessToken, INICIALIZAR)).status).toBe(401);
    expect((await renovar(s, c)).status).toBe(400);
  });

  it('redirect_uri diferente do registrado no /authorize não chega ao Google', async () => {
    s = await subirServico();
    const id = await registrarCliente(s);
    const passo = await irAteConsentimento(
      s,
      id,
      pkce(),
      'https://evil.example/cb',
    );
    expect(passo.etapa).toBe('authorize');
    expect(passo.resposta.status).toBe(400);
  });

  it('registro com retorno fora da política é recusado', async () => {
    s = await subirServico();
    const r = await fetch(`${s.url}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://evil.example/cb'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe(
      'invalid_redirect_uri',
    );
  });

  it('o /authorize com resource de outro servidor é recusado (audiência)', async () => {
    s = await subirServico();
    const id = await registrarCliente(s);
    const p = pkce();
    const url = new URL(`${s.url}/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: id,
      redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
      code_challenge: p.challenge,
      code_challenge_method: 'S256',
      state: 'x',
      resource: 'https://outro.exemplo/mcp',
    }).toString();
    const r = await fetch(url, { redirect: 'manual' });
    expect(String(r.headers.get('location') ?? '')).not.toContain(
      'accounts.google.com',
    );
  });
});

describe('mascaramento pelo remoto (CS-009)', () => {
  it('CPF, CNPJ e cartão em descrições chegam mascarados ao cliente remoto', async () => {
    s = await subirServico();
    const c = await conectar(s);
    const r = await chamarMcp(s, c.accessToken, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'transacoes',
        arguments: { inicio: '2026-09-01', fim: '2026-09-30' },
      },
    });
    const texto = await r.text();
    expect(texto).not.toContain('123.456.789-09');
    expect(texto).toContain('[CPF]');
  });
});
