import { describe, expect, it } from 'vitest';

import { encerrar, estadoVazio, REGRAS_PADRAO } from './acessos';
import { criarAuditoria } from './auditoria';
import { criarAutorizadas } from './autorizadas';
import { criarClientsStore } from './client-id';
import { criarEstadoEmMemoria, criarGerenciadorEstado } from './estado-store';
import type { PedidoAuthorize } from './google-identity';
import { criarProvedor } from './oauth-provider';
import { configDeTeste, PESSOAS } from './testes-util';
import { deriveKey, hashToken, signJwt } from './tokens';

const config = configDeTeste();
const MESTRE = config.segredoMestre;

const pedido: PedidoAuthorize = {
  clientId: 'cid',
  clientNome: 'Claude',
  redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  codeChallenge: 'desafio',
  state: 'st',
  resource: config.resourceUrl.href,
  scopes: ['financas'],
};

function montar(opcoes: { pessoas?: Record<string, string> } = {}) {
  let agora = new Date('2026-10-25T12:00:00Z');
  const store = criarEstadoEmMemoria(estadoVazio());
  const gerenciador = criarGerenciadorEstado(store, {
    ttlMs: 0,
    agora: () => agora.getTime(),
  });
  const auditoria: string[] = [];
  const clientsStore = criarClientsStore({
    chave: deriveKey(MESTRE, 'client'),
    redirectsPermitidos: config.redirectsPermitidos,
  });
  const provedor = criarProvedor({
    config,
    gerenciador,
    autorizadas: criarAutorizadas({
      ler: async () => JSON.stringify(opcoes.pessoas ?? PESSOAS),
      ttlMs: 0,
      agora: () => 0,
    }),
    clientsStore,
    identidade: undefined as never, // não usado nestes testes
    chaves: {
      token: deriveKey(MESTRE, 'token'),
      codigo: deriveKey(MESTRE, 'codigo'),
      consentimento: deriveKey(MESTRE, 'consentimento'),
    },
    auditoria: criarAuditoria({
      escrever: l => auditoria.push(l),
      agora: () => agora,
    }),
    agora: () => agora,
    regras: REGRAS_PADRAO,
  });
  const cliente = {
    client_id: 'cid',
    redirect_uris: [pedido.redirectUri],
  } as never;
  return {
    provedor,
    store,
    gerenciador,
    auditoria,
    cliente,
    avancar: (ms: number) => {
      agora = new Date(agora.getTime() + ms);
    },
  };
}

async function obterTokens(
  t: ReturnType<typeof montar>,
  rotulo = 'celular do Pedro',
) {
  const code = t.provedor.emitirCodigo({ pessoa: 'pedro', rotulo, pedido });
  return t.provedor.exchangeAuthorizationCode(
    t.cliente,
    code,
    'verifier',
    pedido.redirectUri,
    config.resourceUrl,
  );
}

describe('código de autorização', () => {
  it('expõe o desafio PKCE guardado no código', async () => {
    const t = montar();
    const code = t.provedor.emitirCodigo({
      pessoa: 'pedro',
      rotulo: 'r',
      pedido,
    });
    expect(
      await t.provedor.challengeForAuthorizationCode(t.cliente, code),
    ).toBe('desafio');
  });

  it('é de uso único', async () => {
    const t = montar();
    const code = t.provedor.emitirCodigo({
      pessoa: 'pedro',
      rotulo: 'r',
      pedido,
    });
    await t.provedor.exchangeAuthorizationCode(
      t.cliente,
      code,
      'v',
      pedido.redirectUri,
      config.resourceUrl,
    );
    await expect(
      t.provedor.exchangeAuthorizationCode(
        t.cliente,
        code,
        'v',
        pedido.redirectUri,
        config.resourceUrl,
      ),
    ).rejects.toMatchObject({ errorCode: 'invalid_grant' });
  });

  it('vale 60 segundos', async () => {
    const t = montar();
    const code = t.provedor.emitirCodigo({
      pessoa: 'pedro',
      rotulo: 'r',
      pedido,
    });
    t.avancar(61_000);
    await expect(
      t.provedor.exchangeAuthorizationCode(
        t.cliente,
        code,
        'v',
        pedido.redirectUri,
        config.resourceUrl,
      ),
    ).rejects.toMatchObject({ errorCode: 'invalid_grant' });
  });

  it('exige o mesmo cliente, o mesmo redirect_uri e o mesmo recurso', async () => {
    const t = montar();
    const code = () =>
      t.provedor.emitirCodigo({ pessoa: 'pedro', rotulo: 'r', pedido });
    await expect(
      t.provedor.exchangeAuthorizationCode(
        { client_id: 'outro', redirect_uris: [] } as never,
        code(),
        'v',
        pedido.redirectUri,
        config.resourceUrl,
      ),
    ).rejects.toMatchObject({ errorCode: 'invalid_grant' });
    await expect(
      t.provedor.exchangeAuthorizationCode(
        t.cliente,
        code(),
        'v',
        'https://claude.ai/outro',
        config.resourceUrl,
      ),
    ).rejects.toMatchObject({ errorCode: 'invalid_grant' });
    await expect(
      t.provedor.exchangeAuthorizationCode(
        t.cliente,
        code(),
        'v',
        pedido.redirectUri,
        new URL('https://outro.exemplo/mcp'),
      ),
    ).rejects.toMatchObject({ errorCode: 'invalid_target' });
  });

  it('código forjado ou de outra chave não troca por nada', async () => {
    const t = montar();
    await expect(
      t.provedor.exchangeAuthorizationCode(
        t.cliente,
        'lixo.lixo',
        'v',
        pedido.redirectUri,
        config.resourceUrl,
      ),
    ).rejects.toMatchObject({ errorCode: 'invalid_grant' });
  });
});

describe('troca de código por tokens', () => {
  it('cria o acesso com o rótulo e devolve access JWT (15 min) e refresh', async () => {
    const t = montar();
    const tokens = await obterTokens(t);
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(900);
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope).toBe('financas');
    const estado = await t.gerenciador.ler();
    const [acesso] = Object.values(estado.acessos);
    expect(acesso).toMatchObject({
      rotulo: 'celular do Pedro',
      pessoa: 'pedro',
      estado: 'ativo',
      cliente: 'Claude',
    });
    expect(acesso?.refreshAtualHash).toBe(
      hashToken(tokens.refresh_token as string),
    );
    expect(JSON.stringify(estado)).not.toContain(
      tokens.refresh_token as string,
    );
  });

  it('registra acesso_concedido na auditoria com o rótulo e sem token', async () => {
    const t = montar();
    const tokens = await obterTokens(t);
    const linha = t.auditoria.find(l =>
      l.includes('acesso_concedido'),
    ) as string;
    expect(JSON.parse(linha).rotulo).toBe('celular do Pedro');
    expect(linha).not.toContain(tokens.access_token);
    expect(linha).not.toContain(tokens.refresh_token as string);
  });
});

describe('refresh rotativo', () => {
  it('troca por um par novo e o refresh antigo deixa de ser o vigente', async () => {
    const t = montar();
    const primeiro = await obterTokens(t);
    t.avancar(10 * 60_000);
    const segundo = await t.provedor.exchangeRefreshToken(
      t.cliente,
      primeiro.refresh_token as string,
    );
    expect(segundo.refresh_token).not.toBe(primeiro.refresh_token);
    expect(segundo.access_token).not.toBe(primeiro.access_token);
  });

  it('tolera a retentativa do refresh anterior em até 60 s', async () => {
    const t = montar();
    const primeiro = await obterTokens(t);
    t.avancar(10 * 60_000);
    await t.provedor.exchangeRefreshToken(
      t.cliente,
      primeiro.refresh_token as string,
    );
    t.avancar(30_000);
    await expect(
      t.provedor.exchangeRefreshToken(
        t.cliente,
        primeiro.refresh_token as string,
      ),
    ).resolves.toBeTruthy();
  });

  it('REUSO depois de 60 s encerra o acesso e responde invalid_grant "acesso encerrado"', async () => {
    const t = montar();
    const primeiro = await obterTokens(t);
    t.avancar(10 * 60_000);
    await t.provedor.exchangeRefreshToken(
      t.cliente,
      primeiro.refresh_token as string,
    );
    t.avancar(61_000);
    await expect(
      t.provedor.exchangeRefreshToken(
        t.cliente,
        primeiro.refresh_token as string,
      ),
    ).rejects.toMatchObject({
      errorCode: 'invalid_grant',
      message: expect.stringContaining('acesso encerrado'),
    });
    const [acesso] = Object.values((await t.gerenciador.ler()).acessos);
    expect(acesso?.estado).toBe('encerrado');
    expect(acesso?.motivoEncerramento).toBe('reuso-de-refresh');
  });

  it('refresh expirado (30 dias parado) responde invalid_grant "acesso expirado"', async () => {
    const t = montar();
    const tokens = await obterTokens(t);
    t.avancar(31 * 86_400_000);
    await expect(
      t.provedor.exchangeRefreshToken(
        t.cliente,
        tokens.refresh_token as string,
      ),
    ).rejects.toMatchObject({
      errorCode: 'invalid_grant',
      message: expect.stringContaining('acesso expirado'),
    });
  });

  it('refresh inventado ou de pessoa removida é invalid_grant (nunca outro código)', async () => {
    const t = montar();
    await expect(
      t.provedor.exchangeRefreshToken(t.cliente, 'a_x.lixo'),
    ).rejects.toMatchObject({ errorCode: 'invalid_grant' });
    await expect(
      t.provedor.exchangeRefreshToken(t.cliente, 'sem-ponto'),
    ).rejects.toMatchObject({ errorCode: 'invalid_grant' });
    const t2 = montar({ pessoas: { julia: 'julia@exemplo.com' } });
    const tokens = await obterTokens(t2);
    await expect(
      t2.provedor.exchangeRefreshToken(
        t2.cliente,
        tokens.refresh_token as string,
      ),
    ).rejects.toMatchObject({
      errorCode: 'invalid_grant',
    });
  });
});

describe('verifyAccessToken', () => {
  it('aceita o token vigente e devolve a pessoa, o rótulo, o recurso e a expiração', async () => {
    const t = montar();
    const tokens = await obterTokens(t);
    const info = await t.provedor.verifyAccessToken(tokens.access_token);
    expect(info.scopes).toEqual(['financas']);
    expect(info.resource?.href).toBe(config.resourceUrl.href);
    expect(info.extra).toMatchObject({
      rotulo: 'celular do Pedro',
      pessoa: 'pedro',
    });
    expect(info.expiresAt).toBe(
      Math.floor(new Date('2026-10-25T12:00:00Z').getTime() / 1000) + 900,
    );
  });

  it('recusa token de outra audiência, expirado, adulterado e lixo', async () => {
    const t = montar();
    const tokens = await obterTokens(t);
    const [, corpo] = tokens.access_token.split('.');
    const gid = JSON.parse(Buffer.from(corpo as string, 'base64url').toString())
      .gid as string;
    const agoraS = Math.floor(Date.now() / 1000);
    const outraAud = signJwt(
      { gid, aud: 'https://outro/mcp', iat: agoraS, exp: agoraS + 900 },
      deriveKey(MESTRE, 'token'),
    );
    await expect(t.provedor.verifyAccessToken(outraAud)).rejects.toMatchObject({
      errorCode: 'invalid_token',
    });
    await expect(
      t.provedor.verifyAccessToken(`${tokens.access_token}x`),
    ).rejects.toMatchObject({ errorCode: 'invalid_token' });
    await expect(t.provedor.verifyAccessToken('lixo')).rejects.toMatchObject({
      errorCode: 'invalid_token',
    });
  });

  it('recusa quando o acesso foi encerrado (revogação vale no próximo pedido, dentro do cache)', async () => {
    const t = montar();
    const tokens = await obterTokens(t);
    await t.gerenciador.atualizar(e =>
      encerrar(e, Object.keys(e.acessos)[0] as string, 'manual', new Date()),
    );
    await expect(
      t.provedor.verifyAccessToken(tokens.access_token),
    ).rejects.toMatchObject({ errorCode: 'invalid_token' });
  });
});

describe('revogação (RFC 7009)', () => {
  it('revogar o refresh encerra o acesso (motivo manual)', async () => {
    const t = montar();
    const tokens = await obterTokens(t);
    await t.provedor.revokeToken?.(t.cliente, {
      token: tokens.refresh_token as string,
    });
    const [acesso] = Object.values((await t.gerenciador.ler()).acessos);
    expect(acesso?.estado).toBe('encerrado');
    expect(acesso?.motivoEncerramento).toBe('manual');
  });

  it('token desconhecido não dá erro (resposta sempre de sucesso)', async () => {
    const t = montar();
    await expect(
      t.provedor.revokeToken?.(t.cliente, { token: 'qualquer' }),
    ).resolves.toBeUndefined();
  });
});
