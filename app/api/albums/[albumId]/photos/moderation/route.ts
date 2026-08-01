import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { listPhotosForOwner } from "@/server/use-cases/moderation";
import { createSignedPreviewUrls } from "@/lib/media/preview-url";
import { photoSortFieldSchema } from "@/lib/validation/photo";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string }>;
}

/**
 * Listagem de administração (secção 10.4): todas as fotografias não
 * eliminadas do álbum, em qualquer estado — ao contrário de
 * `GET /api/albums/[albumId]/photos` (Fase 4/5), que só mostra o que um
 * convidado pode ver. Fora da lista "principal" da secção 14, tal como
 * os outros endpoints de administração já acrescentados nas fases
 * anteriores (`/status`, `/verify`, `.../uploads/[id]/complete`).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId } = await params;

    const { searchParams } = new URL(request.url);
    const sortByParam = searchParams.get("sortBy");
    const sortBy = sortByParam
      ? photoSortFieldSchema.parse(sortByParam)
      : undefined;

    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limit !== undefined && !Number.isFinite(limit)) {
      throw new AppError("VALIDATION_ERROR", "Parâmetro inválido.", 400);
    }

    const supabase = createSupabaseAdminClient();
    const photos = await listPhotosForOwner(
      albumId,
      profile.id,
      { sortBy, limit },
      {
        albums: createAlbumsRepository(supabase),
        photos: createPhotosRepository(supabase),
        createSignedUrls: (paths) => createSignedPreviewUrls(supabase, paths),
      },
    );

    return jsonOk(photos);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
