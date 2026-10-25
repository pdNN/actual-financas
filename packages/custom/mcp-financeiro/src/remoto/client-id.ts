// Registro de cliente (DCR) SEM ESTADO (spec 010, R-4): o client_id é um documento
// assinado que carrega os retornos permitidos. Nada é gravado, então o /register
// anônimo não custa nada a quem abusa; e a política de retornos é rechecada a
// cada uso, de modo que tirar um provedor da lista invalida os ids dele.

import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  CustomOAuthError,
  InvalidClientMetadataError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { z } from 'zod';

import { signDocument, verifyDocument } from './tokens.ts';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_NOME = 60;

function casaPadrao(url: URL, padrao: string): boolean {
  const m = /^(https:\/\/[^/]+)(\/.*)?$/.exec(padrao);
  if (!m) {
    return false;
  }
  const [, origem, caminho = '/'] = m;
  if (url.origin !== origem) {
    return false;
  }
  if (caminho.endsWith('/*')) {
    const prefixo = caminho.slice(0, -1); // mantém a barra final
    if (!url.pathname.startsWith(prefixo)) {
      return false;
    }
    const resto = url.pathname.slice(prefixo.length);
    return resto !== '' && !resto.includes('/'); // UM segmento, nunca vários níveis
  }
  return url.pathname === caminho;
}

/**
 * Política de retornos: `https` que case com a lista configurada, ou _loopback_
 * (`http`, qualquer porta e caminho — RFC 8252, usado por CLIs e IDEs).
 */
export function redirectPermitido(uri: string, padroes: string[]): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '' || url.hash !== '') {
    return false;
  }
  if (url.protocol === 'http:' && LOOPBACK.has(url.hostname)) {
    return true;
  }
  if (url.protocol !== 'https:' || url.search !== '') {
    return false;
  }
  return padroes.some(padrao => casaPadrao(url, padrao));
}

const documentoSchema = z.object({
  v: z.literal(1),
  uris: z.array(z.string()).min(1),
  nome: z.string(),
});

function hostSeguro(uri: string): string {
  try {
    return new URL(uri).host || 'inválido';
  } catch {
    return 'inválido';
  }
}

export function criarClientsStore(opcoes: {
  chave: Buffer;
  redirectsPermitidos: string[];
}): OAuthRegisteredClientsStore {
  const montar = (
    id: string,
    uris: string[],
    nome: string,
  ): OAuthClientInformationFull => ({
    client_id: id,
    redirect_uris: uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    ...(nome !== '' ? { client_name: nome } : {}),
  });

  return {
    async registerClient(cliente) {
      // Omitir o método conta como cliente público; pedir um método confidencial é recusado.
      const metodo = cliente.token_endpoint_auth_method;
      if (metodo !== undefined && metodo !== 'none') {
        throw new InvalidClientMetadataError(
          'Só clientes públicos (token_endpoint_auth_method "none") são aceitos.',
        );
      }
      const uris = cliente.redirect_uris.map(String);
      if (uris.length === 0) {
        throw new InvalidClientMetadataError(
          'Informe ao menos um redirect_uri.',
        );
      }
      for (const uri of uris) {
        if (!redirectPermitido(uri, opcoes.redirectsPermitidos)) {
          throw new CustomOAuthError(
            'invalid_redirect_uri',
            `Retorno não permitido: ${hostSeguro(uri)}`,
          );
        }
      }
      const nome = (cliente.client_name ?? '').slice(0, MAX_NOME);
      const id = signDocument({ v: 1, uris, nome }, opcoes.chave);
      return {
        ...montar(id, uris, nome),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };
    },

    async getClient(clientId) {
      const doc = verifyDocument(clientId, opcoes.chave, {});
      const lido = documentoSchema.safeParse(doc);
      if (!lido.success) {
        return undefined;
      }
      const { uris, nome } = lido.data;
      if (
        !uris.every(uri => redirectPermitido(uri, opcoes.redirectsPermitidos))
      ) {
        return undefined;
      }
      return montar(clientId, uris, nome);
    },
  };
}
