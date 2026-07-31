// Substitui "server-only" nos testes: o Next.js torna esse pacote um
// no-op em bundles de servidor através do bundler; o Vitest não tem
// essa magia, por isso fazemos o mesmo aqui explicitamente.
export {};
