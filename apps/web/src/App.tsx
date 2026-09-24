import { ServerStatus } from './components/ServerStatus';

export function App() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-xl">
        <h1 className="text-3xl font-extrabold">Magic Potion Challenge</h1>
        <p className="mt-2 text-ink-muted">Setup check</p>
        <div className="mt-8">
          <ServerStatus />
        </div>
      </div>
    </main>
  );
}
