import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { ShareLinksRepository } from "@/server/repositories/share-links-repository";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { GoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import type {
  ListVisiblePhotosInput,
  PhotosRepository,
} from "@/server/repositories/photos-repository";
import type { UploadJobsRepository } from "@/server/repositories/upload-jobs-repository";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];
type ShareLinkRow = Database["public"]["Tables"]["album_share_links"]["Row"];
type AlbumSessionRow = Database["public"]["Tables"]["album_sessions"]["Row"];
type GoogleConnectionRow =
  Database["public"]["Tables"]["google_connections"]["Row"];
type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];
type PhotoRow = Database["public"]["Tables"]["photos"]["Row"];
type UploadJobRow = Database["public"]["Tables"]["upload_jobs"]["Row"];

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** Simula a violação de unicidade que o Postgres devolveria (código 23505). */
function slugConflictError(): Error & { code: string } {
  return Object.assign(
    new Error(
      'duplicate key value violates unique constraint "albums_slug_key" (slug)',
    ),
    { code: "23505" },
  );
}

export function createFakeAlbumsRepository(
  seed: AlbumRow[] = [],
): AlbumsRepository & { rows: AlbumRow[] } {
  const rows = [...seed];

  return {
    rows,
    async insert(input) {
      if (rows.some((row) => row.slug === input.slug)) {
        throw slugConflictError();
      }
      const now = new Date().toISOString();
      const row: AlbumRow = {
        id: input.id ?? nextId("album"),
        owner_id: input.owner_id,
        google_connection_id: input.google_connection_id,
        title: input.title,
        description: input.description ?? null,
        slug: input.slug,
        cover_photo_id: input.cover_photo_id ?? null,
        drive_folder_id: input.drive_folder_id,
        visibility: input.visibility ?? "unlisted",
        upload_enabled: input.upload_enabled ?? true,
        moderation_enabled: input.moderation_enabled ?? false,
        download_enabled: input.download_enabled ?? true,
        event_start_at: input.event_start_at ?? null,
        event_end_at: input.event_end_at ?? null,
        status: input.status ?? "draft",
        created_at: input.created_at ?? now,
        updated_at: input.updated_at ?? now,
      };
      rows.push(row);
      return row;
    },
    async findById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async findBySlug(slug) {
      return rows.find((row) => row.slug === slug) ?? null;
    },
    async listByOwner(ownerId) {
      return rows.filter((row) => row.owner_id === ownerId);
    },
    async update(id, patch) {
      const index = rows.findIndex((row) => row.id === id);
      if (index === -1) return null;
      rows[index] = { ...rows[index], ...patch } as AlbumRow;
      return rows[index];
    },
    async delete(id) {
      const index = rows.findIndex((row) => row.id === id);
      if (index !== -1) rows.splice(index, 1);
    },
  };
}

export function createFakeShareLinksRepository(
  seed: ShareLinkRow[] = [],
): ShareLinksRepository & { rows: ShareLinkRow[] } {
  const rows = [...seed];

  return {
    rows,
    async insert(input) {
      const row: ShareLinkRow = {
        id: input.id ?? nextId("link"),
        album_id: input.album_id,
        token_hash: input.token_hash,
        pin_hash: input.pin_hash ?? null,
        permissions: input.permissions ?? ["view"],
        expires_at: input.expires_at ?? null,
        revoked_at: input.revoked_at ?? null,
        created_by: input.created_by,
        created_at: input.created_at ?? new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },
    async findByTokenHash(tokenHash) {
      return rows.find((row) => row.token_hash === tokenHash) ?? null;
    },
    async listByAlbum(albumId) {
      return rows.filter((row) => row.album_id === albumId);
    },
    async findByIdAndAlbum(id, albumId) {
      return (
        rows.find((row) => row.id === id && row.album_id === albumId) ?? null
      );
    },
    async revoke(id) {
      const row = rows.find((r) => r.id === id);
      if (!row || row.revoked_at) return null;
      row.revoked_at = new Date().toISOString();
      return row;
    },
  };
}

export function makeAlbumSessionRow(
  overrides: Partial<AlbumSessionRow> = {},
): AlbumSessionRow {
  const now = new Date();
  return {
    id: nextId("session"),
    album_id: "album-1",
    user_id: "user-1",
    share_link_id: null,
    permissions: ["view"],
    expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    created_at: now.toISOString(),
    ...overrides,
  };
}

export function createFakeAlbumSessionsRepository(
  seed: AlbumSessionRow[] = [],
): AlbumSessionsRepository & { rows: AlbumSessionRow[] } {
  const rows = [...seed];

  return {
    rows,
    async insert(input) {
      const row: AlbumSessionRow = {
        id: input.id ?? nextId("session"),
        album_id: input.album_id,
        user_id: input.user_id,
        share_link_id: input.share_link_id ?? null,
        permissions: input.permissions ?? ["view"],
        expires_at: input.expires_at,
        created_at: input.created_at ?? new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },
    async expireByShareLink(shareLinkId) {
      const now = new Date().toISOString();
      for (const row of rows) {
        if (row.share_link_id === shareLinkId && row.expires_at > now) {
          row.expires_at = now;
        }
      }
    },
    async findValidForUser(albumId, userId) {
      const now = new Date().toISOString();
      const matches = rows
        .filter(
          (row) =>
            row.album_id === albumId &&
            row.user_id === userId &&
            row.expires_at > now,
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return matches[0] ?? null;
    },
  };
}

export function createFakeGoogleConnectionsRepository(
  seed: GoogleConnectionRow[] = [],
): GoogleConnectionsRepository & { rows: GoogleConnectionRow[] } {
  const rows = [...seed];

  return {
    rows,
    async findActiveByUser(userId) {
      return (
        rows.find((row) => row.user_id === userId && row.status === "active") ??
        null
      );
    },
    async findLatestByUser(userId) {
      const matches = rows
        .filter((row) => row.user_id === userId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return matches[0] ?? null;
    },
    async findById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async insert(input) {
      const row: GoogleConnectionRow = {
        id: input.id ?? nextId("connection"),
        user_id: input.user_id,
        google_account_email: input.google_account_email,
        encrypted_refresh_token: input.encrypted_refresh_token,
        token_key_version: input.token_key_version ?? 1,
        scope: input.scope ?? [],
        root_folder_id: input.root_folder_id ?? null,
        status: input.status ?? "active",
        last_verified_at: input.last_verified_at ?? null,
        created_at: input.created_at ?? new Date().toISOString(),
        updated_at: input.updated_at ?? new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },
    async update(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
  };
}

export function createFakeAuditLogRepository(): AuditLogRepository & {
  entries: AuditLogInsert[];
} {
  const entries: AuditLogInsert[] = [];
  return {
    entries,
    async record(entry) {
      entries.push(entry);
    },
  };
}

export function createFakePhotosRepository(
  seed: PhotoRow[] = [],
): PhotosRepository & { rows: PhotoRow[] } {
  const rows = [...seed];

  return {
    rows,
    async insert(input) {
      const row: PhotoRow = {
        id: input.id ?? nextId("photo"),
        album_id: input.album_id,
        uploaded_by: input.uploaded_by ?? null,
        drive_file_id: input.drive_file_id,
        drive_folder_id: input.drive_folder_id,
        preview_path: input.preview_path ?? null,
        original_filename: input.original_filename,
        safe_filename: input.safe_filename,
        mime_type: input.mime_type,
        file_size: input.file_size,
        width: input.width ?? null,
        height: input.height ?? null,
        sha256: input.sha256 ?? null,
        blurhash: input.blurhash ?? null,
        captured_at: input.captured_at ?? null,
        uploaded_at: input.uploaded_at ?? new Date().toISOString(),
        status: input.status ?? "queued",
        moderation_note: input.moderation_note ?? null,
        is_featured: input.is_featured ?? false,
        sort_order: input.sort_order ?? Date.now(),
        error_code: input.error_code ?? null,
        error_message: input.error_message ?? null,
        deleted_at: input.deleted_at ?? null,
      };
      rows.push(row);
      return row;
    },
    async findByAlbumAndSha256(albumId, sha256) {
      return (
        rows.find(
          (row) =>
            row.album_id === albumId &&
            row.sha256 === sha256 &&
            row.deleted_at === null,
        ) ?? null
      );
    },
    async findById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async listVisibleForAlbum({
      albumId,
      canModerate,
      limit,
      beforeSortOrder,
    }: ListVisiblePhotosInput) {
      const visibleStatuses = canModerate
        ? new Set(["ready", "pending_review"])
        : new Set(["ready"]);

      return rows
        .filter(
          (row) =>
            row.album_id === albumId &&
            row.deleted_at === null &&
            visibleStatuses.has(row.status) &&
            (beforeSortOrder === undefined ||
              row.sort_order < beforeSortOrder),
        )
        .sort((a, b) => b.sort_order - a.sort_order)
        .slice(0, limit);
    },
  };
}

export function createFakeUploadJobsRepository(
  seed: UploadJobRow[] = [],
): UploadJobsRepository & { rows: UploadJobRow[] } {
  const rows = [...seed];

  return {
    rows,
    async insert(input) {
      const row: UploadJobRow = {
        id: input.id ?? nextId("upload-job"),
        album_id: input.album_id,
        user_id: input.user_id,
        client_upload_id: input.client_upload_id,
        filename: input.filename,
        expected_size: input.expected_size,
        received_size: input.received_size ?? 0,
        status: input.status ?? "pending",
        drive_session_uri_encrypted: input.drive_session_uri_encrypted ?? null,
        expires_at: input.expires_at,
        created_at: input.created_at ?? new Date().toISOString(),
        updated_at: input.updated_at ?? new Date().toISOString(),
      };
      rows.push(row);
      return row;
    },
    async findById(id) {
      return rows.find((row) => row.id === id) ?? null;
    },
    async update(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    },
  };
}

export function makePhotoRow(overrides: Partial<PhotoRow> = {}): PhotoRow {
  const now = new Date().toISOString();
  return {
    id: nextId("photo"),
    album_id: "album-1",
    uploaded_by: null,
    drive_file_id: nextId("drive-file"),
    drive_folder_id: "drive-folder-1",
    preview_path: "albums/album-1/photo-1/preview.webp",
    original_filename: "foto.jpg",
    safe_filename: "safe.jpg",
    mime_type: "image/jpeg",
    file_size: 12345,
    width: 800,
    height: 600,
    sha256: "a".repeat(64),
    blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4",
    captured_at: null,
    uploaded_at: now,
    status: "ready",
    moderation_note: null,
    is_featured: false,
    sort_order: Date.now(),
    error_code: null,
    error_message: null,
    deleted_at: null,
    ...overrides,
  };
}

export function makeUploadJobRow(
  overrides: Partial<UploadJobRow> = {},
): UploadJobRow {
  const now = new Date().toISOString();
  return {
    id: nextId("upload-job"),
    album_id: "album-1",
    user_id: "user-1",
    client_upload_id: nextId("client-upload"),
    filename: "foto.jpg",
    expected_size: 12345,
    received_size: 0,
    status: "pending",
    drive_session_uri_encrypted: null,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeGoogleConnectionRow(
  overrides: Partial<GoogleConnectionRow> = {},
): GoogleConnectionRow {
  const now = new Date().toISOString();
  return {
    id: nextId("connection"),
    user_id: "owner-1",
    google_account_email: "owner@example.com",
    encrypted_refresh_token: "iv:tag:ciphertext",
    token_key_version: 1,
    scope: ["https://www.googleapis.com/auth/drive.file"],
    root_folder_id: "root-folder-1",
    status: "active",
    last_verified_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

export function makeAlbumRow(overrides: Partial<AlbumRow> = {}): AlbumRow {
  const now = new Date().toISOString();
  return {
    id: nextId("album"),
    owner_id: "owner-1",
    google_connection_id: "conn-1",
    title: "Álbum de teste",
    description: null,
    slug: "album-de-teste",
    cover_photo_id: null,
    drive_folder_id: "drive-folder-1",
    visibility: "unlisted",
    upload_enabled: true,
    moderation_enabled: false,
    download_enabled: true,
    event_start_at: null,
    event_end_at: null,
    status: "published",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
