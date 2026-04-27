import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { logRequest, startTimer } from "@/lib/logger";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_THRESHOLD = 0.6;

export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({
      route: "/api/faces/recognize",
      method: "POST",
      status: 401,
      latency_ms: elapsed(),
    });
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

  const { extractDescriptor, descriptorToArray } = await import("@/lib/face");
  let descriptor: Float32Array | null;
  try {
    descriptor = await extractDescriptor(imageBuffer);
  } catch (e) {
    logRequest({
      route: "/api/faces/recognize",
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
    return NextResponse.json({
      status: "ok",
      recognized: false,
      reason: "no_face_detected",
    });
  }

  const sb = supabase();
  const embeddingArray = descriptorToArray(descriptor);

  const { data: matches, error: rpcErr } = await sb.rpc("match_face", {
    query_embedding: JSON.stringify(embeddingArray),
    match_threshold: threshold,
    match_count: 1,
  });

  if (rpcErr) {
    logRequest({
      route: "/api/faces/recognize",
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

  // Log result
  await sb.from("face_recognition_log").insert({
    matched_profile_id: best?.profile_id ?? null,
    confidence: best?.similarity ?? 0,
    threshold_used: threshold,
    recognized,
  });

  logRequest({
    route: "/api/faces/recognize",
    method: "POST",
    status: 200,
    latency_ms: elapsed(),
    note: recognized
      ? `matched=${best.label} conf=${best.similarity.toFixed(3)}`
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
      file.type || "image/jpeg"
    );

    return NextResponse.json({
      status: "ok",
      recognized: false,
      confidence: 0,
      unmapped_face_id: unmappedId,
    });
  }

  return NextResponse.json({
    status: "ok",
    recognized: true,
    label: best.label,
    name: best.name,
    confidence: best.similarity,
  });
}
