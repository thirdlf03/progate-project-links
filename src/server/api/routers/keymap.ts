import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

const KeymapSchema = z.object({
  up: z.array(z.string()).min(1).max(8),
  down: z.array(z.string()).min(1).max(8),
  left: z.array(z.string()).min(1).max(8),
  right: z.array(z.string()).min(1).max(8),
  shoot: z.array(z.string()).min(1).max(8),
});

const DEFAULT_KEYMAP = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  shoot: ["Space"],
} as const;

export const keymapRouter = createTRPCRouter({
  // Public: if logged in, return user keymap; otherwise default
  get: publicProcedure.query(async ({ ctx }) => {
    const userId = ctx.session?.user?.id;
    if (!userId) return DEFAULT_KEYMAP;
    const existing = await ctx.db.keymap.findUnique({ where: { userId } });
    if (!existing) return DEFAULT_KEYMAP;
    // validate shape; fallback to default on mismatch
    const parsed = KeymapSchema.safeParse(existing.mapping);
    return parsed.success ? parsed.data : DEFAULT_KEYMAP;
  }),

  // Protected: set user keymap
  set: protectedProcedure
    .input(KeymapSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const saved = await ctx.db.keymap.upsert({
        where: { userId },
        update: { mapping: input },
        create: { userId, mapping: input },
      });
      return saved.mapping;
    }),
});
