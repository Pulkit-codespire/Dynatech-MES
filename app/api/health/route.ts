import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let db: "ok" | "error" = "ok";
  let dbError: string | undefined;

  try {
    const { error } = await supabase()
      .from("events")
      .select("event_id")
      .limit(1);
    if (error) {
      db = "error";
      dbError = error.message;
    }
  } catch (e) {
    db = "error";
    dbError = e instanceof Error ? e.message : String(e);
  }

  const code = db === "ok" ? 200 : 503;
  return NextResponse.json(
    {
      status: db === "ok" ? "ok" : "degraded",
      code,
      db,
      db_error: dbError,
      latency_ms: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    { status: code }
  );
}
