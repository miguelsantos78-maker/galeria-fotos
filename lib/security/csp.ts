/**
 * Cabeçalhos de segurança, incluindo Content Security Policy (secção
 * 15). Corre no proxy/middleware (Edge runtime).
 *
 * `script-src`/`style-src` usam `'unsafe-inline'`, não nonces: uma CSP
 * baseada em nonce por pedido foi tentada primeiro (gerar o nonce no
 * proxy, repeti-lo no cabeçalho do pedido, tal como o App Router do
 * Next.js documenta para aplicar automaticamente aos seus próprios
 * scripts de hidratação), mas falhava de forma inconsistente consoante
 * a rota fosse pré-renderizada estaticamente ou não — mesmo depois de
 * forçar `dynamic = "force-dynamic"` numa página que continuava a
 * falhar, sinal de que a colisão entre nonce por pedido e o cache de
 * rota do Next.js não é trivial de eliminar por completo nesta versão.
 * Preferida a política mais simples e robusta (comum em aplicações
 * Next.js reais) a uma que parecesse mais estrita mas partisse a
 * aplicação de forma imprevisível consoante a rota. As restantes
 * diretivas (frame-ancestors, object-src, base-uri, form-action,
 * connect-src/img-src limitados ao próprio site e ao projeto Supabase)
 * continuam estritas e são o que realmente impede a maioria dos
 * cenários de XSS/clickjacking relevantes aqui.
 */

export interface SecurityHeaders {
  headers: Record<string, string>;
}

export function buildSecurityHeaders(supabaseUrl: string): SecurityHeaders {
  const supabaseHost = new URL(supabaseUrl).host;

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https://${supabaseHost}`,
    `font-src 'self'`,
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  return {
    headers: {
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    },
  };
}
