export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-28 text-center">
      <span className="bg-brand-50 text-brand-700 rounded-full px-4 py-1 text-sm font-medium">
        Em construção
      </span>
      <h1 className="text-foreground font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
        LiveGallery
      </h1>
      <p className="text-foreground/70 max-w-xl text-lg">
        Crie álbuns de fotografias para os seus eventos e veja as fotografias
        enviadas pelos convidados aparecerem em tempo real.
      </p>
    </main>
  );
}
