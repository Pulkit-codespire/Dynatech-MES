import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = supabase();

  const { data: profiles, error } = await sb
    .from("face_profiles")
    .select("id, name, label, employee_id, notes, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  // Count embeddings per profile
  const { data: counts } = await sb
    .from("face_embeddings")
    .select("profile_id")
    .then(async ({ data }) => {
      const map = new Map<string, number>();
      for (const row of data ?? []) {
        map.set(row.profile_id, (map.get(row.profile_id) ?? 0) + 1);
      }
      return { data: map };
    });

  const result = (profiles ?? []).map((p) => ({
    ...p,
    embedding_count: counts?.get(p.id) ?? 0,
  }));

  return NextResponse.json({ status: "ok", profiles: result });
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

  // Cascade deletes face_embeddings automatically via FK
  const { error } = await sb.from("face_profiles").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "ok" });
}
