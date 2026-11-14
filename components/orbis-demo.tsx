"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";

import { NanoBananaExample } from "@/components/nano-banana-example";
import { OrbisControls } from "@/components/orbis-controls";
import { OrbisPlayer } from "@/components/orbis-player";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { useReactorJwt } from "@/hooks/use-reactor-jwt";
import { ORBIS_MODEL_NAME, ORBIS_TRACKS } from "@/lib/orbis";

export function OrbisDemo() {
  const { getJwt, getCurrentJwt, clearJwt } = useReactorJwt();

  return (
    <section className="demo-shell">
      <ReactorProvider
        apiUrl="https://api.reactor.inc"
        modelName={ORBIS_MODEL_NAME}
        modelTracks={[...ORBIS_TRACKS]}
        connectOptions={{ autoConnect: false }}
        jwtToken={getJwt}
      >
        <OrbisSession
          clearJwt={clearJwt}
          getCurrentJwt={getCurrentJwt}
        />
      </ReactorProvider>
    </section>
  );
}

function OrbisSession({
  clearJwt,
  getCurrentJwt,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt);

  return (
    <>
      <div className="session-grid">
        <OrbisPlayer
          connected={session.connected}
          muted={session.muted}
          runStarted={session.runStarted}
          status={session.status}
        />
        <OrbisControls session={session} />
      </div>

      <NanoBananaExample
        disabled={
          !session.connected || session.runStarted || session.controlsBusy
        }
        onActivityChange={session.setNanoBusy}
        onReady={session.startFromNanoOutput}
      />
    </>
  );
}
