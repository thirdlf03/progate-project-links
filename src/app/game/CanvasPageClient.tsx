"use client";
import { Suspense } from "react";
import GameCanvas from "./_components/GameCanvas";

export default function CanvasPageClient() {
  return (
    <main className="fixed inset-0 bg-black text-white">
      <Suspense>
        <GameCanvas />
      </Suspense>
    </main>
  );
}
