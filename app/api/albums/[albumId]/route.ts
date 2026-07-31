import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import {
  deleteAlbum,
  getAlbumForOwner,
  updateAlbum,
} from "@/server/use-cases/albums";
import { updateAlbumSchema } from "@/lib/validation/album";
import { jsonError, jsonOk, newRequestId } from "@/lib/api/response";

interface RouteParams {
  params: Promise<{ albumId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId } = await params;
    const supabase = createSupabaseAdminClient();

    const album = await getAlbumForOwner(albumId, profile.id, {
      albums: createAlbumsRepository(supabase),
    });

    return jsonOk(album);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId } = await params;
    const input = updateAlbumSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const album = await updateAlbum(albumId, profile.id, input, {
      albums: createAlbumsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
    });

    return jsonOk(album);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const { albumId } = await params;
    const supabase = createSupabaseAdminClient();

    await deleteAlbum(albumId, profile.id, {
      albums: createAlbumsRepository(supabase),
      auditLog: createAuditLogRepository(supabase),
    });

    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error, requestId);
  }
}
