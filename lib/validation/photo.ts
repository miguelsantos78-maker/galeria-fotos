import { z } from "zod";

/**
 * Só os estados que um administrador pode atribuir diretamente (secção
 * 10.4: aprovar, ocultar/republicar). `queued`/`uploading`/`processing`/
 * `failed`/`deleted` nunca são atribuíveis por aqui — são geridos pelo
 * fluxo de upload ou pelo endpoint de eliminação.
 */
export const moderationStatusSchema = z.enum(["ready", "hidden"]);

export const updatePhotoSchema = z
  .object({
    status: moderationStatusSchema.optional(),
    isFeatured: z.boolean().optional(),
    setAsCover: z.boolean().optional(),
    moderationNote: z.string().trim().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Nada para atualizar.",
  });

export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;

export const batchModerationActionSchema = z.enum([
  "approve",
  "hide",
  "delete",
]);

export const batchModerateSchema = z.object({
  photoIds: z.array(z.uuid()).min(1).max(200),
  action: batchModerationActionSchema,
});

export type BatchModerateInput = z.infer<typeof batchModerateSchema>;

export const photoSortFieldSchema = z.enum(["uploaded_at", "captured_at"]);
