// Estado dos acessos como UM objeto JSON no Cloud Storage, por REST (sem SDK).
// Escrita com `ifGenerationMatch`: nunca sobrescreve às cegas (spec 010, R-7).
// Erros nunca carregam token, corpo de resposta nem URL com segredo.

import { estadoVazio, parseEstado } from './acessos.ts';
import type { Estado } from './acessos.ts';
import type {
  EstadoStore,
  ResultadoGravacao,
  Versionado,
} from './estado-store.ts';

const API = 'https://storage.googleapis.com';
const METADATA_TOKEN =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';

/** Token da conta de serviço do Cloud Run (servidor de metadados). */
export async function tokenDoMetadata(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const resposta = await fetchImpl(METADATA_TOKEN, {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!resposta.ok) {
    throw new Error('GCS: falha ao obter credencial do servidor de metadados.');
  }
  const corpo = (await resposta.json()) as { access_token?: unknown };
  if (typeof corpo.access_token !== 'string') {
    throw new Error('GCS: resposta de credencial inválida.');
  }
  return corpo.access_token;
}

type Opcoes = {
  bucket: string;
  objeto?: string;
  obterToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
};

export function criarEstadoGcs(opcoes: Opcoes): EstadoStore {
  const objeto = opcoes.objeto ?? 'estado.json';
  const http = opcoes.fetchImpl ?? fetch;
  const nome = encodeURIComponent(objeto);

  return {
    async ler(): Promise<Versionado> {
      const token = await opcoes.obterToken();
      const resposta = await http(
        `${API}/storage/v1/b/${opcoes.bucket}/o/${nome}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (resposta.status === 404) {
        return { estado: estadoVazio(), geracao: '0' };
      }
      if (!resposta.ok) {
        throw new Error(
          `GCS: falha ao ler o estado (HTTP ${resposta.status}).`,
        );
      }
      const geracao = resposta.headers.get('x-goog-generation');
      if (!geracao) throw new Error('GCS: resposta sem geração do objeto.');
      const estado: Estado = parseEstado(await resposta.json());
      return { estado, geracao };
    },

    async gravar(estado, geracaoEsperada): Promise<ResultadoGravacao> {
      const token = await opcoes.obterToken();
      const resposta = await http(
        `${API}/upload/storage/v1/b/${opcoes.bucket}/o?uploadType=media&name=${nome}&ifGenerationMatch=${encodeURIComponent(geracaoEsperada)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(estado),
        },
      );
      if (resposta.status === 412) return { ok: false, motivo: 'conflito' };
      if (!resposta.ok) {
        throw new Error(
          `GCS: falha ao gravar o estado (HTTP ${resposta.status}).`,
        );
      }
      const corpo = (await resposta.json()) as { generation?: unknown };
      if (typeof corpo.generation !== 'string') {
        throw new Error('GCS: resposta de gravação sem geração.');
      }
      return { ok: true, geracao: corpo.generation };
    },
  };
}
