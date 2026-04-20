import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { BatchSchema } from "@/lib/validation";
import { logRequest, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/events/batch", method: "POST", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logRequest({ route: "/api/events/batch", method: "POST", status: 400, latency_ms: elapsed(), note: "invalid-json" });
    return NextResponse.json({ status: "error", message: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) {
    logRequest({ route: "/api/events/batch", method: "POST", status: 400, latency_ms: elapsed(), note: "validation" });
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const incoming = parsed.data.events;
  const ids = incoming.map((e) => e.event_id);

  const { data: existing, error: selErr } = await supabase()
    .from("events")
    .select("event_id")
    .in("event_id", ids);

  if (selErr) {
    logRequest({ route: "/api/events/batch", method: "POST", status: 500, latency_ms: elapsed(), note: selErr.message });
    return NextResponse.json({ status: "error", message: "db query failed" }, { status: 500 });
  }

  const existingSet = new Set((existing ?? []).map((r) => r.event_id));
  const toInsert = incoming.filter((e) => !existingSet.has(e.event_id));

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase()
      .from("events")
      .upsert(toInsert, { onConflict: "event_id", ignoreDuplicates: true });

    if (insErr) {
      logRequest({ route: "/api/events/batch", method: "POST", status: 500, latency_ms: elapsed(), note: insErr.message });
      return NextResponse.json({ status: "error", message: "db insert failed" }, { status: 500 });
    }
  }

  const results = incoming.map((e) => ({
    event_id: e.event_id,
    status: existingSet.has(e.event_id) ? ("duplicate" as const) : ("ok" as const),
  }));

  logRequest({
    route: "/api/events/batch",
    method: "POST",
    count: incoming.length,
    status: 200,
    latency_ms: elapsed(),
    note: `inserted=${toInsert.length} duplicates=${existingSet.size}`,
  });
  return NextResponse.json({ status: "ok", results });
}
