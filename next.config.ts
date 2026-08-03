import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" só é necessário para a imagem Docker (Cloud Run) — a
  // Vercel gera o seu próprio output otimizado e define VERCEL=1 em
  // build, por isso fica sem efeito lá.
  output: process.env.VERCEL ? undefined : "standalone",
  // Impede o Next.js de tentar empacotar o "sharp" — o seu binário
  // nativo (libvips) não sobrevive ao bundling e falha em runtime com
  // ERR_DLOPEN_FAILED. Recomendação oficial do próprio sharp para
  // Next.js: https://sharp.pixelplumbing.com/install#nextjs
  serverExternalPackages: ["sharp"],
  // Só desativar o bundling (acima) não chega: o rastreio automático de
  // ficheiros da Vercel não segue o dlopen() do binário nativo do
  // sharp/libvips, por isso o .so fica de fora da função serverless
  // implantada mesmo estando presente no node_modules da build. Incluir
  // explicitamente resolve o ERR_DLOPEN_FAILED em runtime.
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/sharp/**/*",
      "./node_modules/@img/**/*",
      "./node_modules/.pnpm/sharp@*/**/*",
      "./node_modules/.pnpm/@img+*/**/*",
    ],
  },
};

export default nextConfig;
