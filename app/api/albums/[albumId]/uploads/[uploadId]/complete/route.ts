import { createSupabaseServerClient } from "@/lib/db/supabase-server";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createUploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createSupabasePreviewStorage } from "@/lib/media/preview-storage";
import { sanitizeOriginalFilename } from "@/lib/media/filenames";
import { completeUpload } from "@/server/use-cases/uploads";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getServerEnv } from "@/lib/env";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string; uploadId: string }>;
}

// Envio para o Drive + processamento de imagem pode ultrapassar os 10s
// por omissão da Vercel; sem efeito fora da Vercel (Cloud Run não lê isto).
export const maxDuration = 60;

/**
 * Recebe os bytes do ficheiro (multipart/form-data, campo "file") e
 * conclui o envio iniciado por `POST .../uploads` (secção 12/14). Uma
 * verificação rápida por `Content-Length` rejeita pedidos manifestamente
 * grandes antes de gastar memória a ler o corpo — `completeUpload`
 * volta a validar o tamanho real do buffer depois.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const { albumId, uploadId } = await params;

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

    const { allowed } = await checkRateLimit(
      "upload-complete",
      `${user.id}:${albumId}`,
    );
    if (!allowed) {
      throw new AppError(
        "RATE_LIMITED",
        "Demasiados envios em curso. Tente novamente dentro de instantes.",
        429,
      );
    }

    const env = getServerEnv();
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    // Margem para o overhead do multipart/form-data à volta do ficheiro.
    if (contentLength > env.MAX_UPLOAD_BYTES * 1.1) {
      throw new AppError(
        "UPLOAD_FILE_TOO_LARGE",
        "O ficheiro excede o limite permitido.",
        413,
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Ficheiro em falta no pedido.",
        400,
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const adminClient = createSupabaseAdminClient();

    const photo = await completeUpload(
      {
        uploadId,
        fileBuffer,
        declaredFilename: sanitizeOriginalFilename(file.name),
      },
      { albumId, userId: user.id },
      {
        albums: createAlbumsRepository(adminClient),
        sessions: createAlbumSessionsRepository(adminClient),
        connections: createGoogleConnectionsRepository(adminClient),
        uploadJobs: createUploadJobsRepository(adminClient),
        photos: createPhotosRepository(adminClient),
        auditLog: createAuditLogRepository(adminClient),
        previewStorage: createSupabasePreviewStorage(adminClient),
      },
    );

    return jsonOk(photo);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
