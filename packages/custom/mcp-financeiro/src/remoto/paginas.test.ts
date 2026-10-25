import { describe, expect, it } from 'vitest';

import {
  cabecalhosDePagina,
  escaparHtml,
  paginaConsentimento,
  paginaErro,
  validarRotulo,
} from './paginas';

const base = {
  nomeCliente: 'Claude',
  hostRetorno: 'claude.ai',
  origemRetorno: 'https://claude.ai',
  rotuloSugerido: 'celular de pedro',
  csrf: 'csrf-token-123',
  sessao: 'sessao.assinada',
};

describe('escaparHtml', () => {
  it('escapa os cinco caracteres perigosos', () => {
    expect(escaparHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('paginaConsentimento', () => {
  it('mostra o host do retorno em destaque, o que será concedido e o botão de autorizar', () => {
    const html = paginaConsentimento(base);
    expect(html).toContain('claude.ai');
    expect(html).toMatch(/somente leitura/i);
    expect(html).toContain('Autorizar');
    expect(html).toContain('<form method="post" action="/consentimento">');
  });

  it('inclui CSRF e sessão em campos ocultos e o campo de rótulo com limite de 40', () => {
    const html = paginaConsentimento(base);
    expect(html).toContain('name="csrf" value="csrf-token-123"');
    expect(html).toContain('name="sessao" value="sessao.assinada"');
    expect(html).toMatch(
      /name="rotulo"[^>]*maxlength="40"[^>]*required|name="rotulo"[^>]*required[^>]*maxlength="40"/,
    );
    expect(html).toContain('value="celular de pedro"');
  });

  it('escapa o nome do cliente e o host (sem injeção de HTML)', () => {
    const html = paginaConsentimento({
      ...base,
      nomeCliente: '<script>alert(1)</script>',
      hostRetorno: '"><img src=x>',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('não carrega script nenhum', () => {
    expect(paginaConsentimento(base)).not.toMatch(/<script/i);
  });
});

describe('paginaErro', () => {
  it('mostra só a mensagem recebida, escapada', () => {
    const html = paginaErro('Esta conta <b>não</b> tem acesso.');
    expect(html).toContain('Esta conta &lt;b&gt;não&lt;/b&gt; tem acesso.');
  });
});

describe('cabecalhosDePagina', () => {
  it('CSP restritiva, sem enquadramento, sem cache', () => {
    const h = cabecalhosDePagina();
    expect(h['Content-Security-Policy']).toContain("default-src 'none'");
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(h['Content-Security-Policy']).toContain("base-uri 'none'");
    expect(h['Cache-Control']).toBe('no-store');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
  });

  it('form-action inclui a origem do retorno (o Chrome aplica a regra ao redirecionamento)', () => {
    const csp = cabecalhosDePagina({ origemRetorno: 'https://claude.ai' })[
      'Content-Security-Policy'
    ];
    expect(csp).toContain("form-action 'self' https://claude.ai");
  });

  it('para loopback libera qualquer porta daquele host', () => {
    const csp = cabecalhosDePagina({ origemRetorno: 'http://localhost:3118' })[
      'Content-Security-Policy'
    ];
    expect(csp).toContain('http://localhost:*');
  });
});

describe('validarRotulo', () => {
  it('aceita 1 a 40 caracteres, sem espaços nas pontas', () => {
    expect(validarRotulo('  celular do Pedro  ')).toBe('celular do Pedro');
    expect(validarRotulo('a')).toBe('a');
    expect(validarRotulo('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('recusa vazio, só espaços e mais de 40', () => {
    expect(validarRotulo('')).toBeNull();
    expect(validarRotulo('   ')).toBeNull();
    expect(validarRotulo('a'.repeat(41))).toBeNull();
    expect(validarRotulo(undefined)).toBeNull();
  });

  it('remove caracteres de controle', () => {
    expect(validarRotulo('cel\u0000ular\n')).toBe('cel ular');
  });
});
