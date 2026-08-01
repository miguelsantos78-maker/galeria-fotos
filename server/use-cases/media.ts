import "server-only";
import type { Auth } from "googleapis";
import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { GoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import type { PhotosRepository } from "@/server/repositories/photos-repository";
import { AppError } from "@/lib/api/response";
import { decryptSecret } from "@/lib/security/encryption";
import { createAuthenticatedClient } from "@/lib/google-drive/oauth-client";
import { createDriveStorageProvider } from "@/lib/google-drive/drive-provider";
import type { DriveStorageProvider } from "@/lib/google-drive/types";

interface MediaDeps {
  photos: PhotosRepository;
  albums: AlbumsRepository;
  sessions: AlbumSessionsRepository;
  connections: GoogleConnectionsRepository;
  /** Injetável para testes ("adaptador mock" — secção 19/22). */
  driveProviderFactory?: (authClient: Auth.OAuth2Client) => DriveStorageProvider;
}

export interface OriginalMedia {
  stream: NodeJS.ReadableStream;
  filename: string;
  mimeType: string;
}

/**
 * Serve o original a partir do Drive sem nunca expor o token de acesso
 * ou um URL interno do Google ao cliente (secção 5.4). Usa sempre a
 * mensagem genérica "PHOTO_NOT_FOUND" para uma fotografia inexistente,
 * eliminada ou fora do que a sessão pode ver — nunca distingue estes
 * casos na resposta (secção 15).
 */
export async function getOriginalForViewer(
  photoId: string,
  userId: string,
  deps: MediaDeps,
): Promise<OriginalMedia> {
  const photo = await deps.photos.findById(photoId);
  if (!photo || photo.deleted_at) {
    throw new AppError("PHOTO_NOT_FOUND", "Fotografia não encontrada.", 404);
  }

  const session = await deps.sessions.findValidForUser(
    photo.album_id,
    userId,
  );
  if (!session) {
    throw new AppError(
      "ALBUM_SESSION_INVALID",
      "Sessão de álbum inválida ou expirada.",
      401,
    );
  }

  const canModerate = session.permissions.includes("moderate");
  const isVisible =
    photo.status === "ready" ||
    (photo.status === "pending_review" && canModerate);
  if (!isVisible) {
    throw new AppError("PHOTO_NOT_FOUND", "Fotografia não encontrada.", 404);
  }

  const album = await deps.albums.findById(photo.album_id);
  if (!album || !album.download_enabled) {
    throw new AppError(
      "ALBUM_DOWNLOAD_DISABLED",
      "A transferência de fotografias está desativada para este álbum.",
      403,
    );
  }

  const connection = await deps.connections.findActiveByUser(album.owner_id);
  if (!connection) {
    throw new AppError(
      "GOOGLE_DRIVE_NOT_CONNECTED",
      "A ligação ao Google Drive deste álbum não está disponível.",
      503,
    );
  }

  const refreshToken = decryptSecret(
    connection.encrypted_refresh_token,
    connection.token_key_version,
  );
  const authClient = createAuthenticatedClient(refreshToken);
  const provider = (deps.driveProviderFactory ?? createDriveStorageProvider)(
    authClient,
  );

  const stream = await provider.getOriginalStream({
    fileId: photo.drive_file_id,
  });

  return {
    stream,
    filename: photo.original_filename,
    mimeType: photo.mime_type,
  };
}
