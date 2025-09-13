import { HydrateClient } from "~/trpc/server";
import { Suspense } from "react";
import GameCanvas from "./_components/GameCanvas";
import Leaderboard from "./_components/Leaderboard";
import KeymapSettings from "./_components/KeymapSettings";

export default function GamePage() {
  return (
    <HydrateClient>
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto w-full max-w-4xl p-4">
          <h1 className="mb-4 text-2xl font-bold">
            Vertical Scrolling Shooter
          </h1>
          <KeymapSettings />
          <Suspense>
            <GameCanvas />
          </Suspense>
          <Suspense>
            <Leaderboard />
          </Suspense>
        </div>
      </div>
    </HydrateClient>
  );
}
