import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" só é necessário para a imagem Docker (Cloud Run) — a
  // Vercel gera o seu próprio output otimizado e define VERCEL=1 em
  // build, por isso fica sem efeito lá.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
