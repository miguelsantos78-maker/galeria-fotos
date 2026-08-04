import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createShareLinksRepository } from "@/server/repositories/share-links-repository";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { resolveAlbumSession } from "@/server/use-cases/resolve-album";
import { resolveAlbumSchema } from "@/lib/validation/share-link";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";

/**
 * Troca um token de partilha por uma album_session (secção 14). Se o
 * pedido ainda não tiver sessão Supabase, cria uma sessão anónima aqui
 * mesmo — o cliente só precisa desta chamada, sem passos prévios.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const input = resolveAlbumSchema.parse(await request.json());

    const { allowed } = await checkRateLimit(
      "album-resolve",
      getClientIp(request),
    );
    if (!allowed) {
      throw new AppError(
        "RATE_LIMITED",
        "Demasiadas tentativas. Tente novamente dentro de instantes.",
        429,
      );
    }

    const supabase = await createSupabaseServerClient();

    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        logger.error({
          operation: "albums.resolve.signInAnonymously",
          requestId,
          message: error?.message ?? "sem utilizador devolvido",
          status: error?.status ?? null,
          code: error?.code ?? null,
        });
        throw new AppError(
          "SESSION_UNAVAILABLE",
          "Não foi possível iniciar uma sessão de visitante. Tente novamente.",
          503,
        );
      }
      user = data.user;
    }

    const adminClient = createSupabaseAdminClient();
    const result = await resolveAlbumSession(
      input,
      { userId: user.id, isAnonymous: user.is_anonymous ?? false },
      {
        albums: createAlbumsRepository(adminClient),
        shareLinks: createShareLinksRepository(adminClient),
        sessions: createAlbumSessionsRepository(adminClient),
      },
    );

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
