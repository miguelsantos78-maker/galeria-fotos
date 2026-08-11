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

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(4_000_000),
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(50),
  // Teto por álbum. Um casamento com uma centena de convidados chega
  // facilmente ao milhar de fotografias, por isso o valor por omissão
  // dá folga larga sobre isso — não é para restringir o uso normal, é
  // para um cliente descontrolado (ou um envio em ciclo) não conseguir
  // encher a conta sozinho antes de alguém reparar.
  MAX_PHOTOS_PER_ALBUM: z.coerce.number().int().positive().default(5000),
  PREVIEW_MAX_EDGE: z.coerce.number().int().positive().default(1600),
  THUMBNAIL_MAX_EDGE: z.coerce.number().int().positive().default(480),

  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  SENTRY_DSN: z.url().optional(),

  // Autoriza chamadas a /api/cron/* (secção 11/26 — sincronização com
  // eliminações feitas diretamente no Drive). A Vercel envia
  // automaticamente "Authorization: Bearer <CRON_SECRET>" nos Cron Jobs
  // quando esta variável existe com este nome exato. Sem ela, a rota
  // fecha por omissão (falha fechada) — nunca corre "aberta".
  CRON_SECRET: z.string().min(16).optional(),

  // Lista de bootstrap para o primeiro administrador (secção 6.1): emails
  // separados por vírgula que são sempre tratados como admin, mesmo antes
  // de existir alguém com profiles.role = 'admin' na base de dados. Ver
  // docs/decisions/0002-fase-1-supabase-auth.md.
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
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
