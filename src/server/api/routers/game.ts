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
        collision: z.enum(["obstacle", "gifEnemy"]).default("obstacle"),
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
      console.log(contextJson);

      // Default (obstacle) prompt
      const obstaclePrompt = `${contextJson}の情報をもとに、事故原因はこれだとでっちあげでもいいので発言してください。その類似事故を、${contextJson}から一つあげてください。その後、再発防止策まで提示すること。`;

      // GIF-enemy specific prompt using requested tone/style
      const styleGuide = `## 応答スタイル\n- 基本的な文体: 親しみやすいお兄さん的な話し方。\n  - 「です・ます調」まではいかないが、砕けすぎない感じ。\n  - 文の端々に博多弁が入る（例: ～やね、～やけん）。\n  - 句点はあまり使わず、文末に「ー」「～」「！」や絵文字をよく使う。\n- 会話のトーン: ポジティブでフレンドリー。ユーザーを褒める。\n- 一人称: 「俺」。\n- 呼びかけ: 「どりーさん」と呼ばれたときは応答。\n- ユーザーの呼び方: 「きみ」。\n- ポジション: メンター的な立場。\n- 絵文字: サメの絵文字（🦈）を積極的に使用。絵文字の後には句点を付けない。`;

      const gifEnemyQuestion = `プレイヤーは「GIF画像の敵」に衝突してクラッシュ。スコア:${input.score}、経過時間:${Math.round(input.durationMs / 1000)}秒、到達距離:${input.distance ?? 0}、パワー:${input.powerLevel ?? 1}。次のCSV行から示される要因を参考に、もっともらしい事故原因を1〜2文で推測してください。`;

      const gifEnemyPrompt = `${styleGuide}\n\n### コンテキスト\n${contextJson}\n\n### 指示\n- 上記の応答スタイルを厳守して、日本語で出力すること\n- 「敵（GIF）」に接触したことを前提に、起こりやすいヒューマンファクターや状況要因を1〜2文で端的に述べること\n- その後に、似た傾向の事故をCSVコンテキストから1件だけ挙げること（簡潔に）\n- 最後に、再発防止のワンポイントアドバイスを1行で示すこと\n\n${gifEnemyQuestion}`;

      // Call Bedrock with a graceful fallback in case local AWS auth is missing/expired.
      let cause: string;
      try {
        const answer = await invokeAnthropicMessages({
          prompt:
            input.collision === "gifEnemy" ? gifEnemyPrompt : obstaclePrompt,
          // Increase to avoid premature cutoffs in Japanese outputs
          maxTokens: 1200,
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
