import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { logRequest, startTimer } from "@/lib/logger";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  operator_id: z.string().min(1).max(64).optional(),
  pin: z.string().min(1).max(16),
  machine_id: z.string().min(1).max(64),
  shift: z.string().min(1).max(8).optional(),
  ts: z.string().optional(),
});

export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/auth/login", method: "POST", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logRequest({ route: "/api/auth/login", method: "POST", status: 400, latency_ms: elapsed(), note: "invalid-json" });
    return NextResponse.json({ status: "error", message: "invalid JSON body" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    logRequest({ route: "/api/auth/login", method: "POST", status: 400, latency_ms: elapsed(), note: "validation" });
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { operator_id, pin, machine_id, shift } = parsed.data;

  // Lookup operator: by ID if provided, otherwise by PIN match
  let operator: { id: string; name: string; role: string; pin_hash: string } | null = null;

  if (operator_id) {
    const { data, error } = await supabase()
      .from("operators")
      .select("id, name, role, pin_hash")
      .eq("id", operator_id)
      .eq("active", true)
      .single();
    if (!error && data) operator = data;
  } else {
    // Find operator by PIN (plain-text for dev — use bcrypt in prod)
    const { data, error } = await supabase()
      .from("operators")
      .select("id, name, role, pin_hash")
      .eq("pin_hash", pin)
      .eq("active", true)
      .limit(1)
      .single();
    if (!error && data) operator = data;
  }

  if (!operator) {
    logRequest({ route: "/api/auth/login", method: "POST", status: 404, latency_ms: elapsed(), note: "operator-not-found" });
    return NextResponse.json(
      { status: "error", message: "operator not found" },
      { status: 404 }
    );
  }

  // Verify PIN when operator_id was provided (plain-text for dev — swap to bcrypt.compare() in prod)
  if (operator_id && pin !== operator.pin_hash) {
    logRequest({ route: "/api/auth/login", method: "POST", status: 401, latency_ms: elapsed(), note: "invalid-pin" });
    return NextResponse.json(
      { status: "error", message: "invalid PIN" },
      { status: 401 }
    );
  }

  // Fetch active assignment for this operator
  const { data: assignment } = await supabase()
    .from("operator_assignments")
    .select("machine_id, part_number")
    .eq("operator_id", operator.id)
    .eq("active", true)
    .single();

  let assignmentResponse = null;
  if (assignment) {
    const [{ data: machine }, { data: part }] = await Promise.all([
      supabase()
        .from("machines")
        .select("name")
        .eq("machine_id", assignment.machine_id)
        .single(),
      supabase()
        .from("parts")
        .select("description, target_secs")
        .eq("part_number", assignment.part_number)
        .single(),
    ]);
    assignmentResponse = {
      machine_id: assignment.machine_id,
      machine_name: machine?.name ?? assignment.machine_id,
      part_number: assignment.part_number,
      part_description: part?.description ?? assignment.part_number,
      target_secs: part?.target_secs ?? 0,
    };
  }

  // Record session
  const { error: sessErr } = await supabase()
    .from("auth_sessions")
    .insert({ operator_id: operator.id, machine_id, shift: shift ?? "" });

  if (sessErr) {
    logRequest({ route: "/api/auth/login", method: "POST", status: 500, latency_ms: elapsed(), note: sessErr.message });
    return NextResponse.json({ status: "error", message: "db insert failed" }, { status: 500 });
  }

  const { pin_hash: _, ...safeOperator } = operator;
  logRequest({ route: "/api/auth/login", method: "POST", machine_id, status: 200, latency_ms: elapsed() });
  return NextResponse.json({ status: "ok", message: "Logged in", operator: safeOperator, assignment: assignmentResponse });
}
