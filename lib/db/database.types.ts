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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          role: ProfileRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          role?: ProfileRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      google_connections: {
        Row: {
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
        };
        Insert: {
          id?: string;
          user_id: string;
          google_account_email: string;
          encrypted_refresh_token: string;
          token_key_version?: number;
          scope?: string[];
          root_folder_id?: string | null;
          status?: GoogleConnectionStatus;
          last_verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["google_connections"]["Insert"]
        >;
      };
      albums: {
        Row: {
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
        };
        Insert: {
          id?: string;
          owner_id: string;
          google_connection_id: string;
          title: string;
          description?: string | null;
          slug: string;
          cover_photo_id?: string | null;
          drive_folder_id: string;
          visibility?: AlbumVisibility;
          upload_enabled?: boolean;
          moderation_enabled?: boolean;
          download_enabled?: boolean;
          event_start_at?: string | null;
          event_end_at?: string | null;
          status?: AlbumStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["albums"]["Insert"]>;
      };
      album_share_links: {
        Row: {
          id: string;
          album_id: string;
          token_hash: string;
          pin_hash: string | null;
          permissions: AlbumSessionPermission[];
          expires_at: string | null;
          revoked_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          album_id: string;
          token_hash: string;
          pin_hash?: string | null;
          permissions?: AlbumSessionPermission[];
          expires_at?: string | null;
          revoked_at?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["album_share_links"]["Insert"]
        >;
      };
      album_sessions: {
        Row: {
          id: string;
          album_id: string;
          user_id: string;
          share_link_id: string | null;
          permissions: AlbumSessionPermission[];
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          album_id: string;
          user_id: string;
          share_link_id?: string | null;
          permissions?: AlbumSessionPermission[];
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["album_sessions"]["Insert"]
        >;
      };
      photos: {
        Row: {
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
        };
        Insert: {
          id?: string;
          album_id: string;
          uploaded_by?: string | null;
          drive_file_id: string;
          drive_folder_id: string;
          preview_path?: string | null;
          original_filename: string;
          safe_filename: string;
          mime_type: string;
          file_size: number;
          width?: number | null;
          height?: number | null;
          sha256?: string | null;
          blurhash?: string | null;
          captured_at?: string | null;
          uploaded_at?: string;
          status?: PhotoStatus;
          moderation_note?: string | null;
          is_featured?: boolean;
          sort_order?: number;
          error_code?: string | null;
          error_message?: string | null;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["photos"]["Insert"]>;
      };
      upload_jobs: {
        Row: {
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
        };
        Insert: {
          id?: string;
          album_id: string;
          user_id: string;
          client_upload_id: string;
          filename: string;
          expected_size: number;
          received_size?: number;
          status?: UploadJobStatus;
          drive_session_uri_encrypted?: string | null;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["upload_jobs"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: number;
          actor_user_id: string | null;
          album_id: string | null;
          photo_id: string | null;
          action: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: number;
          actor_user_id?: string | null;
          album_id?: string | null;
          photo_id?: string | null;
          action: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
      };
    };
  };
}
