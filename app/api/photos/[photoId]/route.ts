import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createPhotosRepository } from "@/server/repositories/photos-repository";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createSupabasePreviewStorage } from "@/lib/media/preview-storage";
import {
  deletePhoto,
  updatePhotoModeration,
} from "@/server/use-cases/moderation";
import { updatePhotoSchema } from "@/lib/validation/photo";
import { jsonError, jsonOk, newRequestId } from "@/lib/api/response";

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

export async function DELETE(_request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { photoId } = await params;

    const supabase = createSupabaseAdminClient();
    await deletePhoto(photoId, profile.id, {
      albums: createAlbumsRepository(supabase),
      photos: createPhotosRepository(supabase),
      connections: createGoogleConnectionsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
      previewStorage: createSupabasePreviewStorage(supabase),
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
