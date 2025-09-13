import { HydrateClient } from "~/trpc/server";
import { Suspense } from "react";
import GameCanvas from "./_components/GameCanvas";

export default function GamePage() {
  return (
    <HydrateClient>
      <main className="fixed inset-0 bg-black text-white">
        <Suspense>
          <GameCanvas />
        </Suspense>
      </main>
    </HydrateClient>
  );
}
