/** Conjunto mínimo de variáveis de ambiente válidas, para testes que
 * chamam código a montante de `getServerEnv()`. */
export const validServerEnv = {
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/google-drive/callback",
  APP_ENCRYPTION_KEY: "a".repeat(32),
  APP_TOKEN_PEPPER: "test-pepper-0123456789",
};
