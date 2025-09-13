import { postRouter } from "~/server/api/routers/post";
import { gameRouter } from "~/server/api/routers/game";
import { mapRouter } from "~/server/api/routers/map";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { accidentRouter } from "~/server/api/routers/accident";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
import { keymapRouter } from "~/server/api/routers/keymap";
export const appRouter = createTRPCRouter({
  post: postRouter,
  game: gameRouter,
  keymap: keymapRouter,
  map: mapRouter,
  accident: accidentRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
