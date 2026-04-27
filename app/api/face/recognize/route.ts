import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { logRequest, startTimer } from "@/lib/logger";
import { extractDescriptor, descriptorToArray } from "@/lib/face";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_THRESHOLD = 0.6;
const BUCKET = "machine-images";

/** Upload image to storage + machine_images table, return row id */
async function saveImage(
  sb: ReturnType<typeof supabase>,
  imageBuffer: Buffer,
  machine_id: string,
  contentType: string
): Promise<{ id: string; public_url: string } | null> {
  const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const safeMachine = machine_id.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${safeMachine}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, imageBuffer, { contentType, upsert: false });

  if (upErr) {
    console.error(JSON.stringify({ t: new Date().toISOString(), note: `image upload error: ${upErr.message}` }));
    return null;
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data: row, error: insErr } = await sb
    .from("machine_images")
    .insert({
      machine_id,
      storage_path: storagePath,
      public_url: pub.publicUrl,
      content_type: contentType,
      size_bytes: imageBuffer.length,
      caption: null,
    })
    .select("id, public_url")
    .single();

  if (insErr) {
    console.error(JSON.stringify({ t: new Date().toISOString(), note: `image db insert error: ${insErr.message}` }));
    return null;
  }

  return row;
}

export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/face/recognize", method: "POST", status: 401, latency_ms: elapsed() });
    return authFail;
  }

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
  const machine_id = String(form.get("machine_id") ?? "").trim() || "unknown";
  const thresholdRaw =
    parseFloat(String(form.get("threshold") ?? "")) || DEFAULT_THRESHOLD;
  const threshold = Math.min(Math.max(thresholdRaw, 0.1), 0.99);

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { status: "error", message: "image file required" },
      { status: 400 }
    );
  }

  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "image/jpeg";
  const sb = supabase();

  // Always save image to dashboard
  const savedImage = await saveImage(sb, imageBuffer, machine_id, contentType);

  // Try face detection
  let descriptor: Float32Array | null;
  try {
    descriptor = await extractDescriptor(imageBuffer);
  } catch (e) {
    logRequest({
      route: "/api/face/recognize",
      method: "POST",
      status: 200,
      latency_ms: elapsed(),
      note: `face_extraction_error: ${String(e)}`,
    });
    return NextResponse.json({
      recognized: false,
      reason: "face_extraction_error",
      image_id: savedImage?.id ?? null,
    });
  }

  if (!descriptor) {
    logRequest({
      route: "/api/face/recognize",
      method: "POST",
      status: 200,
      latency_ms: elapsed(),
      note: `no_face_detected machine=${machine_id} image_saved=${!!savedImage}`,
    });
    return NextResponse.json({
      recognized: false,
      reason: "no_face_detected",
      image_id: savedImage?.id ?? null,
    });
  }

  // Face detected — try to match
  const embeddingArray = descriptorToArray(descriptor);

  const { data: matches, error: rpcErr } = await sb.rpc("match_face", {
    query_embedding: JSON.stringify(embeddingArray),
    match_threshold: threshold,
    match_count: 1,
  });

  if (rpcErr) {
    logRequest({
      route: "/api/face/recognize",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: rpcErr.message,
    });
    return NextResponse.json(
      { status: "error", message: "recognition query failed" },
      { status: 500 }
    );
  }

  const best = matches?.[0] ?? null;
  const recognized = !!best;

  // Log recognition result
  await sb.from("face_recognition_log").insert({
    image_id: savedImage?.id ?? null,
    matched_profile_id: best?.profile_id ?? null,
    confidence: best?.similarity ?? 0,
    threshold_used: threshold,
    recognized,
  });

  logRequest({
    route: "/api/face/recognize",
    method: "POST",
    status: 200,
    latency_ms: elapsed(),
    note: recognized
      ? `matched=${best.name} emp=${best.employee_id} conf=${best.similarity.toFixed(3)}`
      : `no_match machine=${machine_id}`,
  });

  if (!recognized) {
    // Save unmapped face for later mapping from dashboard
    const { saveUnmappedFace } = await import("@/lib/unmapped-face");
    const unmappedId = await saveUnmappedFace(
      sb,
      descriptor,
      imageBuffer,
      machine_id,
      contentType,
      savedImage?.id // reuse already-saved image
    );

    return NextResponse.json({
      recognized: false,
      unmapped_face_id: unmappedId,
      image_id: savedImage?.id ?? null,
    });
  }

  return NextResponse.json({
    recognized: true,
    name: best.name,
    employee_id: best.employee_id ?? null,
    confidence: Math.round(best.similarity * 100) / 100,
    image_id: savedImage?.id ?? null,
  });
}
