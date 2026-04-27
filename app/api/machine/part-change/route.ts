import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { PartChangeSchema } from "@/lib/validation";
import { logRequest, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Part change notification from device.
 * Stores a part_change event when setter/supervisor changes the active part on a machine.
 *
 * Body: { machine_id, operator_id, part_number, timestamp }
 */
export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/machine/part-change", method: "POST", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logRequest({ route: "/api/machine/part-change", method: "POST", status: 400, latency_ms: elapsed(), note: "invalid-json" });
    return NextResponse.json(
      { status: "error", message: "invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = PartChangeSchema.safeParse(body);
  if (!parsed.success) {
    logRequest({ route: "/api/machine/part-change", method: "POST", status: 400, latency_ms: elapsed(), note: "validation" });
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { machine_id, operator_id, part_number, timestamp } = parsed.data;
  const sb = supabase();

  // Verify machine exists and is active
  const { data: machine, error: machErr } = await sb
    .from("machines")
    .select("machine_id")
    .eq("machine_id", machine_id)
    .eq("active", true)
    .single();

  if (machErr || !machine) {
    logRequest({ route: "/api/machine/part-change", method: "POST", status: 404, latency_ms: elapsed(), note: "machine-not-found" });
    return NextResponse.json(
      { status: "error", message: "machine not found" },
      { status: 404 }
    );
  }

  // Verify operator exists and is active
  const { data: operator, error: opErr } = await sb
    .from("operators")
    .select("id")
    .eq("id", operator_id)
    .eq("active", true)
    .single();

  if (opErr || !operator) {
    logRequest({ route: "/api/machine/part-change", method: "POST", status: 404, latency_ms: elapsed(), note: "operator-not-found" });
    return NextResponse.json(
      { status: "error", message: "operator not found" },
      { status: 404 }
    );
  }

  // Verify part exists and is active
  const { data: part, error: partErr } = await sb
    .from("parts")
    .select("part_number")
    .eq("part_number", part_number)
    .eq("active", true)
    .single();

  if (partErr || !part) {
    logRequest({ route: "/api/machine/part-change", method: "POST", status: 400, latency_ms: elapsed(), note: "invalid-part" });
    return NextResponse.json(
      { status: "error", message: "Invalid part number" },
      { status: 400 }
    );
  }

  // Insert part_change event
  const event_id = crypto.randomUUID();
  const { error: insertErr } = await sb
    .from("events")
    .insert({
      event_id,
      machine_id,
      event_type: "part_change",
      timestamp,
      payload: { operator_id, part_number },
    });

  if (insertErr) {
    logRequest({ route: "/api/machine/part-change", method: "POST", machine_id, status: 500, latency_ms: elapsed(), note: insertErr.message });
    return NextResponse.json(
      { status: "error", message: "db insert failed" },
      { status: 500 }
    );
  }

  logRequest({ route: "/api/machine/part-change", method: "POST", machine_id, status: 200, latency_ms: elapsed(), note: `part=${part_number}` });
  return NextResponse.json({ status: "ok" });
}
