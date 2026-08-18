import {
  getCurrentProfile,
  requireAdminApi,
  verifySession,
} from "@/lib/auth/dal";
import { isAdmin } from "@/lib/auth/admin";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createAlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createSupabasePreviewStorage } from "@/lib/media/preview-storage";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  deleteOwnPhoto,
  deletePhoto,
  updatePhotoModeration,
} from "@/server/use-cases/moderation";
import { updatePhotoSchema } from "@/lib/validation/photo";
import { AppError, jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { photoId } = await params;
    const input = updatePhotoSchema.parse(await request.json());

    const supabase = createSupabaseAdminClient();
    const photo = await updatePhotoModeration(photoId, profile.id, input, {
      albums: createAlbumsRepository(supabase),
      photos: createPhotosRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
    });

    return jsonOk(photo);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

/**
 * Elimina uma fotografia. Dois caminhos, com autorizações diferentes:
 *
 * - administrador dono do álbum: apaga qualquer fotografia dele;
 * - qualquer outra pessoa: apaga só as que enviou, e só enquanto tiver
 *   uma sessão de álbum válida (`deleteOwnPhoto`).
 *
 * A distinção é feita aqui pelo perfil, não por nada que o cliente
 * envie — e o caso de uso escolhido volta a validar tudo por si.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const user = await verifySession();
    if (!user) {
      throw new AppError("UNAUTHORIZED", "Sessão necessária.", 401);
    }

    // Por utilizador, e não por IP: num casamento os convidados estão
    // todos atrás da mesma rede, e um limite por IP castigaria a mesa
    // inteira por causa de uma pessoa.
    const { allowed } = await checkRateLimit("photo-delete", user.id);
    if (!allowed) {
      throw new AppError(
        "RATE_LIMITED",
        "Demasiadas tentativas. Tente novamente dentro de instantes.",
        429,
      );
    }

    const { photoId } = await params;
    const supabase = createSupabaseAdminClient();
    const deps = {
      albums: createAlbumsRepository(supabase),
      photos: createPhotosRepository(supabase),
      connections: createGoogleConnectionsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
      previewStorage: createSupabasePreviewStorage(supabase),
    };

    const profile = await getCurrentProfile();
    const requesterIsAdmin =
      profile !== null &&
      isAdmin({
        email: profile.email,
        role: profile.role,
        adminEmails: getServerEnv().ADMIN_EMAILS,
      });

    if (requesterIsAdmin) {
      try {
        await deletePhoto(photoId, profile.id, deps);
        return jsonOk({ deleted: true });
      } catch (error) {
        // `deletePhoto` recusa quando o álbum não é dele. Um
        // administrador **noutro** álbum é um convidado como qualquer
        // outro, por isso continua para o caminho do autor em vez de
        // ficar sem forma de apagar aquilo que ele próprio enviou.
        if (!(error instanceof AppError) || error.code !== "FORBIDDEN") {
          throw error;
        }
      }
    }

    await deleteOwnPhoto(photoId, user.id, {
      ...deps,
      sessions: createAlbumSessionsRepository(supabase),
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
