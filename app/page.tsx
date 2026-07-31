export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <span className="rounded-full bg-brand-50 px-4 py-1 text-sm font-medium text-brand-700">
        Em construção
      </span>
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        LiveGallery
      </h1>
      <p className="max-w-xl text-lg text-foreground/70">
        Crie álbuns de fotografias para os seus eventos e veja as
        fotografias enviadas pelos convidados aparecerem em tempo real.
      </p>
    </main>
  );
}
