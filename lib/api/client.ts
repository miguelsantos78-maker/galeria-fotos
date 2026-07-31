export class ApiRequestError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly status: number;

  constructor(
    code: string,
    message: string,
    requestId: string,
    status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string; requestId: string } | null;
}

/** Chama a API interna e devolve `data`, lançando ApiRequestError em caso de erro. */
export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || body.error) {
    throw new ApiRequestError(
      body.error?.code ?? "UNKNOWN_ERROR",
      body.error?.message ?? "Ocorreu um erro inesperado.",
      body.error?.requestId ?? "",
      response.status,
    );
  }

  return body.data as T;
}
