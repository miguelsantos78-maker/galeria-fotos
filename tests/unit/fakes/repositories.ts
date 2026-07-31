import type { AlbumsRepository } from "@/server/repositories/albums-repository";
import type { ShareLinksRepository } from "@/server/repositories/share-links-repository";
import type { AlbumSessionsRepository } from "@/server/repositories/album-sessions-repository";
import type { AuditLogRepository } from "@/server/repositories/audit-log-repository";
import type { GoogleConnectionsRepository } from "@/server/repositories/google-connections-repository";
import type { Database } from "@/lib/db/database.types";

type AlbumRow = Database["public"]["Tables"]["albums"]["Row"];
type ShareLinkRow = Database["public"]["Tables"]["album_share_links"]["Row"];
type AlbumSessionRow = Database["public"]["Tables"]["album_sessions"]["Row"];
type GoogleConnectionRow =
  Database["public"]["Tables"]["google_connections"]["Row"];
type AuditLogInsert = Database["public"]["Tables"]["audit_logs"]["Insert"];

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
  };
}

export function createFakeGoogleConnectionsRepository(
  seed: GoogleConnectionRow[] = [],
): GoogleConnectionsRepository {
  return {
    async findActiveByUser(userId) {
      return (
        seed.find((row) => row.user_id === userId && row.status === "active") ??
        null
      );
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
