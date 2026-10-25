// Páginas servidas pelo próprio servidor de autorização (spec 010, R-11): o
// consentimento e o erro. HTML estático em pt-BR, sem script, com CSP restritiva.
// (Não há React nesta rota; os textos ficam centralizados aqui.)

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Rótulo do acesso: 1 a 40 caracteres, sem controles. `null` se inválido. */
export function validarRotulo(bruto: unknown): string | null {
  if (typeof bruto !== 'string') {
    return null;
  }
  const limpo = bruto.replace(/\p{Cc}/gu, ' ').trim();
  return limpo.length >= 1 && limpo.length <= 40 ? limpo : null;
}

/**
 * Cabeçalhos de toda página. O `form-action` precisa incluir a origem do retorno:
 * o Chrome aplica essa regra também ao redirecionamento que sucede o POST.
 */
export function cabecalhosDePagina(
  opcoes: { origemRetorno?: string } = {},
): Record<string, string> {
  const extra = formAction(opcoes.origemRetorno);
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `form-action 'self'${extra}`,
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; '),
  };
}

function formAction(origem: string | undefined): string {
  if (!origem) {
    return '';
  }
  try {
    const url = new URL(origem);
    if (url.protocol === 'http:') {
      return ` http://${url.hostname}:*`; // loopback: porta variável
    }
    return ` ${url.origin}`;
  } catch {
    return '';
  }
}

const ESTILO = `body{font-family:system-ui,sans-serif;margin:0;padding:24px;max-width:480px;margin-inline:auto;line-height:1.45;color:#1b1b1f;background:#fff}
@media(prefers-color-scheme:dark){body{color:#e8e8ec;background:#17171a}input{background:#222;color:inherit}}
h1{font-size:1.25rem}.host{font-weight:700;font-size:1.1rem;word-break:break-all}
label{display:block;margin:16px 0 4px}input[type=text]{width:100%;box-sizing:border-box;padding:10px;font-size:1rem}
button{margin-top:20px;padding:12px 20px;font-size:1rem;border:0;border-radius:8px;background:#2b6cb0;color:#fff;width:100%}
.aviso{font-size:.9rem;opacity:.8}`;

function moldura(titulo: string, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(titulo)}</title><style>${ESTILO}</style></head><body>${corpo}</body></html>`;
}

export type DadosConsentimento = {
  nomeCliente: string;
  hostRetorno: string;
  origemRetorno: string;
  rotuloSugerido: string;
  csrf: string;
  sessao: string;
};

export function paginaConsentimento(d: DadosConsentimento): string {
  return moldura(
    'Autorizar acesso',
    `<h1>Autorizar acesso às finanças do casal</h1>
<p><strong>${escaparHtml(d.nomeCliente)}</strong> quer <strong>consultar</strong> as finanças do casal — <strong>somente leitura</strong> nesta versão.</p>
<p>Depois de autorizar, você volta para:</p>
<p class="host">${escaparHtml(d.hostRetorno)}</p>
<form method="post" action="/consentimento">
<input type="hidden" name="csrf" value="${escaparHtml(d.csrf)}">
<input type="hidden" name="sessao" value="${escaparHtml(d.sessao)}">
<label for="rotulo">Nome deste acesso (para você reconhecer depois)</label>
<input type="text" id="rotulo" name="rotulo" maxlength="40" required value="${escaparHtml(d.rotuloSugerido)}">
<button type="submit">Autorizar</button>
</form>
<p class="aviso">Você pode encerrar este acesso a qualquer momento. Se o endereço acima não for de um serviço que você abriu agora, feche esta página.</p>`,
  );
}

export function paginaErro(mensagem: string): string {
  return moldura(
    'Não foi possível continuar',
    `<h1>Não foi possível continuar</h1><p>${escaparHtml(mensagem)}</p>`,
  );
}
