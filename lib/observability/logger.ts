import "server-only";

interface LogFields {
  requestId?: string;
  userId?: string;
  albumId?: string;
  photoId?: string;
  operation: string;
  durationMs?: number;
  [key: string]: unknown;
}

/**
 * Logger estruturado mínimo (secção 18). Nunca passar tokens, cookies,
 * binários ou dados pessoais desnecessários em `fields`.
 */
function write(level: "info" | "warn" | "error", fields: LogFields): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    ...fields,
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (fields: LogFields) => write("info", fields),
  warn: (fields: LogFields) => write("warn", fields),
  error: (fields: LogFields) => write("error", fields),
};
