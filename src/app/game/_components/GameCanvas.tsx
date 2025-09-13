"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const bgCandidates = ["/maps/map1.jpg", "/maps/map1.png", "/maps/map1.jpeg"];

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastShotRef = useRef<number>(0);

  const [state, setState] = useState<GameState>({ status: "init" });
  const [worldY, setWorldY] = useState(0);
  const [score, setScore] = useState(0);
  const [powerLevel, setPowerLevel] = useState(1);

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
    const candidate = bgCandidates.find((s) => !!s) ?? "/maps/map1.jpg";
    return tryLoadImage(candidate);
  }, []);

  const aabb = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const reset = useCallback(() => {
    setState({ status: "init" });
    setWorldY(0);
    setScore(0);
    setPowerLevel(1);
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

  // Input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      if ([" ", "Space", "Spacebar"].includes(k)) e.preventDefault();
      const key =
        k === " " ||
        k.toLowerCase() === "space" ||
        k.toLowerCase() === "spacebar"
          ? "space"
          : k.toLowerCase();
      keysRef.current[key] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key;
      const key =
        k === " " ||
        k.toLowerCase() === "space" ||
        k.toLowerCase() === "spacebar"
          ? "space"
          : k.toLowerCase();
      keysRef.current[key] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

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
      if (k.w) ay -= 1;
      if (k.s) ay += 1;
      if (k.a) ax -= 1;
      if (k.d) ax += 1;
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

      // Win condition
      if (worldY + advance >= GOAL_DISTANCE) {
        const startedAt =
          (state.status === "running" ? state.startedAt : ts) || ts;
        const durationMs = Math.max(0, ts - startedAt);
        setState({ status: "over", win: true, durationMs });
      }

      // Draw
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // Background: image if available, else gradient
      if (bgImg.complete && bgImg.naturalWidth > 0) {
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
        `Score: ${score}  Power: ${powerLevel}  Dist: ${Math.floor(worldY)}/${GOAL_DISTANCE}`,
        12,
        22,
      );

      // Continue loop if still running
      if (state.status === "running") {
        rafRef.current = requestAnimationFrame(step);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire, score, powerLevel, worldY, state.status],
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

  const start = () => {
    setState({ status: "running", startedAt: performance.now() });
  };

  const overlay = () => {
    if (state.status === "init")
      return (
        <div className="absolute inset-0 grid place-items-center bg-black/60">
          <div className="rounded-lg bg-zinc-900/80 p-6 text-center">
            <p className="mb-4">WASD: Move / Space: Shoot</p>
            <p className="mb-4">Reach the goal without hitting obstacles.</p>
            <button
              className="rounded bg-emerald-500 px-4 py-2 hover:bg-emerald-600"
              onClick={start}
            >
              Game Start
            </button>
          </div>
        </div>
      );
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
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="mx-auto block rounded bg-black shadow-lg"
      />
      {overlay()}
      <p className="mt-3 text-sm text-zinc-300">
        背景画像は <code>/public/maps/map1.jpg</code> または{" "}
        <code>map1.png</code> を配置すると反映されます。
      </p>
    </div>
  );
}
