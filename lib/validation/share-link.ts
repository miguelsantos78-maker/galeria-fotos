import { z } from "zod";

export const shareLinkPermissionSchema = z.enum(["view", "upload", "moderate"]);

export const createShareLinkSchema = z.object({
  permissions: z
    .array(shareLinkPermissionSchema)
    .min(1, "Escolha pelo menos uma permissão.")
    .default(["view"]),
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "O PIN deve ter entre 4 e 8 dígitos.")
    .optional(),
  expiresAt: z.iso.datetime().optional(),
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;

export const resolveAlbumSchema = z.object({
  token: z.string().trim().min(1, "Token em falta."),
  pin: z.string().trim().max(8).optional(),
});

export type ResolveAlbumInput = z.infer<typeof resolveAlbumSchema>;
