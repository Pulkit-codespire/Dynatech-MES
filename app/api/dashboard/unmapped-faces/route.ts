import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "50"), 1),
    200
  );

  const sb = supabase();

  // Get unmapped embeddings (profile_id IS NULL) with their source images
  const { data: embeddings, error } = await sb
    .from("face_embeddings")
    .select("id, source_image_id, machine_id, created_at")
    .is("profile_id", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  // Fetch image URLs for these embeddings
  const imageIds = (embeddings ?? [])
    .map((e) => e.source_image_id)
    .filter(Boolean);

  let imageMap = new Map<string, string>();
  if (imageIds.length > 0) {
    const { data: images } = await sb
      .from("machine_images")
      .select("id, public_url")
      .in("id", imageIds);

    imageMap = new Map((images ?? []).map((i) => [i.id, i.public_url]));
  }

  const result = (embeddings ?? []).map((e) => ({
    embedding_id: e.id,
    source_image_id: e.source_image_id,
    image_url: e.source_image_id
      ? imageMap.get(e.source_image_id) ?? null
      : null,
    machine_id: e.machine_id,
    created_at: e.created_at,
  }));

  return NextResponse.json({ status: "ok", unmapped_faces: result });
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

  // Only delete if unmapped (safety check)
  const { error } = await sb
    .from("face_embeddings")
    .delete()
    .eq("id", id)
    .is("profile_id", null);

  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "ok" });
}
