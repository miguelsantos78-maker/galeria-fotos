"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { shareLinkPermissionSchema } from "@/lib/validation/share-link";
import type { PublicShareLink } from "@/server/use-cases/share-links";

const PERMISSION_LABELS: Record<string, string> = {
  view: "Ver",
  upload: "Enviar fotografias",
  moderate: "Moderar",
};

/**
 * Schema próprio do formulário (não o mesmo que a API): campos de texto
 * HTML dão sempre string, nunca `undefined`, por isso "sem PIN" é uma
 * string vazia aqui, não um campo em falta.
 */
const shareLinkFormSchema = z.object({
  permissions: z
    .array(shareLinkPermissionSchema)
    .min(1, "Escolha pelo menos uma permissão."),
  pin: z
    .string()
    .trim()
    .regex(/^(\d{4,8})?$/, "O PIN deve ter entre 4 e 8 dígitos.")
    .default(""),
  expiresAt: z.string().default(""),
});

type CreateShareLinkFormValues = z.input<typeof shareLinkFormSchema>;

export function ShareLinksManager({ albumId }: { albumId: string }) {
  const queryClient = useQueryClient();
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const linksQuery = useQuery({
    queryKey: ["albums", albumId, "share-links"],
    queryFn: () =>
      apiFetch<PublicShareLink[]>(`/api/albums/${albumId}/share-links`),
  });

  const form = useForm<CreateShareLinkFormValues>({
    resolver: zodResolver(shareLinkFormSchema),
    defaultValues: { permissions: ["view"], pin: "", expiresAt: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateShareLinkFormValues) =>
      apiFetch<{ link: PublicShareLink; token: string }>(
        `/api/albums/${albumId}/share-links`,
        {
          method: "POST",
          body: JSON.stringify({
            permissions: values.permissions,
            ...(values.pin ? { pin: values.pin } : {}),
            ...(values.expiresAt
              ? { expiresAt: new Date(values.expiresAt).toISOString() }
              : {}),
          }),
        },
      ),
    onSuccess: ({ token }) => {
      setCreatedToken(token);
      form.reset({ permissions: ["view"], pin: "", expiresAt: "" });
      queryClient.invalidateQueries({
        queryKey: ["albums", albumId, "share-links"],
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (linkId: string) =>
      apiFetch(`/api/albums/${albumId}/share-links/${linkId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["albums", albumId, "share-links"],
      });
    },
  });

  const guestUrl = createdToken
    ? `${window.location.origin}/a/${createdToken}`
    : null;

  return (
    <section className="rounded-card border-border bg-surface flex flex-col gap-4 border p-6">
      <h2 className="text-foreground text-lg font-medium">Links de partilha</h2>

      {guestUrl && (
        <div className="rounded-card border-success/30 bg-success/10 flex flex-col gap-2 border p-4 text-sm">
          <p className="text-foreground font-medium">
            Link criado — copie agora, não voltará a ser mostrado.
          </p>
          <code className="bg-surface-muted text-foreground rounded px-2 py-1 break-all">
            {guestUrl}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(guestUrl)}
            className="border-border text-foreground hover:bg-surface-muted self-start rounded-full border px-4 py-1.5 text-sm font-medium"
          >
            Copiar link
          </button>
        </div>
      )}

      <form
        onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        className="border-border flex flex-col gap-3 border-t pt-4"
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="text-foreground text-sm font-medium">
            Permissões
          </legend>
          {Object.entries(PERMISSION_LABELS).map(([value, label]) => (
            <label
              key={value}
              className="text-foreground flex items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                value={value}
                {...form.register("permissions")}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="pin" className="text-foreground text-sm font-medium">
            PIN (opcional, 4–8 dígitos)
          </label>
          <input
            id="pin"
            type="text"
            inputMode="numeric"
            className="border-border bg-background w-32 rounded-md border px-3 py-2 text-sm"
            {...form.register("pin")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="expiresAt"
            className="text-foreground text-sm font-medium"
          >
            Expira em (opcional)
          </label>
          <input
            id="expiresAt"
            type="datetime-local"
            className="border-border bg-background rounded-md border px-3 py-2 text-sm"
            {...form.register("expiresAt")}
          />
        </div>

        {createMutation.isError && (
          <p role="alert" className="text-danger text-sm">
            {createMutation.error instanceof ApiRequestError
              ? createMutation.error.message
              : "Não foi possível criar o link."}
          </p>
        )}

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="bg-brand-600 hover:bg-brand-700 self-start rounded-full px-5 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createMutation.isPending ? "A criar…" : "Criar link"}
        </button>
      </form>

      <ul className="border-border flex flex-col gap-2 border-t pt-4">
        {linksQuery.data?.length === 0 && (
          <li className="text-foreground/60 text-sm">Ainda não há links.</li>
        )}
        {linksQuery.data?.map((link) => {
          const isRevoked = Boolean(link.revoked_at);
          const isExpired = Boolean(
            link.expires_at && new Date(link.expires_at) <= new Date(),
          );

          return (
            <li
              key={link.id}
              className="rounded-card border-border flex items-center justify-between border px-4 py-3"
            >
              <div className="text-sm">
                <p className="text-foreground">
                  {link.permissions.map((p) => PERMISSION_LABELS[p]).join(", ")}
                  {link.hasPin && " · com PIN"}
                </p>
                <p className="text-foreground/60">
                  {isRevoked
                    ? "Revogado"
                    : isExpired
                      ? "Expirado"
                      : link.expires_at
                        ? `Expira em ${new Date(link.expires_at).toLocaleString("pt-PT")}`
                        : "Sem expiração"}
                </p>
              </div>
              {!isRevoked && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Revogar este link? Deixa de dar acesso imediatamente.",
                      )
                    )
                      revokeMutation.mutate(link.id);
                  }}
                  className="border-border text-foreground hover:bg-surface-muted rounded-full border px-4 py-1.5 text-sm font-medium"
                >
                  Revogar
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
