"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { PublicGoogleConnection } from "@/lib/google-drive/public-connection";

const STATUS_LABELS: Record<PublicGoogleConnection["status"], string> = {
  active: "Ativa",
  revoked: "Desligada",
  error: "Com erro — é necessário reconectar",
};

export function GoogleDriveIntegration({
  notice,
}: {
  notice?: "connected" | "error";
}) {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ["google-drive", "status"],
    queryFn: () =>
      apiFetch<PublicGoogleConnection | null>("/api/google-drive/status"),
  });

  const verifyMutation = useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch<PublicGoogleConnection>("/api/google-drive/verify", {
        method: "POST",
        body: JSON.stringify({ connectionId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-drive", "status"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: (connectionId: string) =>
      apiFetch("/api/google-drive/disconnect", {
        method: "POST",
        body: JSON.stringify({ connectionId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-drive", "status"] });
    },
  });

  const connection = statusQuery.data ?? null;
  const isConnected = connection?.status === "active";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-14">
      <header>
        <h1 className="text-foreground font-serif text-2xl font-semibold sm:text-3xl">
          Integração com o Google Drive
        </h1>
        <p className="text-foreground/70 mt-1 text-sm">
          Os originais das fotografias são guardados numa pasta própria da
          aplicação na sua conta Google Drive.
        </p>
      </header>

      {notice === "connected" && (
        <div className="rounded-card border-success/30 bg-success/10 text-foreground border px-4 py-3 text-sm">
          Ligação ao Google Drive concluída com sucesso.
        </div>
      )}
      {notice === "error" && (
        <div className="rounded-card border-danger/30 bg-danger/10 text-foreground border px-4 py-3 text-sm">
          Não foi possível concluir a ligação ao Google Drive. Tente novamente.
        </div>
      )}

      <section className="rounded-card border-border bg-surface flex flex-col gap-4 border p-6">
        {statusQuery.isLoading && (
          <p className="text-foreground/60 text-sm">A verificar a ligação…</p>
        )}

        {statusQuery.isError && (
          <p role="alert" className="text-danger text-sm">
            Não foi possível obter o estado da ligação.
          </p>
        )}

        {!statusQuery.isLoading && !connection && (
          <>
            <p className="text-foreground/70 text-sm">
              Ainda não ligou nenhuma conta Google Drive. É necessário ligar uma
              conta antes de poder criar álbuns.
            </p>
            <a
              href="/api/google-drive/connect"
              className="bg-brand-600 hover:bg-brand-700 inline-flex w-fit items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white transition-colors"
            >
              Ligar Google Drive
            </a>
          </>
        )}

        {connection && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground font-medium">
                  {connection.googleAccountEmail}
                </p>
                <p className="text-foreground/60 text-sm">
                  Estado: {STATUS_LABELS[connection.status]}
                </p>
                {connection.lastVerifiedAt && (
                  <p className="text-foreground/70 text-xs">
                    Última verificação:{" "}
                    {new Date(connection.lastVerifiedAt).toLocaleString(
                      "pt-PT",
                    )}
                  </p>
                )}
              </div>
              <span
                className={
                  isConnected
                    ? "bg-success/15 text-success rounded-full px-3 py-1 text-xs font-medium"
                    : "bg-danger/15 text-danger rounded-full px-3 py-1 text-xs font-medium"
                }
              >
                {isConnected ? "Ligado" : "Desligado"}
              </span>
            </div>

            {(verifyMutation.isError || disconnectMutation.isError) && (
              <p role="alert" className="text-danger text-sm">
                {verifyMutation.error instanceof ApiRequestError
                  ? verifyMutation.error.message
                  : disconnectMutation.error instanceof ApiRequestError
                    ? disconnectMutation.error.message
                    : "Não foi possível concluir a operação."}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => verifyMutation.mutate(connection.id)}
                disabled={verifyMutation.isPending}
                className="border-border text-foreground hover:bg-surface-muted rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifyMutation.isPending
                  ? "A verificar…"
                  : "Verificar ligação"}
              </button>

              <a
                href="/api/google-drive/connect?reconnect=true"
                className="border-border text-foreground hover:bg-surface-muted inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition-colors"
              >
                Reconectar
              </a>

              {isConnected && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Desligar a conta Google Drive? Deixa de ser possível criar novos álbuns ou enviar fotografias até reconectar.",
                      )
                    )
                      disconnectMutation.mutate(connection.id);
                  }}
                  disabled={disconnectMutation.isPending}
                  className="text-danger hover:bg-danger/10 rounded-full border border-transparent px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {disconnectMutation.isPending ? "A desligar…" : "Desligar"}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
