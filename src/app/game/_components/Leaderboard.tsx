"use client";

import { api } from "~/trpc/react";

export default function Leaderboard() {
  const [data] = api.game.leaderboard.useSuspenseQuery();
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">Leaderboard (Top 10)</h2>
      <ul className="divide-y divide-white/10 rounded border border-white/10">
        {data.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between px-3 py-2 text-sm"
          >
            <span>{new Date(r.createdAt).toLocaleString()}</span>
            <span>Score: {r.score}</span>
            <span>Time: {(r.durationMs / 1000).toFixed(2)}s</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
