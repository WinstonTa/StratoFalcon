import type { Metadata } from "next";

import { OrbisDemo } from "@/components/orbis-demo";

export const metadata: Metadata = {
  title: "Orbis starter · StratoFalcon",
};

// The original Orbis starter UI, kept as a debugging fallback at /starter.
// Every starter style is scoped under `.starter` in app/styles.css.
export default function StarterPage() {
  return (
    <main className="starter">
      <header>
        <h1>Orbis starter</h1>
        <p>
          Connect, generate a continuous live video, then steer it by changing
          the prompt while it runs.
        </p>
      </header>
      <OrbisDemo />
    </main>
  );
}
