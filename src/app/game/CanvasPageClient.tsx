"use client";
import { Suspense } from "react";
import GameCanvas from "./_components/GameCanvas";

export default function CanvasPageClient() {
  return (
    // 背景をキャンバスと同系のグラデーションにして、
    // 画面比率の差で生じる左右の“黒帯”を目立たなくする
    <main className="fixed inset-0 bg-gradient-to-b from-[#082032] to-[#2C394B] text-white">
      <Suspense>
        <GameCanvas />
      </Suspense>
    </main>
  );
}
