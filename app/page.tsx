import Link from "next/link";

// Placeholder while the destination gallery is built (Phase 1, item 3).
export default function Home() {
  return (
    <main className="starter">
      <header>
        <h1>StratoFalcon</h1>
        <p>
          The destination gallery is being built. The original Orbis starter is
          at <Link href="/starter">/starter</Link>.
        </p>
      </header>
    </main>
  );
}
