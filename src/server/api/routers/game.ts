import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  loadAccidentCsv,
  selectRelevantRows,
  toCompactJson,
} from "~/server/services/csv/accident";
import { invokeAnthropicMessages } from "~/server/bedrock/client";

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

  analyzeCrash: publicProcedure
    .input(
      z.object({
        score: z.number().int().nonnegative(),
        durationMs: z.number().int().nonnegative(),
        distance: z.number().int().nonnegative().optional(),
        powerLevel: z.number().int().min(1).max(5).optional(),
        language: z.enum(["ja", "en"]).default("ja"),
      }),
    )
    .mutation(async ({ input }) => {
      const rows = await loadAccidentCsv();

      // Craft a question that is likely to match generic accident CSVs
      const qTokensJa =
        "事故 衝突 速度 不注意 視界 天候 路面 操作ミス 追突 回避 疲労";
      const baseQuestion = `ゲームのプレイヤーは障害物に衝突してクラッシュしました。スコア:${input.score}、経過時間:${Math.round(input.durationMs / 1000)}秒、到達距離:${input.distance ?? 0}、パワー:${input.powerLevel ?? 1}。次のCSV行から示唆される要因を参考に、もっともらしい事故原因を1〜2文で日本語で推測してください。${qTokensJa}`;

      const selections = selectRelevantRows(rows, baseQuestion, 20);
      const contextJson = toCompactJson(selections);

      const prompt = `CSV ${contextJson}をもとに、やけにリアルな事故原因を1つ考えてください。その後、再発防止策まで提示すること`;

      // Call Bedrock with a graceful fallback in case local AWS auth is missing/expired.
      let cause: string;
      try {
        const answer = await invokeAnthropicMessages({
          prompt,
          maxTokens: 300,
          temperature: 0.4,
        });
        cause = answer.trim();
      } catch (err) {
        // Avoid crashing tRPC in development when AWS creds are not configured.
        const msg = err instanceof Error ? err.message : String(err);
        const tokenExpired = /bearer token has expired|token has expired/i.test(
          msg,
        );
        const accessDenied =
          /accessdenied|unauthorized|notauthorized|unrecognizedclient/i.test(
            msg,
          );
        const hint = tokenExpired
          ? "（AWS SSOの有効期限が切れています）"
          : accessDenied
            ? "（AWS認証/権限エラー）"
            : "";
        console.error("[TRPC] game.analyzeCrash Bedrock error:", msg);
        cause = `原因の推定に失敗しました。${hint}`;
      }

      return { cause, usedRows: selections.length };
    }),
});
