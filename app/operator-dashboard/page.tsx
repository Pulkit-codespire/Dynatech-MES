"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type ActiveSession = {
  id: string;
  operator_id: string;
  name: string;
  role: string;
  machine_id: string;
  shift: string;
  logged_in_at: string;
};

type PartStat = {
  part_number: string;
  description: string;
  target_secs: number;
  count: number;
  avg_cycle_secs: number;
  min_cycle_secs: number;
  max_cycle_secs: number;
  last_cycle_secs: number;
};

type OperatorStat = {
  operator_id: string;
  name: string;
  role: string;
  total_parts: number;
  avg_efficiency: number;
  parts: PartStat[];
};

type DashboardData = {
  status: string;
  server_time: string;
  active_sessions: ActiveSession[];
  operator_stats: OperatorStat[];
  summary: {
    total_operators_active: number;
    total_parts_today: number;
    avg_efficiency: number;
  };
};

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const POLL_MS = 5_000;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function fmtDuration(loginIso: string, now: number): string {
  const ms = now - new Date(loginIso).getTime();
  if (ms < 0) return "0m";
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function roleBadge(role: string) {
  const cls =
    role === "supervisor"
      ? "bg-amber-100 text-amber-700"
      : role === "setter"
      ? "bg-blue-100 text-blue-700"
      : "bg-neutral-100 text-neutral-600";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${cls}`}
    >
      {role}
    </span>
  );
}

function efficiencyColor(eff: number): string {
  if (eff >= 95) return "text-emerald-600";
  if (eff >= 85) return "text-amber-600";
  return "text-red-600";
}

function cycleColor(actual: number, target: number): string {
  if (target <= 0) return "text-neutral-900";
  return actual <= target ? "text-emerald-600" : "text-red-600";
}

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */

export default function OperatorDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [expandedOp, setExpandedOp] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await fetch("/api/dashboard/operator-stats", {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        if (j.status === "ok") {
          setData(j);
          setConnected(true);
          setErr(null);
        } else {
          setConnected(false);
          setErr(j.message ?? "API returned error");
        }
      } catch (e) {
        if (cancelled) return;
        setConnected(false);
        setErr(e instanceof Error ? e.message : String(e));
      }
    }

    tick();
    const pollId = setInterval(tick, POLL_MS);
    const clockId = setInterval(() => setNow(Date.now()), 1_000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(clockId);
    };
  }, []);

  function toggleOp(opId: string) {
    setExpandedOp((prev) => {
      const next = new Set(prev);
      if (next.has(opId)) next.delete(opId);
      else next.add(opId);
      return next;
    });
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-10 font-sans text-neutral-900">
      {/* ---- Header ---- */}
      <header className="flex items-center justify-between flex-wrap gap-3 max-w-6xl mx-auto mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            OEE MES — Operators
          </h1>
          <p className="text-neutral-600 text-sm mt-1">
            Login sessions, cycle times &amp; production stats
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <a
            href="/dashboard"
            className="text-xs font-mono text-neutral-500 hover:text-neutral-700 underline mr-3"
          >
            ← Main Dashboard
          </a>
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

      {/* ---- Error banner ---- */}
      {err && (
        <div className="max-w-6xl mx-auto mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Error:</strong> {err}
        </div>
      )}

      {/* ---- Summary stats ---- */}
      <section className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Operators active"
          value={data?.summary.total_operators_active ?? 0}
        />
        <StatCard
          label="Parts produced today"
          value={data?.summary.total_parts_today ?? 0}
          highlight
        />
        <StatCard
          label="Avg cycle efficiency"
          value={`${data?.summary.avg_efficiency ?? 0}%`}
          highlight={
            data ? data.summary.avg_efficiency >= 95 : false
          }
          warn={data ? data.summary.avg_efficiency > 0 && data.summary.avg_efficiency < 85 : false}
        />
      </section>

      {/* ---- Active operators ---- */}
      <section className="max-w-6xl mx-auto mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Active operators ({data?.active_sessions.length ?? 0})
        </h2>

        {data && data.active_sessions.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No operators currently logged in.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {data?.active_sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-neutral-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-sm">{s.name}</div>
                  {roleBadge(s.role)}
                </div>
                <div className="mt-2 text-xs text-neutral-500 font-mono">
                  {s.operator_id}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-neutral-400">Machine</span>
                    <div className="font-mono font-semibold">
                      {s.machine_id}
                    </div>
                  </div>
                  <div>
                    <span className="text-neutral-400">Shift</span>
                    <div className="font-mono font-semibold">{s.shift}</div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-neutral-100 text-xs text-neutral-400 font-mono">
                  Logged in {fmtAgo(s.logged_in_at, now)} ·{" "}
                  {fmtDuration(s.logged_in_at, now)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- Production by operator ---- */}
      <section className="max-w-6xl mx-auto mb-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
          Production by operator ({data?.operator_stats.length ?? 0})
        </h2>

        {data && data.operator_stats.length === 0 ? (
          <div className="rounded-md border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No production data for today yet.
          </div>
        ) : (
          <div className="space-y-3">
            {data?.operator_stats.map((op) => {
              const isExpanded = expandedOp.has(op.operator_id);
              return (
                <div
                  key={op.operator_id}
                  className="rounded-md border border-neutral-200 bg-white overflow-hidden"
                >
                  {/* Operator header — clickable */}
                  <button
                    type="button"
                    onClick={() => toggleOp(op.operator_id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-neutral-400 select-none">
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      <div>
                        <span className="font-semibold text-sm">
                          {op.name}
                        </span>
                        <span className="ml-2 font-mono text-xs text-neutral-500">
                          {op.operator_id}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 text-xs">
                      <div className="text-right">
                        <span className="text-neutral-400">Parts</span>
                        <div className="font-bold tabular-nums">
                          {op.total_parts}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-neutral-400">Efficiency</span>
                        <div
                          className={`font-bold tabular-nums ${efficiencyColor(
                            op.avg_efficiency
                          )}`}
                        >
                          {op.avg_efficiency > 0
                            ? `${op.avg_efficiency}%`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Expanded: per-part table */}
                  {isExpanded && (
                    <div className="border-t border-neutral-200">
                      {/* Table header */}
                      <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-neutral-100 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">
                        <div className="col-span-2">Part</div>
                        <div className="col-span-3">Description</div>
                        <div className="col-span-1 text-right">Count</div>
                        <div className="col-span-2 text-right">
                          Avg / Target
                        </div>
                        <div className="col-span-2 text-right">
                          Min / Max
                        </div>
                        <div className="col-span-2 text-right">
                          Last Cycle
                        </div>
                      </div>

                      {/* Table body */}
                      <div className="max-h-[300px] overflow-y-auto">
                        {op.parts.map((p) => (
                          <div
                            key={p.part_number}
                            className="grid grid-cols-2 md:grid-cols-12 gap-2 px-4 py-2 text-xs font-mono border-b border-neutral-100 hover:bg-neutral-50"
                          >
                            {/* Part number */}
                            <div className="col-span-2 font-semibold">
                              {p.part_number}
                            </div>

                            {/* Description */}
                            <div className="col-span-2 md:col-span-3 text-neutral-600 font-sans truncate">
                              {p.description}
                            </div>

                            {/* Count */}
                            <div className="md:col-span-1 text-right tabular-nums font-semibold">
                              <span className="md:hidden text-neutral-400 font-sans font-normal mr-1">
                                Count:
                              </span>
                              {p.count}
                            </div>

                            {/* Avg / Target */}
                            <div
                              className={`md:col-span-2 text-right tabular-nums ${cycleColor(
                                p.avg_cycle_secs,
                                p.target_secs
                              )}`}
                            >
                              <span className="md:hidden text-neutral-400 font-sans font-normal mr-1">
                                Avg:
                              </span>
                              {p.avg_cycle_secs}s
                              <span className="text-neutral-400 ml-1">
                                / {p.target_secs}s
                              </span>
                            </div>

                            {/* Min / Max */}
                            <div className="md:col-span-2 text-right tabular-nums text-neutral-600">
                              <span className="md:hidden text-neutral-400 font-sans font-normal mr-1">
                                Range:
                              </span>
                              {p.min_cycle_secs}s / {p.max_cycle_secs}s
                            </div>

                            {/* Last cycle */}
                            <div
                              className={`md:col-span-2 text-right tabular-nums ${cycleColor(
                                p.last_cycle_secs,
                                p.target_secs
                              )}`}
                            >
                              <span className="md:hidden text-neutral-400 font-sans font-normal mr-1">
                                Last:
                              </span>
                              {p.last_cycle_secs}s
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- Footer ---- */}
      <footer className="max-w-6xl mx-auto mt-10 text-xs text-neutral-400 font-mono">
        OEE MES · Dynatech × Codespire · Operator Dashboard
      </footer>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Helper components                                                   */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  highlight = false,
  warn = false,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-white p-4 ${
        warn
          ? "border-red-300 ring-1 ring-red-200"
          : highlight
          ? "border-emerald-300 ring-1 ring-emerald-200"
          : "border-neutral-200"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-1 text-3xl font-bold tabular-nums ${
          warn
            ? "text-red-600"
            : highlight
            ? "text-emerald-600"
            : "text-neutral-900"
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
