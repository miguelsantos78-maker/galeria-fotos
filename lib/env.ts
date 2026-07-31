import { z } from "zod";

/**
 * Variáveis expostas ao browser. Apenas o prefixo NEXT_PUBLIC_ é seguro
 * aqui — nada neste esquema pode conter segredos.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/**
 * Variáveis apenas de servidor. Nunca importar este módulo a partir de
 * um Client Component.
 */
const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.url(),

  APP_ENCRYPTION_KEY: z
    .string()
    .min(32, "APP_ENCRYPTION_KEY deve ter pelo menos 32 bytes."),
  APP_TOKEN_PEPPER: z
    .string()
    .min(16, "APP_TOKEN_PEPPER deve ter pelo menos 16 caracteres."),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(50),
  PREVIEW_MAX_EDGE: z.coerce.number().int().positive().default(1600),
  THUMBNAIL_MAX_EDGE: z.coerce.number().int().positive().default(480),

  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function formatZodError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("\n");
  return `Configuração de ambiente inválida:\n${issues}`;
}

let cachedServerEnv: ServerEnv | undefined;
let cachedPublicEnv: PublicEnv | undefined;

/**
 * Valida e devolve todas as variáveis de ambiente (públicas + privadas).
 * Só deve ser chamado em código de servidor. O resultado é validado uma
 * única vez e depois reutilizado (memoização).
 */
export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/**
 * Valida e devolve apenas as variáveis públicas (NEXT_PUBLIC_*). Seguro
 * para uso em Client Components.
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error));
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

/** Apenas para testes: limpa a memoização entre casos de teste. */
export function resetEnvCacheForTests(): void {
  cachedServerEnv = undefined;
  cachedPublicEnv = undefined;
}
