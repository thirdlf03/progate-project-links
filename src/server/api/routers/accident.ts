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
      const prompt = `You are a helpful data analyst. You are given a table's JSON rows and a user question.\n\n- Use only the provided rows to answer.\n- If information is insufficient, say so clearly.\n- Show key figures and reasoning briefly.\n\nQuestion: ${input.question}\nRows (JSON): ${contextJson}`;

      const answer = await invokeAnthropicMessages({ prompt, maxTokens: 800 });
      return { answer, usedRows: selections.length };
    }),
});
