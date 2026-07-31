import { NextResponse } from "next/server";

export interface ApiSuccessBody<T> {
  data: T;
  error: null;
}

export interface ApiErrorBody {
  data: null;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

/**
 * Erro de domínio esperado (validação, autorização, conflito, etc.).
 * Route Handlers apanham-no e convertem-no na resposta de erro padrão
 * (secção 14 do CLAUDE.md); erros não esperados tornam-se 500.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function jsonOk<T>(
  data: T,
  init?: ResponseInit,
): NextResponse<ApiSuccessBody<T>> {
  return NextResponse.json({ data, error: null }, init);
}

export function jsonError(
  error: unknown,
  requestId: string,
): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        data: null,
        error: { code: error.code, message: error.message, requestId },
      },
      { status: error.status },
    );
  }

  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      message: "unhandled_error",
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  return NextResponse.json(
    {
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "Ocorreu um erro inesperado.",
        requestId,
      },
    },
    { status: 500 },
  );
}
