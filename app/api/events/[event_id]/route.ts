import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { EditEventSchema } from "@/lib/validation";
import { logRequest, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edit or void an event.
 *
 * - Edit breakdown reason:  { reason: "Material issue", edited_by: "ST-AP-007" }
 * - Void a reject:          { voided: true, edited_by: "SV-MD-001", edit_reason: "false reject" }
 * - Edit reject reason:     { reason: "Surface finish", edited_by: "SV-MD-001" }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ event_id: string }> }
) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/events/[event_id]", method: "PUT", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  const { event_id } = await params;
  if (!event_id) {
    return NextResponse.json(
      { status: "error", message: "event_id required" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logRequest({ route: "/api/events/[event_id]", method: "PUT", status: 400, latency_ms: elapsed(), note: "invalid-json" });
    return NextResponse.json(
      { status: "error", message: "invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = EditEventSchema.safeParse(body);
  if (!parsed.success) {
    logRequest({ route: "/api/events/[event_id]", method: "PUT", status: 400, latency_ms: elapsed(), note: "validation" });
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { reason, voided, edited_by, edit_reason } = parsed.data;

  // Must provide at least one of reason or voided
  if (reason === undefined && voided === undefined) {
    return NextResponse.json(
      { status: "error", message: "at least one of reason or voided is required" },
      { status: 400 }
    );
  }

  const sb = supabase();

  // Fetch the existing event
  const { data: event, error: fetchErr } = await sb
    .from("events")
    .select("event_id, payload")
    .eq("event_id", event_id)
    .single();

  if (fetchErr || !event) {
    logRequest({ route: "/api/events/[event_id]", method: "PUT", event_id, status: 404, latency_ms: elapsed(), note: "not-found" });
    return NextResponse.json(
      { status: "error", message: "Event not found" },
      { status: 404 }
    );
  }

  // Verify edited_by operator exists and is active
  const { data: editor, error: editorErr } = await sb
    .from("operators")
    .select("id")
    .eq("id", edited_by)
    .eq("active", true)
    .single();

  if (editorErr || !editor) {
    logRequest({ route: "/api/events/[event_id]", method: "PUT", event_id, status: 404, latency_ms: elapsed(), note: "editor-not-found" });
    return NextResponse.json(
      { status: "error", message: "edited_by operator not found" },
      { status: 404 }
    );
  }

  // Build the update
  const updateData: Record<string, unknown> = {
    edited_by,
  };

  if (edit_reason !== undefined) {
    updateData.edit_reason = edit_reason;
  }

  if (voided !== undefined) {
    updateData.voided = voided;
  }

  if (reason !== undefined) {
    // Merge reason into existing payload JSONB
    const existingPayload = (event.payload ?? {}) as Record<string, unknown>;
    updateData.payload = { ...existingPayload, reason };
  }

  const { error: updateErr } = await sb
    .from("events")
    .update(updateData)
    .eq("event_id", event_id);

  if (updateErr) {
    logRequest({ route: "/api/events/[event_id]", method: "PUT", event_id, status: 500, latency_ms: elapsed(), note: updateErr.message });
    return NextResponse.json(
      { status: "error", message: "update failed" },
      { status: 500 }
    );
  }

  logRequest({
    route: "/api/events/[event_id]",
    method: "PUT",
    event_id,
    status: 200,
    latency_ms: elapsed(),
    note: `by=${edited_by}${voided ? " voided" : ""}${reason ? ` reason=${reason}` : ""}`,
  });

  return NextResponse.json({ status: "ok", event_id });
}
