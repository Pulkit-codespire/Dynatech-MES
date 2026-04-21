import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100"), 1), 500);
  const since = url.searchParams.get("since");

  const sb = supabase();
  let q = sb
    .from("events")
    .select("event_id, machine_id, event_type, timestamp, payload, received_at")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (since) q = q.gt("received_at", since);

  const { data: events, error } = await q;
  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const { count: last60s } = await sb
    .from("events")
    .select("event_id", { count: "exact", head: true })
    .gt("received_at", cutoff);

  const { count: total } = await sb
    .from("events")
    .select("event_id", { count: "exact", head: true });

  const machines = new Map<
    string,
    { machine_id: string; last_event_at: string; last_event_type: string; count_last_min: number }
  >();
  for (const e of events ?? []) {
    const existing = machines.get(e.machine_id);
    const isRecent = e.received_at > cutoff;
    if (!existing) {
      machines.set(e.machine_id, {
        machine_id: e.machine_id,
        last_event_at: e.received_at,
        last_event_type: e.event_type,
        count_last_min: isRecent ? 1 : 0,
      });
    } else if (isRecent) {
      existing.count_last_min += 1;
    }
  }

  return NextResponse.json({
    status: "ok",
    server_time: new Date().toISOString(),
    stats: {
      total_events: total ?? 0,
      events_last_minute: last60s ?? 0,
      unique_machines_in_window: machines.size,
    },
    machines: Array.from(machines.values()).sort((a, b) =>
      b.last_event_at.localeCompare(a.last_event_at)
    ),
    events: events ?? [],
  });
}
