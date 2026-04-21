"use client";

import { useEffect, useRef, useState } from "react";

type Event = {
  event_id: string;
  machine_id: string;
  event_type: string;
  timestamp: string;
  payload: Record<string, unknown>;
  received_at: string;
};

type Machine = {
  machine_id: string;
  last_event_at: string;
  last_event_type: string;
  count_last_min: number;
};

type DashboardData = {
  status: "ok" | "error";
  server_time: string;
  stats: {
    total_events: number;
    events_last_minute: number;
    unique_machines_in_window: number;
  };
  machines: Machine[];
  events: Event[];
};

const POLL_MS = 2000;
const STALE_MS = 30_000;

function fmtAgo(iso: string, now: number): string {
  const d = now - new Date(iso).getTime();
  if (d < 0) return "just now";
  if (d < 1000) return "just now";
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  return `${Math.floor(d / 3_600_000)}h ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [now, setNow] = useState<number>(Date.now());
  const flashRef = useRef<Set<string>>(new Set());
  const lastIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const r = await fetch("/api/dashboard/events?limit=100", { cache: "no-store" });
        const j: DashboardData = await r.json();
        if (cancelled) return;
        if (j.status === "ok") {
          const prev = lastIdsRef.current;
          const newIds = new Set<string>();
          const flash = new Set<string>();
          for (const e of j.events) {
            newIds.add(e.event_id);
            if (!prev.has(e.event_id) && prev.size > 0) flash.add(e.event_id);
          }
          flashRef.current = flash;
          lastIdsRef.current = newIds;
          setData(j);
          setConnected(true);
          setErr(null);
        } else {
          setConnected(false);
          setErr("API returned error");
        }
      } catch (e) {
        if (cancelled) return;
        setConnected(false);
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    const clockId = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(clockId);
    };
  }, []);

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-10 font-sans text-neutral-900">
      <header className="flex items-center justify-between flex-wrap gap-3 max-w-6xl mx-auto mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">OEE MES — Live</h1>
          <p className="text-neutral-600 text-sm mt-1">
            Real-time ingest from CoreS3 devices · polling every {POLL_MS / 1000}s
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
            }`}
          />
          <span className="font-mono text-xs text-neutral-700">
            {connected ? "CONNECTED" : "DISCONNECTED"}
          </span>
          {data && (
            <span className="font-mono text-xs text-neutral-500 ml-2">
              server: {fmtTime(data.server_time)}
            </span>
          )}
        </div>
      </header>

      {err && (
        <div className="max-w-6xl mx-auto mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {err}
        </div>
      )}

      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Stat label="Total events" value={data?.stats.total_events ?? 0} />
        <Stat label="Events last 60s" value={data?.stats.events_last_minute ?? 0} highlight />
        <Stat label="Active machines" value={data?.stats.unique_machines_in_window ?? 0} />
      </section>

      <section className="max-w-6xl mx-auto mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Machines seen (last 100 events)
        </h2>
        {data && data.machines.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No machines reporting yet. Waiting for events…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data?.machines.map((m) => {
              const ageMs = now - new Date(m.last_event_at).getTime();
              const stale = ageMs > STALE_MS;
              return (
                <div
                  key={m.machine_id}
                  className="rounded-md border border-neutral-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono font-semibold text-sm">{m.machine_id}</div>
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        stale ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    />
                  </div>
                  <div className="mt-2 text-xs text-neutral-500 font-mono">
                    {m.last_event_type} · {fmtAgo(m.last_event_at, now)}
                  </div>
                  <div className="mt-1 text-xs text-neutral-400 font-mono">
                    {m.count_last_min} in last 60s
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="max-w-6xl mx-auto">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Event log (newest first)
        </h2>
        <div className="rounded-md border border-neutral-200 bg-white overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-neutral-200 bg-neutral-100 text-xs font-semibold uppercase tracking-wider text-neutral-600">
            <div className="col-span-2">Received</div>
            <div className="col-span-3">Machine</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-5">Payload</div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {data && data.events.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-neutral-500">
                No events yet.
              </div>
            ) : (
              data?.events.map((e) => {
                const isNew = flashRef.current.has(e.event_id);
                return (
                  <div
                    key={e.event_id}
                    className={`grid grid-cols-12 gap-2 px-4 py-2 border-b border-neutral-100 text-xs font-mono ${
                      isNew ? "bg-emerald-50" : ""
                    }`}
                  >
                    <div className="col-span-2 text-neutral-600">{fmtTime(e.received_at)}</div>
                    <div className="col-span-3 font-semibold">{e.machine_id}</div>
                    <div className="col-span-2">{e.event_type}</div>
                    <div className="col-span-5 text-neutral-500 truncate">
                      {Object.keys(e.payload ?? {}).length === 0
                        ? "—"
                        : JSON.stringify(e.payload)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto mt-10 text-xs text-neutral-400 font-mono">
        OEE MES · Dynatech × Codespire · Week 1
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-white p-4 ${
        highlight ? "border-emerald-300 ring-1 ring-emerald-200" : "border-neutral-200"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-1 text-3xl font-bold tabular-nums ${
          highlight ? "text-emerald-600" : "text-neutral-900"
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
