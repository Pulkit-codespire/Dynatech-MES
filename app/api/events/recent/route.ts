import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { logRequest, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = ["breakdown", "reject"];

/**
 * Returns recent breakdown/reject events for a machine.
 * Used by firmware for the override screen.
 *
 * Query: ?machine_id=JYOTI-01&type=breakdown&limit=10
 */
export async function GET(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/events/recent", method: "GET", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id")?.trim();
  const type = url.searchParams.get("type")?.trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? "10");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 10, 1), 20);

  if (!machine_id) {
    logRequest({ route: "/api/events/recent", method: "GET", status: 400, latency_ms: elapsed(), note: "missing-machine_id" });
    return NextResponse.json(
      { status: "error", message: "machine_id query param required" },
      { status: 400 }
    );
  }

  if (!type || !VALID_TYPES.includes(type)) {
    logRequest({ route: "/api/events/recent", method: "GET", status: 400, latency_ms: elapsed(), note: "invalid-type" });
    return NextResponse.json(
      { status: "error", message: "type query param required (breakdown or reject)" },
      { status: 400 }
    );
  }

  // Last 8 hours as current shift approximation
  const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();

  const sb = supabase();
  const { data, error } = await sb
    .from("events")
    .select("event_id, event_type, timestamp, payload, voided")
    .eq("machine_id", machine_id)
    .eq("event_type", type)
    .gte("timestamp", cutoff)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    logRequest({ route: "/api/events/recent", method: "GET", machine_id, status: 500, latency_ms: elapsed(), note: error.message });
    return NextResponse.json(
      { status: "error", message: "db query failed" },
      { status: 500 }
    );
  }

  // Map to response format — extract reason/operator_id from payload JSONB
  const events = (data ?? []).map((e) => {
    const payload = (e.payload ?? {}) as Record<string, unknown>;
    return {
      event_id: e.event_id,
      event_type: e.event_type,
      reason: (payload.reason as string) ?? null,
      operator_id: (payload.operator_id as string) ?? null,
      timestamp: e.timestamp,
      voided: e.voided ?? false,
    };
  });

  logRequest({ route: "/api/events/recent", method: "GET", machine_id, count: events.length, status: 200, latency_ms: elapsed() });
  return NextResponse.json({ status: "ok", events });
}
