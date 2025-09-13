"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";

type Actions = "up" | "down" | "left" | "right" | "shoot";
type Keymap = Record<Actions, string[]>;

const DEFAULT_KEYMAP: Keymap = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  shoot: ["Space"],
};

export default function KeymapSettings() {
  const { data } = api.keymap.get.useQuery();
  const setKeymap = api.keymap.set.useMutation();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Actions | null>(null);
  const [localMap, setLocalMap] = useState<Keymap>(DEFAULT_KEYMAP);

  useEffect(() => {
    if (data) setLocalMap(data as Keymap);
  }, [data]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const code = e.code; // use KeyboardEvent.code for layout-independent mapping
      setLocalMap((m) => ({ ...m, [editing]: [code] }));
      setEditing(null);
    };
    window.addEventListener("keydown", onKey, { once: true });
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [editing]);

  const saveDisabled = setKeymap.isPending;
  const isAuthed = useMemo(() => {
    // We can't read session from here directly; rely on mutation error to indicate auth.
    return true;
  }, []);

  const save = async () => {
    try {
      await setKeymap.mutateAsync(localMap);
    } catch {
      // noop: UI remains with edited map; server will reject when unauthenticated.
    }
  };

  const reset = () => setLocalMap(DEFAULT_KEYMAP);

  const ActionRow = ({ action, label }: { action: Actions; label: string }) => (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <div className="min-w-24">{label}</div>
      <div className="flex-1 truncate text-zinc-300">
        {(localMap[action] ?? []).join(", ")}
      </div>
      <button
        className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600"
        onClick={() => setEditing(action)}
        disabled={!!editing}
      >
        {editing === action ? "Press any key..." : "Rebind"}
      </button>
    </div>
  );

  return (
    <div className="mb-3">
      <button
        className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Close Keymap Settings" : "Open Keymap Settings"}
      </button>
      {open && (
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-900 p-3">
          <ActionRow action="up" label="Up" />
          <ActionRow action="down" label="Down" />
          <ActionRow action="left" label="Left" />
          <ActionRow action="right" label="Right" />
          <ActionRow action="shoot" label="Shoot" />

          <div className="mt-3 flex gap-2">
            <button
              className="rounded bg-emerald-600 px-3 py-1 text-sm hover:bg-emerald-500 disabled:opacity-50"
              onClick={save}
              disabled={saveDisabled}
            >
              Save
            </button>
            <button
              className="rounded bg-zinc-700 px-3 py-1 text-sm hover:bg-zinc-600"
              onClick={reset}
            >
              Reset Defaults
            </button>
            {!isAuthed && (
              <span className="text-xs text-zinc-400">
                Login to save server-side
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
