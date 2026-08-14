import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { buildSecurityHeaders } from "@/lib/security/csp";

const ADMIN_PREFIX = "/admin";
const LOGIN_PATH = "/admin/login";
const API_PREFIX = "/api/";

function applyHeaders(response: NextResponse, headers: Record<string, string>) {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

/**
 * Renova a sessão Supabase a cada pedido (necessário porque os Server
 * Components não conseguem escrever cookies), faz uma verificação
 * otimista de acesso às rotas /admin, e aplica CSP + cabeçalhos de
 * segurança a todas as respostas (secção 15). A verificação real de
 * autorização acontece sempre no servidor via requireAdmin()
 * (lib/auth/dal.ts), tal como recomendado pela documentação do Next.js
 * para Proxy/Middleware.
 *
 * PORQUE É QUE `/api` NÃO PASSA POR `getUser()`: essa chamada não lê um
 * cookie, faz um pedido de rede ao servidor de autenticação do Supabase
 * (`GET /auth/v1/user`) para validar o token — a cada pedido. As rotas
 * de API já criam o seu próprio cliente (`createSupabaseServerClient`),
 * que num Route Handler consegue escrever cookies e faz a sua própria
 * autenticação; passar aqui primeiro duplicava esse round trip em todos
 * os pedidos à API, sem acrescentar garantia nenhuma. Num envio de 50
 * fotografias — duas chamadas à API por fotografia — eram 100 idas ao
 * servidor de autenticação só para chegar ao mesmo resultado.
 *
 * Os cabeçalhos de segurança continuam a ser aplicados a tudo.
 */
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  const { headers: securityHeaders } = buildSecurityHeaders(
    env.NEXT_PUBLIC_SUPABASE_URL,
  );

  if (request.nextUrl.pathname.startsWith(API_PREFIX)) {
    return applyHeaders(NextResponse.next({ request }), securityHeaders);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX);
  const isLoginRoute = pathname === LOGIN_PATH;

  if (isAdminRoute && !isLoginRoute && (!user || user.is_anonymous)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", pathname);
    return applyHeaders(NextResponse.redirect(loginUrl), securityHeaders);
  }

  return applyHeaders(response, securityHeaders);
}
