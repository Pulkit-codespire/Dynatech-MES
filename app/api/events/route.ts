import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { EventSchema } from "@/lib/validation";
import { logRequest, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/events", method: "POST", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logRequest({ route: "/api/events", method: "POST", status: 400, latency_ms: elapsed(), note: "invalid-json" });
    return NextResponse.json({ status: "error", message: "invalid JSON body" }, { status: 400 });
  }

  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    logRequest({ route: "/api/events", method: "POST", status: 400, latency_ms: elapsed(), note: "validation" });
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const e = parsed.data;
  const { error } = await supabase()
    .from("events")
    .upsert(
      {
        event_id: e.event_id,
        machine_id: e.machine_id,
        event_type: e.event_type,
        timestamp: e.timestamp,
        payload: e.payload,
      },
      { onConflict: "event_id", ignoreDuplicates: true }
    );

  if (error) {
    logRequest({
      route: "/api/events",
      method: "POST",
      machine_id: e.machine_id,
      event_id: e.event_id,
      status: 500,
      latency_ms: elapsed(),
      note: error.message,
    });
    return NextResponse.json({ status: "error", message: "db insert failed" }, { status: 500 });
  }

  logRequest({
    route: "/api/events",
    method: "POST",
    machine_id: e.machine_id,
    event_id: e.event_id,
    status: 200,
    latency_ms: elapsed(),
  });
  return NextResponse.json({ status: "ok", event_id: e.event_id });
}

export async function GET(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/events", method: "GET", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id");
  if (!machine_id) {
    logRequest({ route: "/api/events", method: "GET", status: 400, latency_ms: elapsed(), note: "missing-machine_id" });
    return NextResponse.json(
      { status: "error", message: "machine_id query param required" },
      { status: 400 }
    );
  }

  const limitRaw = Number(url.searchParams.get("limit") ?? "100");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 1000);

  const { data, error } = await supabase()
    .from("events")
    .select("event_id, machine_id, event_type, timestamp, payload, received_at")
    .eq("machine_id", machine_id)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    logRequest({
      route: "/api/events",
      method: "GET",
      machine_id,
      status: 500,
      latency_ms: elapsed(),
      note: error.message,
    });
    return NextResponse.json({ status: "error", message: "db query failed" }, { status: 500 });
  }

  logRequest({
    route: "/api/events",
    method: "GET",
    machine_id,
    count: data?.length ?? 0,
    status: 200,
    latency_ms: elapsed(),
  });
  return NextResponse.json({ status: "ok", count: data?.length ?? 0, events: data ?? [] });
}
