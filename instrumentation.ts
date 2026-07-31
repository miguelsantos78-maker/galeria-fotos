export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getServerEnv } = await import("@/lib/env");

  try {
    getServerEnv();
  } catch (error) {
    console.error(
      "[LiveGallery] Configuração de ambiente inválida no arranque.",
    );
    console.error(error instanceof Error ? error.message : error);
    throw error;
  }
}
