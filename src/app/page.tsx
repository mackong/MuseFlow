export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">MuseFlow</h1>
      <p className="text-sm text-muted-foreground">
        Turn raw ideas into interactive content flows.
      </p>
      <p className="text-xs text-muted-foreground">
        MVP under construction — see <code>specs/001-mvp-content-loop/</code>.
      </p>
    </main>
  );
}
