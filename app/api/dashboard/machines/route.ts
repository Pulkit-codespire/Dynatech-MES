import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id");
  if (!machine_id) {
    return NextResponse.json(
      { status: "error", message: "machine_id query param required" },
      { status: 400 }
    );
  }

  const { error, count } = await supabase()
    .from("events")
    .delete({ count: "exact" })
    .eq("machine_id", machine_id);

  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "ok",
    machine_id,
    deleted: count ?? 0,
  });
}
