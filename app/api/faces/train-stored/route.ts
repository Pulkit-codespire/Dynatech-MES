import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logRequest, startTimer } from "@/lib/logger";
import { extractDescriptor, descriptorToArray } from "@/lib/face";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "machine-images";

type TrainResult = {
  image_id: string;
  status: "ok" | "failed";
  reason?: string;
  embedding_id?: string;
};

/**
 * Triggers face training from previously uploaded (pending) images.
 * Called from the dashboard after the device has uploaded images
 * via POST /api/faces/train-bulk.
 *
 * Body: { operator_id: string }
 */
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

  const operatorId = String(body.operator_id ?? "").trim();
  if (!operatorId) {
    return NextResponse.json(
      { status: "error", message: "operator_id required" },
      { status: 400 }
    );
  }

  const sb = supabase();

  // Verify operator
  const { data: operator, error: opErr } = await sb
    .from("operators")
    .select("id, name")
    .eq("id", operatorId)
    .eq("active", true)
    .single();

  if (opErr || !operator) {
    return NextResponse.json(
      { status: "error", message: "operator not found" },
      { status: 404 }
    );
  }

  // Fetch pending images for this operator
  const { data: pendingImages, error: imgErr } = await sb
    .from("machine_images")
    .select("id, storage_path, public_url, content_type")
    .eq("machine_id", `face-pending:${operatorId}`)
    .order("uploaded_at", { ascending: true });

  if (imgErr) {
    return NextResponse.json(
      { status: "error", message: imgErr.message },
      { status: 500 }
    );
  }

  if (!pendingImages || pendingImages.length === 0) {
    return NextResponse.json(
      { status: "error", message: "no pending images found for this operator" },
      { status: 404 }
    );
  }

  // Derive profile fields from operator
  const name = operator.name;
  const label = operator.id.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const employee_id = operator.id;

  // Upsert face profile
  const { data: profile, error: profileErr } = await sb
    .from("face_profiles")
    .upsert(
      {
        name,
        label,
        employee_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "label" }
    )
    .select("id")
    .single();

  if (profileErr || !profile) {
    logRequest({
      route: "/api/faces/train-stored",
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

  // Process each image: download from storage → extract descriptor → store embedding
  const results: TrainResult[] = [];

  for (const img of pendingImages) {
    try {
      // Download image from Supabase storage
      const { data: fileData, error: dlErr } = await sb.storage
        .from(BUCKET)
        .download(img.storage_path);

      if (dlErr || !fileData) {
        results.push({ image_id: img.id, status: "failed", reason: dlErr?.message ?? "download failed" });
        continue;
      }

      const imageBuffer = Buffer.from(await fileData.arrayBuffer());
      const descriptor = await extractDescriptor(imageBuffer);

      if (!descriptor) {
        results.push({ image_id: img.id, status: "failed", reason: "no face detected" });
        continue;
      }

      // Insert embedding
      const embeddingArray = descriptorToArray(descriptor);
      const { data: embRow, error: embErr } = await sb
        .from("face_embeddings")
        .insert({
          profile_id: profile.id,
          embedding: JSON.stringify(embeddingArray),
          source_image_id: img.id,
          machine_id: `face-training:${label}`,
        })
        .select("id")
        .single();

      if (embErr) {
        results.push({ image_id: img.id, status: "failed", reason: embErr.message });
      } else {
        results.push({ image_id: img.id, status: "ok", embedding_id: embRow.id });
      }
    } catch (e) {
      results.push({ image_id: img.id, status: "failed", reason: String(e) });
    }
  }

  // Move successfully processed images from face-pending to face-training
  const processedIds = results
    .filter((r) => r.status === "ok")
    .map((r) => r.image_id);

  if (processedIds.length > 0) {
    await sb
      .from("machine_images")
      .update({
        machine_id: `face-training:${label}`,
        caption: `Training: ${name}`,
      })
      .in("id", processedIds);
  }

  // Also move failed images (they've been attempted)
  const failedIds = results
    .filter((r) => r.status === "failed")
    .map((r) => r.image_id);

  if (failedIds.length > 0) {
    await sb
      .from("machine_images")
      .update({
        machine_id: `face-training:${label}`,
        caption: `Training (failed): ${name}`,
      })
      .in("id", failedIds);
  }

  const processed = processedIds.length;
  const failed = failedIds.length;

  logRequest({
    route: "/api/faces/train-stored",
    method: "POST",
    status: 200,
    latency_ms: elapsed(),
    note: `label=${label} processed=${processed} failed=${failed}`,
  });

  return NextResponse.json({
    status: "ok",
    profile_id: profile.id,
    label,
    operator_name: name,
    results,
    processed,
    failed,
    embedding_ids: results
      .filter((r) => r.status === "ok" && r.embedding_id)
      .map((r) => r.embedding_id),
  });
}
