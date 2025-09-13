import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

/**
 * Generate a serpentine (snake) path that scans an image in a row-by-row manner.
 * Coordinates are expressed in the original image pixel space (naturalWidth/Height).
 */
function generateSerpentineRoute(args: {
  imgW: number;
  imgH: number;
  rows: number;
  cols: number;
  margin: number;
}) {
  const { imgW, imgH, rows, cols, margin } = args;
  const width = Math.max(1, imgW);
  const height = Math.max(1, imgH);
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const m = Math.max(0, Math.floor(margin));

  const usableW = Math.max(1, width - m * 2);
  const usableH = Math.max(1, height - m * 2);
  const cellW = usableW / c;
  const cellH = usableH / r;

  const points: { x: number; y: number }[] = [];
  for (let row = 0; row < r; row++) {
    const y = m + cellH * (row + 0.5);
    if (row % 2 === 0) {
      // left -> right
      for (let col = 0; col < c; col++) {
        const x = m + cellW * (col + 0.5);
        points.push({ x, y });
      }
    } else {
      // right -> left
      for (let col = c - 1; col >= 0; col--) {
        const x = m + cellW * (col + 0.5);
        points.push({ x, y });
      }
    }
  }

  // compute total length
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i]!;
    const b = points[i - 1]!;
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    length += Math.hypot(dx, dy);
  }

  return {
    points,
    length,
    bounds: { width, height },
    cell: { w: cellW, h: cellH },
    grid: { rows: r, cols: c, margin: m },
  };
}

export const mapRouter = createTRPCRouter({
  /**
   * Compute a serpentine route for a given image size and grid.
   */
  computeRoute: publicProcedure
    .input(
      z.object({
        imgW: z.number().int().positive(),
        imgH: z.number().int().positive(),
        rows: z.number().int().min(1).max(200).default(6),
        cols: z.number().int().min(1).max(200).default(8),
        margin: z.number().int().min(0).max(4000).default(40),
      }),
    )
    .query(({ input }) => {
      return generateSerpentineRoute(input);
    }),
});

export type MapRouter = typeof mapRouter;
