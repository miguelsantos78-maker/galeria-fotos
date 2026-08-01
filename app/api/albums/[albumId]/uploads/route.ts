import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { createUploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import { initiateUpload } from "@/server/use-cases/uploads";
import { initiateUploadSchema } from "@/lib/validation/upload";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string }>;
}

/**
 * Inicia um envio (secção 12/14): cria o `upload_jobs` que
 * `POST .../uploads/[uploadId]/complete` depois consome com os bytes do
 * ficheiro. Exige uma `album_session` válida com permissão "upload" já
 * estabelecida por `POST /api/albums/resolve` (Fase 2) — não cria
 * sessão anónima aqui.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const { albumId } = await params;
    const input = initiateUploadSchema.parse(await request.json());

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
    const result = await initiateUpload(
      input,
      { albumId, userId: user.id },
      {
        albums: createAlbumsRepository(adminClient),
        sessions: createAlbumSessionsRepository(adminClient),
        uploadJobs: createUploadJobsRepository(adminClient),
      },
    );

    return jsonOk(result);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
