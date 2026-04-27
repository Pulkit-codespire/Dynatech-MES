import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { logRequest, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/operators", method: "GET", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  const sb = supabase();

  const [opsResult, assignResult] = await Promise.all([
    sb.from("operators").select("id, name, role").eq("active", true).order("name"),
    sb.from("operator_assignments").select("operator_id, machine_id, part_number").eq("active", true),
  ]);

  if (opsResult.error) {
    logRequest({ route: "/api/operators", method: "GET", status: 500, latency_ms: elapsed(), note: opsResult.error.message });
    return NextResponse.json({ status: "error", message: "db query failed" }, { status: 500 });
  }

  const operators = opsResult.data ?? [];
  const assignments = assignResult.data ?? [];

  // Fetch target_secs for assigned parts
  const partNumbers = [...new Set(assignments.map((a) => a.part_number))];
  let partMap = new Map<string, number>();
  if (partNumbers.length > 0) {
    const { data: parts } = await sb
      .from("parts")
      .select("part_number, target_secs")
      .in("part_number", partNumbers);
    partMap = new Map((parts ?? []).map((p) => [p.part_number, p.target_secs]));
  }

  // Build assignment lookup by operator_id
  const assignMap = new Map(
    assignments.map((a) => [
      a.operator_id,
      {
        machine_id: a.machine_id,
        part_number: a.part_number,
        target_secs: partMap.get(a.part_number) ?? 0,
      },
    ])
  );

  const enriched = operators.map((op) => ({
    ...op,
    assignment: assignMap.get(op.id) ?? null,
  }));

  logRequest({ route: "/api/operators", method: "GET", status: 200, latency_ms: elapsed(), count: operators.length });
  return NextResponse.json({ status: "ok", operators: enriched });
}
