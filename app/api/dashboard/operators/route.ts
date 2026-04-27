import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = supabase();

  const { data: operators, error } = await sb
    .from("operators")
    .select("id, name, role")
    .eq("active", true)
    .order("name");

  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "ok",
    operators: operators ?? [],
  });
}
