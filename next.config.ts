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
  // ".npmrc" com "node-linker=hoisted" (ver
  // docs/decisions/0012-sharp-node-linker-hoisted.md) mudou o
  // node_modules do pnpm de simbólico para uma estrutura achatada
  // tipo npm clássico — com isso, o rastreio automático da Vercel já
  // inclui sozinho quase tudo o que o sharp precisa (o binário nativo
  // .node, os wrappers JS), exceto este único ficheiro (confirmado por
  // inspeção do .nft.json gerado localmente: era o único a faltar).
  // Uma tentativa anterior de incluir a árvore toda de ficheiros do
  // sharp (com o node_modules ainda simbólico) suspeita-se ter
  // quebrado o deployment na Vercel — esta versão é deliberadamente o
  // mínimo possível para reduzir esse risco.
  outputFileTracingIncludes: {
    "/api/albums/*/uploads/*/complete": [
      "./node_modules/sharp/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.*",
    ],
  },
};

export default nextConfig;
