import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logRequest, startTimer } from "@/lib/logger";
import { TrainFaceSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const elapsed = startTimer();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "error", message: "invalid JSON body" },
      { status: 400 }
    );
  }

  const embeddingId = String(body.embedding_id ?? "").trim();
  if (!embeddingId) {
    return NextResponse.json(
      { status: "error", message: "embedding_id required" },
      { status: 400 }
    );
  }

  const parsed = TrainFaceSchema.safeParse({
    name: body.name,
    label: body.label,
    employee_id: body.employee_id || undefined,
    notes: body.notes || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sb = supabase();
  const { name, label, employee_id, notes } = parsed.data;

  // Verify the embedding exists and is unmapped
  const { data: emb, error: embErr } = await sb
    .from("face_embeddings")
    .select("id, profile_id")
    .eq("id", embeddingId)
    .single();

  if (embErr || !emb) {
    return NextResponse.json(
      { status: "error", message: "embedding not found" },
      { status: 404 }
    );
  }
  if (emb.profile_id) {
    return NextResponse.json(
      { status: "error", message: "embedding already mapped" },
      { status: 409 }
    );
  }

  // Upsert profile (reuse existing by label, same pattern as /api/faces/train)
  const upsertData: Record<string, unknown> = {
    name,
    label,
    notes,
    updated_at: new Date().toISOString(),
  };
  if (employee_id) upsertData.employee_id = employee_id;

  const { data: profile, error: profileErr } = await sb
    .from("face_profiles")
    .upsert(upsertData, { onConflict: "label" })
    .select("id")
    .single();

  if (profileErr || !profile) {
    logRequest({
      route: "/api/faces/map",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: profileErr?.message,
    });
    return NextResponse.json(
      { status: "error", message: `profile upsert failed: ${profileErr?.message}` },
      { status: 500 }
    );
  }

  // Link embedding to profile
  const { error: updateErr } = await sb
    .from("face_embeddings")
    .update({ profile_id: profile.id })
    .eq("id", embeddingId);

  if (updateErr) {
    logRequest({
      route: "/api/faces/map",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: updateErr.message,
    });
    return NextResponse.json(
      { status: "error", message: "failed to map embedding" },
      { status: 500 }
    );
  }

  logRequest({
    route: "/api/faces/map",
    method: "POST",
    status: 200,
    latency_ms: elapsed(),
    note: `mapped embedding=${embeddingId} to label=${label}`,
  });

  return NextResponse.json({
    status: "ok",
    profile_id: profile.id,
    label,
    embedding_id: embeddingId,
  });
}
