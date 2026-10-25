// IP real do pedido e filtro de faixa opcional (spec 010, RF-019).
// O IP vive só em memória: serve aos limites e ao filtro, nunca vai a log.

import { isIP } from 'node:net';

type IpParseado = { versao: 4 | 6; n: bigint };

function parseIpv4(texto: string): bigint | null {
  const partes = texto.split('.');
  if (partes.length !== 4) return null;
  let n = 0n;
  for (const parte of partes) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const valor = Number(parte);
    if (valor > 255) return null;
    n = (n << 8n) | BigInt(valor);
  }
  return n;
}

function parseIpv6(entrada: string): bigint | null {
  let texto = entrada;
  if (texto.includes('.')) {
    const i = texto.lastIndexOf(':');
    const v4 = parseIpv4(texto.slice(i + 1));
    if (v4 === null) return null;
    texto = `${texto.slice(0, i + 1)}${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const lados = texto.split('::');
  if (lados.length > 2) return null;
  const cabeca = lados[0] ? lados[0].split(':') : [];
  const cauda = lados.length === 2 && lados[1] ? lados[1].split(':') : [];
  if (lados.length === 1 && cabeca.length !== 8) return null;
  if (lados.length === 2 && cabeca.length + cauda.length > 7) return null;
  const faltam = lados.length === 2 ? 8 - cabeca.length - cauda.length : 0;
  const grupos = [...cabeca, ...Array<string>(faltam).fill('0'), ...cauda];
  let n = 0n;
  for (const grupo of grupos) {
    if (!/^[0-9a-f]{1,4}$/i.test(grupo)) return null;
    n = (n << 16n) | BigInt(parseInt(grupo, 16));
  }
  return n;
}

function parseIp(ip: string): IpParseado | null {
  const versao = isIP(ip);
  if (versao === 4) {
    const n = parseIpv4(ip);
    return n === null ? null : { versao: 4, n };
  }
  if (versao === 6) {
    const n = parseIpv6(ip);
    if (n === null) return null;
    // IPv4 mapeado em IPv6 (::ffff:a.b.c.d) é tratado como IPv4.
    if (n >> 32n === 0xffffn) return { versao: 4, n: n & 0xffffffffn };
    return { versao: 6, n };
  }
  return null;
}

function parseCidr(cidr: string): { rede: IpParseado; prefixo: number } | null {
  const [endereco, prefixoTexto, resto] = cidr.split('/');
  if (
    resto !== undefined ||
    endereco === undefined ||
    prefixoTexto === undefined
  ) {
    return null;
  }
  if (!/^\d{1,3}$/.test(prefixoTexto)) return null;
  const rede = parseIp(endereco);
  if (!rede) return null;
  const prefixo = Number(prefixoTexto);
  const bits = rede.versao === 4 ? 32 : 128;
  if (prefixo > bits) return null;
  return { rede, prefixo };
}

export function cidrValido(cidr: string): boolean {
  return parseCidr(cidr) !== null;
}

export function ipNaFaixa(ip: string, cidrs: string[]): boolean {
  const alvo = parseIp(ip);
  if (!alvo) return false;
  for (const cidr of cidrs) {
    const faixa = parseCidr(cidr);
    if (!faixa || faixa.rede.versao !== alvo.versao) continue;
    const bits = alvo.versao === 4 ? 32 : 128;
    const deslocamento = BigInt(bits - faixa.prefixo);
    if (alvo.n >> deslocamento === faixa.rede.n >> deslocamento) return true;
  }
  return false;
}

/** Lista vazia = filtro desligado. Com lista, IP desconhecido é recusado. */
export function origemPermitida(ip: string | null, cidrs: string[]): boolean {
  if (cidrs.length === 0) return true;
  if (ip === null) return false;
  return ipNaFaixa(ip, cidrs);
}

type Cabecalhos = Record<string, string | string[] | undefined>;

/**
 * IP do cliente a partir de `X-Forwarded-For`. Pega a ÚLTIMA entrada (a que o
 * frontend confiável acrescentou), pulando `saltos` proxies confiáveis. A
 * posição certa no Cloud Run é o spike S-4 da spec 010.
 */
export function ipDoPedido(
  cabecalhos: Cabecalhos,
  opcoes: { saltos?: number; socketIp?: string } = {},
): string | null {
  const bruto = cabecalhos['x-forwarded-for'];
  if (bruto === undefined) {
    return opcoes.socketIp && isIP(opcoes.socketIp) ? opcoes.socketIp : null;
  }
  const texto = Array.isArray(bruto) ? bruto.join(',') : bruto;
  const entradas = texto
    .split(',')
    .map(e => e.trim())
    .filter(e => e !== '');
  const posicao = entradas.length - 1 - (opcoes.saltos ?? 0);
  const candidato = entradas[posicao];
  return candidato !== undefined && isIP(candidato) ? candidato : null;
}
