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
    logRequest({ route: "/api/parts", method: "GET", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id");

  let query = supabase()
    .from("parts")
    .select("part_number, description, setup, target_secs, machine_id")
    .eq("active", true)
    .order("part_number");

  if (machine_id) {
    query = query.eq("machine_id", machine_id);
  }

  const { data, error } = await query;

  if (error) {
    logRequest({ route: "/api/parts", method: "GET", status: 500, latency_ms: elapsed(), note: error.message });
    return NextResponse.json({ status: "error", message: "db query failed" }, { status: 500 });
  }

  logRequest({ route: "/api/parts", method: "GET", status: 200, latency_ms: elapsed(), count: data?.length ?? 0 });
  return NextResponse.json({ status: "ok", parts: data ?? [] });
}
