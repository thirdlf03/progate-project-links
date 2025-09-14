"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function TiltControllerPage() {
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "sensor-ng" | "error"
  >("idle");
  const [alpha, setAlpha] = useState(0);
  const [beta, setBeta] = useState(0);
  const [gamma, setGamma] = useState(0);
  const zeroBetaRef = useRef(0);
  const zeroGammaRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const initialRoom = useMemo(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const r = (sp.get("room") ?? "default").trim();
      return r || "default";
    } catch {
      return "default";
    }
  }, []);
  const [room, setRoom] = useState<string>(initialRoom);

  const normalizeRoom = (v: string) => {
    const s = (v ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return s.length > 0 ? s : "default";
  };

  const wsURL = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_TILT_WS_URL;
    if (envUrl && envUrl.length > 0) return envUrl;
    if (typeof window === "undefined") return "";
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    // assume dev: separate port 3010
    return `${scheme}://${window.location.hostname}:3010`;
  }, []);

  useEffect(() => {
    return () => {
      try {
        wsRef.current?.close();
      } catch { }
    };
  }, []);

  async function ensureSensorPermission() {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      // @ts-expect-error iOS specific
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      // @ts-expect-error iOS specific
      const request = DeviceOrientationEvent.requestPermission as unknown;
      const fn =
        typeof request === "function"
          ? (request as () => Promise<unknown>)
          : null;
      const state = fn ? await fn() : "denied";
      if (state !== "granted") throw new Error("permission denied");
    }
    // Attach listener once
    window.addEventListener("deviceorientation", handleOrientation, {
      passive: true,
    });
  }

  function handleOrientation(ev: DeviceOrientationEvent) {
    const a = Number(ev.alpha ?? 0);
    const b = Number(ev.beta ?? 0);
    const g = Number(ev.gamma ?? 0);
    setAlpha(a);
    setBeta(b);
    setGamma(g);
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    // throttle ~30fps
    const now = performance.now();
    // attach lastSent on function object for simplicity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const last = (handleOrientation as any)._last as number | undefined;
    if (last && now - last < 33) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (handleOrientation as any)._last = now;
    const msg = {
      type: "orient",
      room,
      alpha: a,
      beta: b - zeroBetaRef.current,
      gamma: g - zeroGammaRef.current,
      t: Date.now(),
    };
    try {
      sock.send(JSON.stringify(msg));
    } catch { }
  }

  async function connect() {
    try {
      await ensureSensorPermission();
    } catch {
      setStatus("sensor-ng");
      return;
    }
    try {
      wsRef.current?.close();
    } catch { }
    setStatus("connecting");
    let sock: WebSocket | null = null;
    try {
      sock = new WebSocket(wsURL);
    } catch {
      setStatus("error");
      return;
    }
    wsRef.current = sock;
    sock.addEventListener("open", () => {
      setStatus("connected");
      try {
        sock.send(
          JSON.stringify({
            type: "join",
            role: "controller",
            room: normalizeRoom(room),
          }),
        );
      } catch { }
    });
    const onClose = () => setStatus("error");
    sock.addEventListener("close", onClose);
    sock.addEventListener("error", onClose);
  }

  function center() {
    zeroBetaRef.current = beta;
    zeroGammaRef.current = gamma;
  }
  function shoot() {
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    try {
      sock.send(
        JSON.stringify({
          type: "shoot",
          room: normalizeRoom(room),
          t: Date.now(),
        }),
      );
    } catch { }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-2xl font-bold">スマホ傾きコントローラー</h1>
      <div className="mb-3">
        <label className="mb-1 block text-sm text-zinc-300">
          部屋名 (room)
        </label>
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void connect();
          }}
          placeholder="例: team-a"
          className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-zinc-500">
          使用可能: 英小文字・数字・ハイフン・アンダースコア。空の場合は
          <code className="mx-1">default</code>
          になります。
        </p>
      </div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={connect}
          className="rounded bg-blue-600 px-4 py-2 text-white"
        >
          接続して開始
        </button>
        <button
          onClick={shoot}
          className="rounded bg-red-600 px-4 py-2 text-white"
        >
          玉を発射
        </button>
      </div>
      <div className="mb-2 text-sm">
        接続:{" "}
        {status === "connected" ? (
          <span className="text-emerald-500">接続済み</span>
        ) : status === "connecting" ? (
          "接続中…"
        ) : status === "sensor-ng" ? (
          "センサー未許可"
        ) : (
          "未接続/エラー"
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          alpha
          <br />
          <span className="text-xl font-bold">{alpha.toFixed(2)}</span>
        </div>
        <div>
          beta
          <br />
          <span className="text-xl font-bold">{beta.toFixed(2)}</span>
        </div>
        <div>
          gamma
          <br />
          <span className="text-xl font-bold">{gamma.toFixed(2)}</span>
        </div>
      </div>
      <p className="mt-4 text-sm text-zinc-500">
        デフォルト接続先: <code>{wsURL}</code>（`NEXT_PUBLIC_TILT_WS_URL`
        で上書き可）
      </p>
    </div>
  );
}
