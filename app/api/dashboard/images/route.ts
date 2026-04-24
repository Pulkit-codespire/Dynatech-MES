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

  // Enrich with recognition data
  const imageIds = (data ?? []).map((d) => d.id);
  let recognitionMap = new Map<string, { name: string; confidence: number }>();

  if (imageIds.length > 0) {
    const { data: logs } = await sb
      .from("face_recognition_log")
      .select("image_id, confidence, recognized, matched_profile_id")
      .in("image_id", imageIds)
      .eq("recognized", true);

    if (logs && logs.length > 0) {
      const profileIds = [...new Set(logs.map((l) => l.matched_profile_id).filter(Boolean))];
      const { data: profiles } = await sb
        .from("face_profiles")
        .select("id, name")
        .in("id", profileIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));

      for (const log of logs) {
        if (log.matched_profile_id && !recognitionMap.has(log.image_id)) {
          recognitionMap.set(log.image_id, {
            name: profileMap.get(log.matched_profile_id) ?? "Unknown",
            confidence: log.confidence,
          });
        }
      }
    }
  }

  const images = (data ?? []).map((d) => {
    const rec = recognitionMap.get(d.id);
    return {
      ...d,
      recognized_name: rec?.name ?? null,
      recognition_confidence: rec?.confidence ?? null,
    };
  });

  return NextResponse.json({
    status: "ok",
    server_time: new Date().toISOString(),
    images,
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
