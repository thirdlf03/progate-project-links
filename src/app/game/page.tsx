import { HydrateClient } from "~/trpc/server";
export const dynamic = "force-dynamic";
import CanvasPageClient from "./CanvasPageClient";

export default function GamePage() {
  return (
    <HydrateClient>
      <CanvasPageClient />
    </HydrateClient>
  );
}
