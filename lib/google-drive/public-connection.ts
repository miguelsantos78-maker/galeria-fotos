import type { Database } from "@/lib/db/database.types";

type GoogleConnectionRow =
  Database["public"]["Tables"]["google_connections"]["Row"];

export interface PublicGoogleConnection {
  id: string;
  googleAccountEmail: string;
  status: GoogleConnectionRow["status"];
  rootFolderId: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
}

/**
 * Nunca devolver `encrypted_refresh_token` nem `token_key_version` ao
 * browser (secção 5.4/15) — mesmo encriptado, o cliente não precisa
 * deste campo para nada.
 */
export function toPublicGoogleConnection(
  row: GoogleConnectionRow,
): PublicGoogleConnection {
  return {
    id: row.id,
    googleAccountEmail: row.google_account_email,
    status: row.status,
    rootFolderId: row.root_folder_id,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
  };
}
