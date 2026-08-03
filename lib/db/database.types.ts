/**
 * Tipos gerados manualmente a partir de supabase/migrations/*.sql.
 *
 * Quando existir um projeto Supabase real ligado, substituir por:
 *   pnpm dlx supabase gen types typescript --local > lib/db/database.types.ts
 */

export type ProfileRole = "admin" | "editor";
export type GoogleConnectionStatus = "active" | "revoked" | "error";
export type AlbumVisibility = "private" | "unlisted" | "public";
export type AlbumStatus = "draft" | "published" | "archived";
export type AlbumSessionPermission = "view" | "upload" | "moderate";
export type PhotoStatus =
  | "queued"
  | "uploading"
  | "processing"
  | "pending_review"
  | "ready"
  | "hidden"
  | "failed"
  | "deleted";
export type UploadJobStatus =
  "pending" | "uploading" | "completed" | "failed" | "expired";

interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: ProfileRole;
  created_at: string;
  updated_at: string;
}

interface GoogleConnectionRow {
  id: string;
  user_id: string;
  google_account_email: string;
  encrypted_refresh_token: string;
  token_key_version: number;
  scope: string[];
  root_folder_id: string | null;
  status: GoogleConnectionStatus;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AlbumRow {
  id: string;
  owner_id: string;
  google_connection_id: string;
  title: string;
  description: string | null;
  slug: string;
  cover_photo_id: string | null;
  drive_folder_id: string;
  visibility: AlbumVisibility;
  upload_enabled: boolean;
  moderation_enabled: boolean;
  download_enabled: boolean;
  event_start_at: string | null;
  event_end_at: string | null;
  status: AlbumStatus;
  created_at: string;
  updated_at: string;
}

interface AlbumShareLinkRow {
  id: string;
  album_id: string;
  token_hash: string;
  pin_hash: string | null;
  encrypted_token: string | null;
  token_key_version: number | null;
  permissions: AlbumSessionPermission[];
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

interface AlbumSessionRow {
  id: string;
  album_id: string;
  user_id: string;
  share_link_id: string | null;
  permissions: AlbumSessionPermission[];
  expires_at: string;
  created_at: string;
}

interface PhotoRow {
  id: string;
  album_id: string;
  uploaded_by: string | null;
  drive_file_id: string;
  drive_folder_id: string;
  preview_path: string | null;
  original_filename: string;
  safe_filename: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  blurhash: string | null;
  captured_at: string | null;
  uploaded_at: string;
  status: PhotoStatus;
  moderation_note: string | null;
  is_featured: boolean;
  sort_order: number;
  error_code: string | null;
  error_message: string | null;
  deleted_at: string | null;
}

interface UploadJobRow {
  id: string;
  album_id: string;
  user_id: string;
  client_upload_id: string;
  filename: string;
  expected_size: number;
  received_size: number;
  status: UploadJobStatus;
  drive_session_uri_encrypted: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface AuditLogRow {
  id: number;
  actor_user_id: string | null;
  album_id: string | null;
  photo_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<
          ProfileRow,
          "display_name" | "avatar_url" | "role" | "created_at" | "updated_at"
        > &
          Partial<
            Pick<
              ProfileRow,
              | "display_name"
              | "avatar_url"
              | "role"
              | "created_at"
              | "updated_at"
            >
          >;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      google_connections: {
        Row: GoogleConnectionRow;
        Insert: Omit<
          GoogleConnectionRow,
          | "id"
          | "token_key_version"
          | "scope"
          | "root_folder_id"
          | "status"
          | "last_verified_at"
          | "created_at"
          | "updated_at"
        > &
          Partial<
            Pick<
              GoogleConnectionRow,
              | "id"
              | "token_key_version"
              | "scope"
              | "root_folder_id"
              | "status"
              | "last_verified_at"
              | "created_at"
              | "updated_at"
            >
          >;
        Update: Partial<GoogleConnectionRow>;
        Relationships: [];
      };
      albums: {
        Row: AlbumRow;
        Insert: Omit<
          AlbumRow,
          | "id"
          | "description"
          | "cover_photo_id"
          | "visibility"
          | "upload_enabled"
          | "moderation_enabled"
          | "download_enabled"
          | "event_start_at"
          | "event_end_at"
          | "status"
          | "created_at"
          | "updated_at"
        > &
          Partial<
            Pick<
              AlbumRow,
              | "id"
              | "description"
              | "cover_photo_id"
              | "visibility"
              | "upload_enabled"
              | "moderation_enabled"
              | "download_enabled"
              | "event_start_at"
              | "event_end_at"
              | "status"
              | "created_at"
              | "updated_at"
            >
          >;
        Update: Partial<AlbumRow>;
        Relationships: [];
      };
      album_share_links: {
        Row: AlbumShareLinkRow;
        Insert: Omit<
          AlbumShareLinkRow,
          | "id"
          | "pin_hash"
          | "encrypted_token"
          | "token_key_version"
          | "permissions"
          | "expires_at"
          | "revoked_at"
          | "created_at"
        > &
          Partial<
            Pick<
              AlbumShareLinkRow,
              | "id"
              | "pin_hash"
              | "encrypted_token"
              | "token_key_version"
              | "permissions"
              | "expires_at"
              | "revoked_at"
              | "created_at"
            >
          >;
        Update: Partial<AlbumShareLinkRow>;
        Relationships: [];
      };
      album_sessions: {
        Row: AlbumSessionRow;
        Insert: Omit<
          AlbumSessionRow,
          "id" | "share_link_id" | "permissions" | "created_at"
        > &
          Partial<
            Pick<
              AlbumSessionRow,
              "id" | "share_link_id" | "permissions" | "created_at"
            >
          >;
        Update: Partial<AlbumSessionRow>;
        Relationships: [];
      };
      photos: {
        Row: PhotoRow;
        Insert: Omit<
          PhotoRow,
          | "id"
          | "uploaded_by"
          | "preview_path"
          | "width"
          | "height"
          | "sha256"
          | "blurhash"
          | "captured_at"
          | "uploaded_at"
          | "status"
          | "moderation_note"
          | "is_featured"
          | "sort_order"
          | "error_code"
          | "error_message"
          | "deleted_at"
        > &
          Partial<
            Pick<
              PhotoRow,
              | "id"
              | "uploaded_by"
              | "preview_path"
              | "width"
              | "height"
              | "sha256"
              | "blurhash"
              | "captured_at"
              | "uploaded_at"
              | "status"
              | "moderation_note"
              | "is_featured"
              | "sort_order"
              | "error_code"
              | "error_message"
              | "deleted_at"
            >
          >;
        Update: Partial<PhotoRow>;
        Relationships: [];
      };
      upload_jobs: {
        Row: UploadJobRow;
        Insert: Omit<
          UploadJobRow,
          | "id"
          | "received_size"
          | "status"
          | "drive_session_uri_encrypted"
          | "created_at"
          | "updated_at"
        > &
          Partial<
            Pick<
              UploadJobRow,
              | "id"
              | "received_size"
              | "status"
              | "drive_session_uri_encrypted"
              | "created_at"
              | "updated_at"
            >
          >;
        Update: Partial<UploadJobRow>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: Omit<
          AuditLogRow,
          | "id"
          | "actor_user_id"
          | "album_id"
          | "photo_id"
          | "metadata"
          | "created_at"
        > &
          Partial<
            Pick<
              AuditLogRow,
              | "id"
              | "actor_user_id"
              | "album_id"
              | "photo_id"
              | "metadata"
              | "created_at"
            >
          >;
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
