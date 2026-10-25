// Configuração do serviço remoto (spec 010, data-model.md §5).
// Falha fechada: qualquer ausência ou valor inválido devolve só o NOME da
// variável. Valores — sobretudo segredos — nunca entram na resposta.

import { cidrValido } from './origem.ts';

export const REDIRECTS_PADRAO = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  'https://chatgpt.com/connector/oauth/*',
  'https://chatgpt.com/connector_platform_oauth_redirect',
];

export type Config = {
  publicUrl: URL;
  /** Identificador do recurso MCP: `<URL_PUBLICA>/mcp`. */
  resourceUrl: URL;
  actual: {
    serverUrl: string;
    sessionToken: string;
    syncId: string;
    budgetPassword?: string;
  };
  google: { clientId: string; clientSecret: string };
  segredoMestre: Buffer;
  bucketEstado: string;
  arquivoPessoas: string;
  redirectsPermitidos: string[];
  origensPermitidasCidr: string[];
  ttlAccessMin: number;
  inatividadeDias: number;
  limiteAbsolutoDias: number;
  syncMaxIdadeMin: number;
  limiteConsultasPorMin: number;
  limiteFalhasPorMin: number;
};

export type ConfigResult =
  | { ok: true; config: Config }
  | { ok: false; falhas: string[] };

type Env = Record<string, string | undefined>;

const lista = (valor: string | undefined): string[] =>
  (valor ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(item => item !== '');

function localhost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

export function loadConfig(env: Env): ConfigResult {
  const falhas: string[] = [];
  const falha = (nome: string) => {
    if (!falhas.includes(nome)) falhas.push(nome);
  };

  const obrigatoria = (nome: string): string => {
    const valor = env[nome];
    if (valor === undefined || valor.trim() === '') {
      falha(nome);
      return '';
    }
    return valor;
  };

  const inteiro = (nome: string, padrao: number): number => {
    const bruto = env[nome];
    if (bruto === undefined || bruto.trim() === '') return padrao;
    const n = Number(bruto);
    if (!Number.isInteger(n) || n < 1) {
      falha(nome);
      return padrao;
    }
    return n;
  };

  // URL pública: https (localhost liberado para desenvolvimento).
  let publicUrl = new URL('https://invalida.invalid');
  const urlBruta = obrigatoria('URL_PUBLICA');
  if (urlBruta !== '') {
    try {
      const parsed = new URL(urlBruta);
      if (
        parsed.protocol !== 'https:' &&
        !(parsed.protocol === 'http:' && localhost(parsed.hostname))
      ) {
        falha('URL_PUBLICA');
      } else {
        publicUrl = new URL(parsed.origin);
      }
    } catch {
      falha('URL_PUBLICA');
    }
  }

  const serverUrl = obrigatoria('ACTUAL_SERVER_URL');
  const sessionToken = obrigatoria('ACTUAL_SESSION_TOKEN');
  const syncId = obrigatoria('ACTUAL_BUDGET_SYNC_ID');
  const clientId = obrigatoria('GOOGLE_CLIENT_ID');
  const clientSecret = obrigatoria('GOOGLE_CLIENT_SECRET');
  const bucketEstado = obrigatoria('BUCKET_ESTADO');

  // Segredo mestre: base64 de pelo menos 32 bytes.
  const segredoBruto = obrigatoria('SEGREDO_MESTRE');
  const segredoMestre = Buffer.from(segredoBruto, 'base64');
  if (segredoBruto !== '' && segredoMestre.length < 32) falha('SEGREDO_MESTRE');

  const origensPermitidasCidr = lista(env.ORIGENS_PERMITIDAS_CIDR);
  if (!origensPermitidasCidr.every(cidrValido)) {
    falha('ORIGENS_PERMITIDAS_CIDR');
  }

  const redirectsLista = lista(env.REDIRECTS_PERMITIDOS);
  const redirectsPermitidos =
    redirectsLista.length > 0 ? redirectsLista : REDIRECTS_PADRAO;

  const ttlAccessMin = inteiro('TTL_ACCESS_MIN', 15);
  const inatividadeDias = inteiro('INATIVIDADE_DIAS', 30);
  const limiteAbsolutoDias = inteiro('LIMITE_ABSOLUTO_DIAS', 180);
  const syncMaxIdadeMin = inteiro('SYNC_MAX_IDADE_MIN', 5);
  const limiteConsultasPorMin = inteiro('LIMITE_CONSULTAS_POR_MIN', 60);
  const limiteFalhasPorMin = inteiro('LIMITE_FALHAS_POR_MIN', 10);

  if (falhas.length > 0) return { ok: false, falhas };

  const budgetPassword = env.ACTUAL_BUDGET_PASSWORD?.trim();
  return {
    ok: true,
    config: {
      publicUrl,
      resourceUrl: new URL('/mcp', publicUrl),
      actual: {
        serverUrl,
        sessionToken,
        syncId,
        ...(budgetPassword ? { budgetPassword } : {}),
      },
      google: { clientId, clientSecret },
      segredoMestre,
      bucketEstado,
      arquivoPessoas: env.ARQUIVO_PESSOAS?.trim() || '/segredos/pessoas.json',
      redirectsPermitidos,
      origensPermitidasCidr,
      ttlAccessMin,
      inatividadeDias,
      limiteAbsolutoDias,
      syncMaxIdadeMin,
      limiteConsultasPorMin,
      limiteFalhasPorMin,
    },
  };
}
