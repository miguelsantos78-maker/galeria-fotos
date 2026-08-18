import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createSignedPreviewUrls } from "@/lib/media/preview-url";
import { listPhotosForViewer } from "@/server/use-cases/photos";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string }>;
}

/**
 * Grelha simples com paginação por cursor (secção 14/16) — a versão
 * completa (masonry, virtualização, tempo real) é a Fase 5. Exige uma
 * `album_session` válida (o `GET` não é público: só quem já resolveu o
 * link consegue listar).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const { albumId } = await params;
    const { searchParams } = new URL(request.url);

    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = parseOptionalInt(searchParams.get("limit"));
    const onlyMine = searchParams.get("mine") === "true";

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new AppError(
        "ALBUM_SESSION_INVALID",
        "Sessão de álbum inválida ou expirada.",
        401,
      );
    }

    const adminClient = createSupabaseAdminClient();
    const result = await listPhotosForViewer(
      albumId,
      user.id,
      { cursor, limit, onlyMine },
      {
        sessions: createAlbumSessionsRepository(adminClient),
        photos: createPhotosRepository(adminClient),
        createSignedUrls: (paths) =>
          createSignedPreviewUrls(adminClient, paths),
      },
    );

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("VALIDATION_ERROR", "Parâmetro inválido.", 400);
  }
  return parsed;
}
