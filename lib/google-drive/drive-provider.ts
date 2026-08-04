import "server-only";
import { Readable } from "node:stream";
import { google, type Auth } from "googleapis";
import type {
  ConnectionHealth,
  DriveFileResult,
  DriveStorageProvider,
  UploadOriginalInput,
} from "./types";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const ROOT_FOLDER_NAME = "LiveGallery";

/**
 * Adaptador real sobre a Drive API v3 (secção 12). Os pedidos
 * autenticados via `google-auth-library` já fazem retry com backoff
 * exponencial para erros transitórios por omissão (`AuthClient.RETRY_CONFIG`,
 * incluindo GET/PUT/POST/DELETE) — por isso não reimplementamos retries
 * aqui. Para `files.create` (não idempotente) desligamos esse retry
 * automático explicitamente, para nunca duplicar uma pasta/ficheiro por
 * causa de uma resposta perdida; a idempotência das pastas vem antes,
 * verificando se já existem (ver `ensureRootFolder`).
 */
export function createDriveStorageProvider(
  authClient: Auth.OAuth2Client,
): DriveStorageProvider {
  const drive = google.drive({ version: "v3", auth: authClient });

  return {
    async ensureRootFolder({ connectionId }) {
      const existing = await drive.files.list({
        q: `mimeType = '${FOLDER_MIME_TYPE}' and appProperties has { key='liveGalleryRoot' and value='true' } and trashed = false`,
        fields: "files(id)",
        spaces: "drive",
        pageSize: 1,
      });

      const foundId = existing.data.files?.[0]?.id;
      if (foundId) return { folderId: foundId };

      const created = await drive.files.create(
        {
          requestBody: {
            name: ROOT_FOLDER_NAME,
            mimeType: FOLDER_MIME_TYPE,
            appProperties: {
              liveGalleryRoot: "true",
              liveGalleryConnectionId: connectionId,
            },
          },
          fields: "id",
        },
        { retry: false },
      );

      if (!created.data.id) {
        throw new Error("O Google Drive não devolveu um ID para a pasta raiz.");
      }
      return { folderId: created.data.id };
    },

    async createAlbumFolder({ parentFolderId, albumId, title }) {
      const created = await drive.files.create(
        {
          requestBody: {
            name: title,
            mimeType: FOLDER_MIME_TYPE,
            parents: [parentFolderId],
            appProperties: { liveGalleryAlbumId: albumId },
          },
          fields: "id",
        },
        { retry: false },
      );

      if (!created.data.id) {
        throw new Error("O Google Drive não devolveu um ID para a pasta do álbum.");
      }
      return { folderId: created.data.id };
    },

    async uploadOriginal({
      parentFolderId,
      filename,
      mimeType,
      body,
      appProperties,
    }: UploadOriginalInput): Promise<DriveFileResult> {
      // A googleapis (via gaxios) espera um stream em "media.body" — só
      // reconhece o formato certo do pedido multipart através de
      // `.pipe()`; um Buffer diretamente falha em runtime com
      // "body.pipe is not a function", sem isto ser óbvio pelo tipo
      // aceite (`NodeJS.ReadableStream | Buffer`, secção 12 do
      // CLAUDE.md) nem pelos tipos do próprio pacote.
      const mediaBody = Buffer.isBuffer(body) ? Readable.from(body) : body;

      const created = await drive.files.create(
        {
          requestBody: {
            name: filename,
            parents: [parentFolderId],
            appProperties,
          },
          media: { mimeType, body: mediaBody },
          fields: "id, name, mimeType, size",
        },
        { retry: false },
      );

      if (!created.data.id) {
        throw new Error("O Google Drive não devolveu um ID para o ficheiro enviado.");
      }

      return {
        fileId: created.data.id,
        name: created.data.name ?? filename,
        mimeType: created.data.mimeType ?? mimeType,
        size: created.data.size ? Number(created.data.size) : null,
      };
    },

    async getOriginalStream({ fileId }) {
      const response = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" },
      );
      return response.data;
    },

    async deleteFile({ fileId }) {
      try {
        await drive.files.delete({ fileId });
      } catch (error) {
        if (isDriveNotFoundError(error)) return;
        throw error;
      }
    },

    async verifyConnection(): Promise<ConnectionHealth> {
      try {
        const about = await drive.about.get({ fields: "user" });
        return { ok: true, accountEmail: about.data.user?.emailAddress ?? null };
      } catch (error) {
        return {
          ok: false,
          accountEmail: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async listActivePhotoIds() {
      const photoIds = new Set<string>();
      let pageToken: string | undefined;

      do {
        const response = await drive.files.list({
          q: "appProperties has { key='liveGalleryPhotoId' } and trashed = false",
          fields: "nextPageToken, files(appProperties)",
          spaces: "drive",
          pageSize: 1000,
          pageToken,
        });

        for (const file of response.data.files ?? []) {
          const photoId = file.appProperties?.liveGalleryPhotoId;
          if (photoId) photoIds.add(photoId);
        }

        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);

      return photoIds;
    },
  };
}

function isDriveNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 404
  );
}
