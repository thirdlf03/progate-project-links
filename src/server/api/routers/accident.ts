import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  loadAccidentCsv,
  selectRelevantRows,
  toCompactJson,
} from "~/server/services/csv/accident";
import { invokeAnthropicMessages } from "~/server/bedrock/client";

export const accidentRouter = createTRPCRouter({
  ask: publicProcedure
    .input(
      z.object({
        question: z.string().min(3),
        topK: z.number().min(1).max(50).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const rows = await loadAccidentCsv();
      const selections = selectRelevantRows(
        rows,
        input.question,
        input.topK ?? 20,
      );
      const contextJson = toCompactJson(selections);
      const prompt = `${contextJson}をもとに、めちゃくちゃリアルな事故原因を考えてください。`;

      const answer = await invokeAnthropicMessages({ prompt, maxTokens: 1200 });
      return { answer, usedRows: selections.length };
    }),
});
