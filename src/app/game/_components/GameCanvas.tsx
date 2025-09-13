"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";

type Vec = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

type EntityBase = Rect & { vx: number; vy: number };

type Player = EntityBase & { type: "player"; speed: number };
type Bullet = EntityBase & { type: "bullet"; speed: number };
type Obstacle = EntityBase & { type: "obstacle" };
type PowerUp = EntityBase & { type: "powerup" };

type GameState =
  | { status: "init" }
  | { status: "running"; startedAt: number }
  | { status: "over"; win: boolean; durationMs: number };

const CANVAS_W = 800;
const CANVAS_H = 1000;

const PLAYER_SIZE: Vec = { x: 40, y: 40 };
const BULLET_SIZE: Vec = { x: 6, y: 14 };
const OBSTACLE_SIZE: Vec = { x: 46, y: 46 };
const POWER_SIZE: Vec = { x: 28, y: 28 };

const SCROLL_SPEED = 160; // px/s (world moves downward visually)
const PLAYER_BASE_SPEED = 320; // px/s
const BULLET_SPEED = 640; // px/s upward
const OBSTACLE_SPEED = 140; // px/s downward (relative)
const SPAWN_RATE_OBS = 1.2; // per second
const SPAWN_RATE_PWR = 0.35; // per second
const FIRE_RATE_MS = 140; // min ms between shots
const GOAL_DISTANCE = 6000; // reach to clear (worldY)

const tryLoadImage = (src: string) => {
  const img = new Image();
  img.src = src;
  return img;
};

// Prefer PNG; .jpg/.jpeg kept as secondary fallbacks
const bgCandidates = ["/maps/map1.png", "/maps/map1.jpg", "/maps/map1.jpeg"];

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastShotRef = useRef<number>(0);

  // --- WebSocket (mobile tilt controller) ---
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const wsAxRef = useRef(0); // normalized [-1,1] from gamma
  const wsAyRef = useRef(0); // normalized [-1,1] from beta
  const roomRef = useRef<string>("default");
  const normalizeRoom = (v: string) => {
    const s = (v ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    return s.length > 0 ? s : "default";
  };
  // internal ws status (not rendered)
  const wsStatusRef = useRef<"idle" | "connecting" | "connected" | "error">(
    "idle",
  );

  const [state, setState] = useState<GameState>({ status: "init" });
  // Start viewing from the bottom of the background image so it feels like "climbing up".
  const [worldY, setWorldY] = useState(CANVAS_H);
  const [score, setScore] = useState(0);
  const [powerLevel, setPowerLevel] = useState(1);
  const [crashCause, setCrashCause] = useState<string | null>(null);
  const [causeLoading, setCauseLoading] = useState(false);
  const submittedRef = useRef(false);

  const recordRun = api.game.recordRun.useMutation();
  const analyzeCrash = api.game.analyzeCrash.useMutation();
  const { data: serverKeymap } = api.keymap.get.useQuery();

  const playerRef = useRef<Player>({
    type: "player",
    x: CANVAS_W / 2 - PLAYER_SIZE.x / 2,
    y: CANVAS_H - 120,
    w: PLAYER_SIZE.x,
    h: PLAYER_SIZE.y,
    vx: 0,
    vy: 0,
    speed: PLAYER_BASE_SPEED,
  });

  const bulletsRef = useRef<Bullet[]>([]);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const powersRef = useRef<PowerUp[]>([]);

  const bgImg = useMemo(() => {
    const candidate = bgCandidates.find((s) => !!s) ?? "/maps/map1.png";
    return tryLoadImage(candidate);
  }, []);

  // Resolve room from query (?room=xxx) on mount and hold an input state until start
  const initialRoom = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const r = (params.get("room") ?? "default").trim();
      return r || "default";
    } catch {
      return "default";
    }
  }, []);
  const [roomInput, setRoomInput] = useState<string>(initialRoom);
  useEffect(() => {
    roomRef.current = normalizeRoom(initialRoom);
  }, [initialRoom]);

  // Fire bullets; used by keyboard and WS 'shoot' events
  const fire = useCallback(
    (now: number) => {
      if (now - lastShotRef.current < FIRE_RATE_MS) return;
      lastShotRef.current = now;
      const p = playerRef.current;

      const spread = Math.min(powerLevel - 1, 3); // up to 3 side bullets
      const bullets: Bullet[] = [];
      for (let i = -spread; i <= spread; i++) {
        const offsetX = i * 10;
        bullets.push({
          type: "bullet",
          x: p.x + p.w / 2 - BULLET_SIZE.x / 2 + offsetX,
          y: p.y - BULLET_SIZE.y,
          w: BULLET_SIZE.x,
          h: BULLET_SIZE.y,
          vx: 0,
          vy: -BULLET_SPEED,
          speed: BULLET_SPEED,
        });
      }
      bulletsRef.current.push(...bullets);
    },
    [powerLevel],
  );

  // Helper to connect to the same WS as the mobile controller (smartphone-controller)
  const connectWS = useCallback(() => {
    // Close existing
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    wsConnectedRef.current = false;
    wsStatusRef.current = "connecting";
    setWsStatus("connecting");

    // Prefer explicit env override, else derive from current origin
    const envUrl = process.env.NEXT_PUBLIC_TILT_WS_URL;
    const url =
      envUrl && envUrl.length > 0
        ? envUrl
        : (() => {
            if (typeof window === "undefined") return "";
            const scheme = window.location.protocol === "https:" ? "wss" : "ws";
            // default to separate WS server on :3010 to avoid port clash with Next
            return `${scheme}://${window.location.hostname}:3010`;
          })();
    if (!url) {
      wsStatusRef.current = "error";
      setWsStatus("error");
      return;
    }

    let sock: WebSocket | null = null;
    try {
      sock = new WebSocket(url);
    } catch {
      wsStatusRef.current = "error";
      setWsStatus("error");
      return;
    }

    wsRef.current = sock;

    const onOpen = () => {
      wsStatusRef.current = "connected";
      wsConnectedRef.current = true;
      setWsStatus("connected");
      // Join as viewer in the selected room (same contract as smartphone-controller)
      const room = roomRef.current || "default";
      try {
        sock?.send(JSON.stringify({ type: "join", role: "viewer", room }));
      } catch {}
    };
    const onCloseOrError = () => {
      wsConnectedRef.current = false;
      wsStatusRef.current = "error";
      setWsStatus("error");
    };
    const onMessage = (ev: MessageEvent) => {
      try {
        const raw = JSON.parse(String(ev.data)) as unknown;
        if (!raw || typeof raw !== "object") return;
        const anyObj = raw as Record<string, unknown>;
        const typeField =
          typeof anyObj.type === "string" ? anyObj.type : undefined;
        const roomField =
          typeof anyObj.room === "string" ? anyObj.room : undefined;
        if (roomField && roomField !== (roomRef.current || "default")) return;

        if (typeField === "orient") {
          // Map gamma/beta to normalized axes like viewer.html
          const clamp = (v: number, a: number, b: number) =>
            Math.max(a, Math.min(b, v));
          const gamma =
            typeof anyObj.gamma === "number"
              ? anyObj.gamma
              : Number(anyObj.gamma ?? 0) || 0;
          const beta =
            typeof anyObj.beta === "number"
              ? anyObj.beta
              : Number(anyObj.beta ?? 0) || 0;
          const nX = clamp(gamma / 30, -1, 1);
          const nY = clamp(beta / 30, -1, 1);
          wsAxRef.current = nX;
          wsAyRef.current = nY;
        } else if (typeField === "shoot") {
          // Fire immediately on shoot event
          fire(performance.now());
        }
      } catch {
        // ignore
      }
    };

    sock.addEventListener("open", onOpen);
    sock.addEventListener("close", onCloseOrError);
    sock.addEventListener("error", onCloseOrError);
    sock.addEventListener("message", onMessage);

    // Teardown on change/unmount
    return () => {
      sock.removeEventListener("open", onOpen);
      sock.removeEventListener("close", onCloseOrError);
      sock.removeEventListener("error", onCloseOrError);
      sock.removeEventListener("message", onMessage);
      try {
        sock.close();
      } catch {}
    };
  }, [fire]);

  // --- Route & camera setup (serpentine) ---
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [goalDistance, setGoalDistance] = useState<number>(GOAL_DISTANCE);
  const routeRef = useRef<{
    points: Vec[];
    cum: number[];
    length: number;
  } | null>(null);

  // Wait image natural size
  useEffect(() => {
    const update = (_e: Event) => {
      if (bgImg.naturalWidth > 0 && bgImg.naturalHeight > 0) {
        setImgSize({ w: bgImg.naturalWidth, h: bgImg.naturalHeight });
      }
    };
    if (bgImg.complete) update(new Event("load"));
    else bgImg.addEventListener("load", update, { once: true });
    return () => bgImg.removeEventListener("load", update);
  }, [bgImg]);

  // tRPC: request serpentine route once image size is known
  const { data: serverRoute } = api.map.computeRoute.useQuery(
    imgSize
      ? { imgW: imgSize.w, imgH: imgSize.h, rows: 6, cols: 8, margin: 40 }
      : { imgW: 1, imgH: 1, rows: 1, cols: 1, margin: 0 },
    { enabled: !!imgSize },
  );

  useEffect(() => {
    if (!serverRoute) return;
    const pts: Vec[] = serverRoute.points as Vec[];
    const cum: number[] = [0];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i - 1]!;
      total += Math.hypot(a.x - b.x, a.y - b.y);
      cum.push(total);
    }
    routeRef.current = { points: pts, cum, length: serverRoute.length };
    setGoalDistance(Math.max(1, Math.round(serverRoute.length)));
  }, [serverRoute]);

  const getPointAt = useCallback((dist: number): Vec | null => {
    const r = routeRef.current;
    if (!r) return null;
    const d = Math.max(0, Math.min(r.length, dist));
    let lo = 0,
      hi = r.cum.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (r.cum[mid]! < d) lo = mid + 1;
      else hi = mid;
    }
    const idx = Math.max(1, lo);
    const d1 = r.cum[idx - 1]!;
    const d2 = r.cum[idx]!;
    const p1 = r.points[idx - 1]!;
    const p2 = r.points[idx]!;
    const t = d2 === d1 ? 0 : (d - d1) / (d2 - d1);
    return { x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t };
  }, []);

  const aabb = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const reset = useCallback(() => {
    setState({ status: "init" });
    // Reset to show the bottom of the image again at restart
    setWorldY(CANVAS_H);
    setScore(0);
    setPowerLevel(1);
    // Clear input state to avoid stuck keys between runs
    keysRef.current = {};
    playerRef.current = {
      type: "player",
      x: CANVAS_W / 2 - PLAYER_SIZE.x / 2,
      y: CANVAS_H - 120,
      w: PLAYER_SIZE.x,
      h: PLAYER_SIZE.y,
      vx: 0,
      vy: 0,
      speed: PLAYER_BASE_SPEED,
    };
    bulletsRef.current = [];
    obstaclesRef.current = [];
    powersRef.current = [];
  }, []);

  const DEFAULT_CODE_KEYMAP = useMemo(
    () => ({
      up: ["KeyW", "ArrowUp"],
      down: ["KeyS", "ArrowDown"],
      left: ["KeyA", "ArrowLeft"],
      right: ["KeyD", "ArrowRight"],
      shoot: ["Space"],
    }),
    [],
  );

  const codeSets = useMemo(() => {
    const map = serverKeymap ?? DEFAULT_CODE_KEYMAP;
    return {
      up: new Set<string>(map.up as string[]),
      down: new Set<string>(map.down as string[]),
      left: new Set<string>(map.left as string[]),
      right: new Set<string>(map.right as string[]),
      shoot: new Set<string>(map.shoot as string[]),
    } as const;
  }, [serverKeymap, DEFAULT_CODE_KEYMAP]);

  // Input
  useEffect(() => {
    const mapCodeToKey = (e: KeyboardEvent): string | null => {
      const c = e.code;
      if (codeSets.up.has(c)) return "w";
      if (codeSets.left.has(c)) return "a";
      if (codeSets.down.has(c)) return "s";
      if (codeSets.right.has(c)) return "d";
      if (codeSets.shoot.has(c)) return "space";
      return null;
    };

    const normalizeKey = (e: KeyboardEvent): string => {
      const mapped = mapCodeToKey(e);
      if (mapped) return mapped;
      const k = e.key;
      if (
        k === " " ||
        k.toLowerCase() === "space" ||
        k.toLowerCase() === "spacebar"
      )
        return "space";
      return k.toLowerCase();
    };

    const setKey = (key: string, pressed: boolean) => {
      // Only track known keys
      if (
        key === "w" ||
        key === "a" ||
        key === "s" ||
        key === "d" ||
        key === "space"
      ) {
        keysRef.current[key] = pressed;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier combos like Cmd/Ctrl/Alt
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = normalizeKey(e);
      if (key === "space" || key === "w" || key === "s") e.preventDefault();
      setKey(key, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = normalizeKey(e);
      setKey(key, false);
    };

    const clearKeys = () => {
      keysRef.current = {};
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearKeys();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [codeSets]);

  // (fire defined above)

  // Spawn helpers
  const spawnObstacle = (y: number) => {
    const x = Math.random() * (CANVAS_W - OBSTACLE_SIZE.x);
    obstaclesRef.current.push({
      type: "obstacle",
      x,
      y,
      w: OBSTACLE_SIZE.x,
      h: OBSTACLE_SIZE.y,
      vx: 0,
      vy: OBSTACLE_SPEED,
    });
  };
  const spawnPower = (y: number) => {
    const x = Math.random() * (CANVAS_W - POWER_SIZE.x);
    powersRef.current.push({
      type: "powerup",
      x,
      y,
      w: POWER_SIZE.x,
      h: POWER_SIZE.y,
      vx: 0,
      vy: OBSTACLE_SPEED * 0.8,
    });
  };

  const step = useCallback(
    (ts: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;

      const dt = Math.min(50, ts - (lastTsRef.current || ts)) / 1000; // clamp 50ms
      lastTsRef.current = ts;

      // Update world scroll
      const advance = SCROLL_SPEED * dt;
      setWorldY((y) => y + advance);

      // Player movement
      const p = playerRef.current;
      let ax = 0,
        ay = 0;
      const k = keysRef.current as Record<
        "w" | "a" | "s" | "d" | "space",
        boolean
      >;
      // Prefer mobile tilt axes if connected; otherwise fall back to keys
      if (wsConnectedRef.current) {
        ax = wsAxRef.current;
        ay = wsAyRef.current;
      } else {
        if (k.w) ay -= 1;
        if (k.s) ay += 1;
        if (k.a) ax -= 1;
        if (k.d) ax += 1;
      }
      const len = Math.hypot(ax, ay) || 1;
      const spd = p.speed;
      p.vx = (ax / len) * spd;
      p.vy = (ay / len) * spd + SCROLL_SPEED * 0.1; // slight push upward
      p.x = Math.max(0, Math.min(CANVAS_W - p.w, p.x + p.vx * dt));
      p.y = Math.max(0, Math.min(CANVAS_H - p.h, p.y + p.vy * dt));

      // Shooting
      if (k.space) fire(ts);

      // Spawn entities probabilistically using dt
      if (Math.random() < SPAWN_RATE_OBS * dt) spawnObstacle(-OBSTACLE_SIZE.y);
      if (Math.random() < SPAWN_RATE_PWR * dt) spawnPower(-POWER_SIZE.y * 2);

      // Update bullets
      bulletsRef.current.forEach((b) => (b.y += b.vy * dt));
      bulletsRef.current = bulletsRef.current.filter((b) => b.y + b.h > -40);

      // Update obstacles/powers (move with their vy + scroll)
      obstaclesRef.current.forEach(
        (o) => (o.y += (o.vy + SCROLL_SPEED * 0.3) * dt),
      );
      powersRef.current.forEach(
        (o) => (o.y += (o.vy + SCROLL_SPEED * 0.25) * dt),
      );
      obstaclesRef.current = obstaclesRef.current.filter(
        (o) => o.y < CANVAS_H + 80,
      );
      powersRef.current = powersRef.current.filter((o) => o.y < CANVAS_H + 80);

      // Collisions: bullets vs obstacles
      for (const b of bulletsRef.current) {
        for (const o of obstaclesRef.current) {
          if (aabb(b, o)) {
            o.y = CANVAS_H + 100; // remove later
            b.y = -100; // remove later
            setScore((s) => s + 10);
          }
        }
      }
      obstaclesRef.current = obstaclesRef.current.filter((o) => o.y < CANVAS_H);
      bulletsRef.current = bulletsRef.current.filter((b) => b.y > -50);

      // Collisions: player vs obstacle
      if (obstaclesRef.current.some((o) => aabb(p, o))) {
        const startedAt =
          (state.status === "running" ? state.startedAt : ts) || ts;
        const durationMs = Math.max(0, ts - startedAt);
        setState({ status: "over", win: false, durationMs });
      }

      // Collisions: player vs power-up
      for (const pw of powersRef.current) {
        if (aabb(p, pw)) {
          setPowerLevel((lv) => Math.min(5, lv + 1));
          setScore((s) => s + 5);
          pw.y = CANVAS_H + 100;
        }
      }
      powersRef.current = powersRef.current.filter((pw) => pw.y < CANVAS_H);

      // Win condition (distance along path or fallback)
      if (worldY + advance >= goalDistance) {
        const startedAt =
          (state.status === "running" ? state.startedAt : ts) || ts;
        const durationMs = Math.max(0, ts - startedAt);
        setState({ status: "over", win: true, durationMs });
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Background: follow route if ready; else fallback to vertical tile
      if (bgImg.complete && bgImg.naturalWidth > 0 && routeRef.current) {
        // Choose a viewport smaller than the image to allow panning in both axes.
        const viewportFrac = 0.45; // portion of the image width used for the viewport
        const srcW = Math.max(
          64,
          Math.min(
            bgImg.naturalWidth,
            Math.floor(bgImg.naturalWidth * viewportFrac),
          ),
        );
        const srcH = Math.max(
          64,
          Math.min(
            bgImg.naturalHeight,
            Math.floor((srcW * CANVAS_H) / CANVAS_W),
          ),
        );
        const cam = getPointAt(worldY) ?? {
          x: bgImg.naturalWidth / 2,
          y: bgImg.naturalHeight / 2,
        };
        const sx = Math.max(
          0,
          Math.min(bgImg.naturalWidth - srcW, cam.x - srcW / 2),
        );
        const sy = Math.max(
          0,
          Math.min(bgImg.naturalHeight - srcH, cam.y - srcH / 2),
        );
        ctx.drawImage(bgImg, sx, sy, srcW, srcH, 0, 0, CANVAS_W, CANVAS_H);
      } else if (bgImg.complete && bgImg.naturalWidth > 0) {
        // tile vertically using worldY as offset
        const imgH = (CANVAS_W / bgImg.naturalWidth) * bgImg.naturalHeight;
        const offset = (worldY % imgH) - imgH;
        for (let y = offset; y < CANVAS_H; y += imgH) {
          ctx.drawImage(
            bgImg,
            0,
            0,
            bgImg.naturalWidth,
            bgImg.naturalHeight,
            0,
            Math.floor(y),
            CANVAS_W,
            Math.floor(imgH),
          );
        }
      } else {
        const grd = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        grd.addColorStop(0, "#082032");
        grd.addColorStop(1, "#2C394B");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      }

      // Draw entities
      // Player
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(p.x, p.y, p.w, p.h);

      // Bullets
      ctx.fillStyle = "#93c5fd";
      bulletsRef.current.forEach((b) => ctx.fillRect(b.x, b.y, b.w, b.h));

      // Obstacles
      ctx.fillStyle = "#f87171";
      obstaclesRef.current.forEach((o) => ctx.fillRect(o.x, o.y, o.w, o.h));

      // Power-ups
      ctx.fillStyle = "#fbbf24";
      powersRef.current.forEach((pw) => ctx.fillRect(pw.x, pw.y, pw.w, pw.h));

      // HUD
      ctx.fillStyle = "#ffffff";
      ctx.font = "16px monospace";
      ctx.fillText(
        `Score: ${score}  Power: ${powerLevel}  Dist: ${Math.floor(worldY)}/${goalDistance}`,
        12,
        22,
      );

      // Continue loop if still running
      if (state.status === "running") {
        rafRef.current = requestAnimationFrame(step);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire, score, powerLevel, worldY, state.status, goalDistance, getPointAt],
  );

  // Game loop control
  useEffect(() => {
    if (state.status === "running") {
      lastTsRef.current = performance.now();
      rafRef.current = requestAnimationFrame(step);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }
  }, [state.status, step]);

  // Persist result once on finish via tRPC
  useEffect(() => {
    if (state.status !== "over" || submittedRef.current) return;
    submittedRef.current = true;
    recordRun.mutate({
      status: state.win ? "WIN" : "LOSE",
      durationMs: Math.round(state.durationMs),
      score,
    });

    // On lose, ask Bedrock for a plausible cause using CSV context
    if (!state.win) {
      setCauseLoading(true);
      setCrashCause(null);
      void analyzeCrash
        .mutateAsync({
          score,
          durationMs: Math.round(state.durationMs),
          distance: Math.floor(worldY),
          powerLevel,
          language: "ja",
        })
        .then((res) => setCrashCause(res.cause))
        .catch(() => setCrashCause("原因の推定に失敗しました。"))
        .finally(() => setCauseLoading(false));
    } else {
      setCrashCause(null);
      setCauseLoading(false);
    }
  }, [state, recordRun, analyzeCrash, score, powerLevel, worldY]);

  const start = () => {
    // Ensure clean input state when starting
    keysRef.current = {};
    // Apply room input and persist to URL so controller can join easily
    const r = normalizeRoom(roomInput);
    roomRef.current = r;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("room", r);
      window.history.replaceState({}, "", url.toString());
    } catch {}
    // Connect to mobile controller WS at game start
    connectWS();
    setState({ status: "running", startedAt: performance.now() });
    submittedRef.current = false;
  };

  // Track WS connection status for UI and gating
  const [wsStatus, setWsStatus] = useState<typeof wsStatusRef.current>(
    wsStatusRef.current,
  );

  // Try connecting to WS while on the start overlay
  useEffect(() => {
    if (state.status === "init" && wsStatusRef.current === "idle") {
      connectWS();
    }
  }, [state.status, connectWS]);
  const overlay = () => {
    if (state.status === "init") {
      const dotClass =
        wsStatus === "connected"
          ? "bg-emerald-400"
          : wsStatus === "connecting"
            ? "bg-amber-400 animate-pulse"
            : wsStatus === "error"
              ? "bg-rose-500"
              : "bg-zinc-400"; // idle
      const statusText =
        wsStatus === "connected"
          ? "接続済み"
          : wsStatus === "connecting"
            ? "接続中..."
            : wsStatus === "error"
              ? "エラー"
              : "未接続";

      const canStart = wsStatus === "connected";

      return (
        <div className="absolute inset-0 grid place-items-center bg-black/60">
          <div className="w-[min(92vw,560px)] rounded-lg bg-zinc-900/80 p-6 text-center">
            <div className="mb-4 text-left">
              <label className="mb-1 block text-sm text-zinc-300">
                部屋名 (room)
              </label>
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canStart) start();
                }}
                placeholder="例: team-a"
                className="w-full rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-zinc-400">
                使用可能: 英小文字・数字・ハイフン・アンダースコア。空の場合は
                <code className="mx-1">default</code>
                になります。
              </p>
            </div>

            <div className="mb-4 flex items-center justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`}
                />
                <span className="text-zinc-200">WS接続: {statusText}</span>
              </div>
              <button
                type="button"
                onClick={connectWS}
                className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                再接続
              </button>
            </div>

            <p className="mb-2">WASD or Arrow Keys: Move / Space: Shoot</p>
            <p className="mb-4 text-xs text-zinc-400">
              スマホ側URL:{" "}
              <code>/tilt/controller?room={normalizeRoom(roomInput)}</code>
            </p>
            <button
              className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={start}
              disabled={!canStart}
              title={
                !canStart ? "WebSocket未接続のため開始できません" : undefined
              }
            >
              Game Start
            </button>
          </div>
        </div>
      );
    }
    if (state.status === "over")
      return (
        <div className="absolute inset-0 grid place-items-center bg-black/60">
          <div className="rounded-lg bg-zinc-900/80 p-6 text-center">
            <p className="mb-2 text-xl font-bold">
              {state.win ? "Game Clear!" : "Game Over"}
            </p>
            <p className="mb-4">
              Time: {(state.durationMs / 1000).toFixed(2)}s | Score: {score}
            </p>
            {!state.win && (
              <div className="mx-auto mb-4 max-w-md text-left text-sm text-zinc-200">
                <p className="mb-1 font-semibold">推定された事故原因</p>
                <div className="max-h-[50svh] overflow-y-auto rounded-md bg-zinc-800 px-3 py-2">
                  {causeLoading ? (
                    <span>事故原因を推定中...</span>
                  ) : (
                    <span className="break-words whitespace-pre-wrap">
                      {crashCause ?? "(なし)"}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-center gap-3">
              <button
                className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600"
                onClick={reset}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    return null;
  };

  return (
    <div className="relative grid h-[100svh] w-[100vw] place-items-center overflow-hidden">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="block aspect-[4/5] w-[min(100vw,calc(100svh*0.8))] touch-none bg-black select-none"
      />
      {overlay()}
      <p className="mt-3 text-sm text-zinc-300">
        背景画像は <code>/public/maps/map1.jpg</code> または{" "}
        <code>map1.png</code> を配置すると反映されます。
      </p>
    </div>
  );
}
