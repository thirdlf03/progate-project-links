import Link from "next/link";

import { LatestPost } from "~/app/_components/post";
import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export default async function Home() {
  const hello = await api.post.hello({ text: "from tRPC" });
  const session = await auth();

  if (session?.user) {
    void api.post.getLatest.prefetch();
  }

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
            ディープなシューティングゲーム
          </h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-8">
            <Link
              className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
              href="/game"
            >
              <h3 className="text-2xl font-bold">Play the Shooter →</h3>
              <div className="text-lg">ゲーム画面</div>
            </Link>
            {/* スマホ専用パネル */}
            <Link
              className="flex max-w-xs flex-col gap-4 rounded-xl bg-white/10 p-4 hover:bg-white/20"
              href="/tilt/controller"
            >
              <h3 className="text-2xl font-bold">
                スマホ専用 コントローラー →
              </h3>
              <div className="text-lg">
                スマホから操作できるコントローラー画面に移動します。
              </div>
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-2xl text-white">
          出典：「無人航空機飛行計画データ」（国土交通省）
          </p>
        </div>
      </main>
    </HydrateClient>
  );
}
