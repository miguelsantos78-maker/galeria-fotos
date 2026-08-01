import { requireAdminApi } from "@/lib/auth/dal";
import { createSupabaseAdminClient } from "@/lib/db/supabase-admin";
import { createAlbumsRepository } from "@/server/repositories/albums-repository";
import { createGoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import { createAuditLogRepository } from "@/server/repositories/audit-log-repository";
import { createAlbumWithDriveFolder, listAlbumsForOwner } from "@/server/use-cases/albums";
import { createAlbumSchema } from "@/lib/validation/album";
import { jsonError, jsonOk, newRequestId } from "@/lib/api/response";

export async function GET() {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const supabase = createSupabaseAdminClient();
    const albums = await listAlbumsForOwner(profile.id, {
      albums: createAlbumsRepository(supabase),
    });

    return jsonOk(albums);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const profile = await requireAdminApi();
    const input = createAlbumSchema.parse(await request.json());

    const supabase = createSupabaseAdminClient();
    const album = await createAlbumWithDriveFolder(
      input,
      { ownerId: profile.id },
      {
        albums: createAlbumsRepository(supabase),
        auditLog: createAuditLogRepository(supabase),
        connections: createGoogleConnectionsRepository(supabase),
      },
    );

    return jsonOk(album);
  } catch (error) {
    return jsonError(error, requestId);
  }
}
