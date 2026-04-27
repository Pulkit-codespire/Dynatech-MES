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
    logRequest({ route: "/api/machine/config", method: "GET", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id");

  if (!machine_id) {
    logRequest({ route: "/api/machine/config", method: "GET", status: 400, latency_ms: elapsed(), note: "missing-machine_id" });
    return NextResponse.json(
      { status: "error", message: "machine_id query param required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase()
    .from("machines")
    .select("machine_id, name, shifts, lunch, breakdown_reasons, reject_reasons, lu_overtime_ms, beep_repeat_ms, capture_seconds")
    .eq("machine_id", machine_id)
    .eq("active", true)
    .single();

  if (error || !data) {
    const status = error?.code === "PGRST116" ? 404 : 500;
    logRequest({
      route: "/api/machine/config",
      method: "GET",
      machine_id,
      status,
      latency_ms: elapsed(),
      note: error?.message ?? "not found",
    });
    return NextResponse.json(
      { status: "error", message: status === 404 ? "machine not found" : "db query failed" },
      { status }
    );
  }

  logRequest({ route: "/api/machine/config", method: "GET", machine_id, status: 200, latency_ms: elapsed() });
  return NextResponse.json({ status: "ok", ...data });
}
