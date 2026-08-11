import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";

/**
 * Saúde da aplicação (secção 18). Só booleanos de "está configurado?" —
 * nunca valores, prefixos ou comprimentos de segredos, que é o que
 * torna um endpoint destes seguro para ficar aberto.
 *
 * Os dois sinalizadores existem porque ambos falham em silêncio: sem
 * `CRON_SECRET` a manutenção diária não corre, e sem Upstash o rate
 * limiting desliga-se sem dar nas vistas. Antes disto, a única forma de
 * os confirmar era ler o painel da Vercel a partir de memória.
 */
export function GET() {
  const env = getServerEnv();

  return NextResponse.json({
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
      rateLimiting: Boolean(
        env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN,
      ),
      scheduledMaintenance: Boolean(env.CRON_SECRET),
    },
    error: null,
  });
}
