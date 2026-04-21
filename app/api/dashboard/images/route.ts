import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "24"), 1), 100);

  const sb = supabase();
  let q = sb
    .from("machine_images")
    .select("id, machine_id, public_url, content_type, size_bytes, caption, uploaded_at")
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (machine_id) q = q.eq("machine_id", machine_id);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "ok",
    server_time: new Date().toISOString(),
    images: data ?? [],
  });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { status: "error", message: "id required" },
      { status: 400 }
    );
  }

  const sb = supabase();
  const { data: existing, error: selErr } = await sb
    .from("machine_images")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (selErr || !existing) {
    return NextResponse.json(
      { status: "error", message: selErr?.message ?? "not found" },
      { status: 404 }
    );
  }

  await sb.storage.from("machine-images").remove([existing.storage_path]);
  const { error: delErr } = await sb.from("machine_images").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { status: "error", message: delErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "ok" });
}
