import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logRequest, startTimer } from "@/lib/logger";
import { TrainFaceSchema } from "@/lib/validation";
import { extractDescriptor, descriptorToArray } from "@/lib/face";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "machine-images";

export async function POST(req: Request) {
  const elapsed = startTimer();

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { status: "error", message: "multipart/form-data required" },
      { status: 400 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { status: "error", message: "could not parse form" },
      { status: 400 }
    );
  }

  const file = form.get("image");
  const rawName = String(form.get("name") ?? "").trim();
  const rawLabel = String(form.get("label") ?? "").trim();
  const rawEmployeeId = String(form.get("employee_id") ?? "").trim() || undefined;
  const rawNotes = String(form.get("notes") ?? "").trim() || undefined;

  const parsed = TrainFaceSchema.safeParse({
    name: rawName,
    label: rawLabel,
    employee_id: rawEmployeeId,
    notes: rawNotes,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { status: "error", message: "image file required" },
      { status: 400 }
    );
  }

  const imageBuffer = Buffer.from(await file.arrayBuffer());

  let descriptor: Float32Array | null;
  try {
    descriptor = await extractDescriptor(imageBuffer);
  } catch (e) {
    logRequest({
      route: "/api/faces/train",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: String(e),
    });
    return NextResponse.json(
      { status: "error", message: "face extraction failed" },
      { status: 500 }
    );
  }

  if (!descriptor) {
    return NextResponse.json(
      { status: "error", message: "no face detected in image" },
      { status: 422 }
    );
  }

  const sb = supabase();
  const { name, label, employee_id, notes } = parsed.data;

  // Upsert profile (create or reuse existing by label)
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
      route: "/api/faces/train",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: profileErr?.message,
    });
    return NextResponse.json(
      { status: "error", message: "profile upsert failed" },
      { status: 500 }
    );
  }

  // Store training image in Supabase Storage
  const ext =
    (file.type || "image/jpeg").split("/")[1]?.replace(/[^a-z0-9]/gi, "") ||
    "jpg";
  const storagePath = `face-training/${label}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  let sourceImageId: string | null = null;

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });

  if (!uploadErr) {
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    const { data: imgRow } = await sb
      .from("machine_images")
      .insert({
        machine_id: `face-training:${label}`,
        storage_path: storagePath,
        public_url: pub.publicUrl,
        content_type: file.type,
        size_bytes: file.size,
        caption: `Training: ${name}`,
      })
      .select("id")
      .single();
    sourceImageId = imgRow?.id ?? null;
  }

  // Insert embedding
  const embeddingArray = descriptorToArray(descriptor);
  const { data: embRow, error: embErr } = await sb
    .from("face_embeddings")
    .insert({
      profile_id: profile.id,
      embedding: JSON.stringify(embeddingArray),
      source_image_id: sourceImageId,
    })
    .select("id")
    .single();

  if (embErr) {
    logRequest({
      route: "/api/faces/train",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: embErr.message,
    });
    return NextResponse.json(
      { status: "error", message: "embedding insert failed" },
      { status: 500 }
    );
  }

  logRequest({
    route: "/api/faces/train",
    method: "POST",
    status: 200,
    latency_ms: elapsed(),
    note: `label=${label}`,
  });
  return NextResponse.json({
    status: "ok",
    profile_id: profile.id,
    label,
    embedding_id: embRow.id,
  });
}
