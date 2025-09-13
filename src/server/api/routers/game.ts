import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const gameRouter = createTRPCRouter({
  recordRun: publicProcedure
    .input(
      z.object({
        status: z.enum(["WIN", "LOSE"]),
        durationMs: z.number().int().nonnegative(),
        score: z.number().int().nonnegative(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user?.id ?? null;
      const run = await ctx.db.run.create({
        data: {
          status: input.status,
          durationMs: input.durationMs,
          score: input.score,
          userId: userId ?? undefined,
        },
      });
      return run;
    }),

  leaderboard: publicProcedure.query(async ({ ctx }) => {
    const top = await ctx.db.run.findMany({
      orderBy: [{ score: "desc" }, { durationMs: "asc" }],
      take: 10,
      select: { id: true, score: true, durationMs: true, createdAt: true },
    });
    return top;
  }),
});
