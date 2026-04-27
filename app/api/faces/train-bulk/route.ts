import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { logRequest, startTimer } from "@/lib/logger";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "machine-images";

const UploadSchema = z.object({
  operator_id: z.string().min(1).max(64),
  image: z.string().min(1),
  content_type: z.string().optional(),
});

/**
 * Device upload endpoint: stores a single face image for an operator.
 * Device sends one request per image (5-6 times for different angles).
 * Images are marked as "pending" — training is triggered separately
 * from the dashboard via POST /api/faces/train-stored.
 *
 * Body (JSON):
 *   { "operator_id": "OP-RK-042", "image": "<base64>", "content_type": "image/jpeg" }
 */
export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/faces/train-bulk", method: "POST", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    logRequest({ route: "/api/faces/train-bulk", method: "POST", status: 400, latency_ms: elapsed(), note: "invalid-json" });
    return NextResponse.json(
      { status: "error", message: "invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = UploadSchema.safeParse(body);
  if (!parsed.success) {
    logRequest({ route: "/api/faces/train-bulk", method: "POST", status: 400, latency_ms: elapsed(), note: "validation" });
    return NextResponse.json(
      { status: "error", message: "validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { operator_id, image: base64Image, content_type } = parsed.data;

  // Decode base64 image
  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(base64Image, "base64");
  } catch {
    logRequest({ route: "/api/faces/train-bulk", method: "POST", status: 400, latency_ms: elapsed(), note: "bad-base64" });
    return NextResponse.json(
      { status: "error", message: "invalid base64 image data" },
      { status: 400 }
    );
  }

  if (imageBuffer.length === 0) {
    logRequest({ route: "/api/faces/train-bulk", method: "POST", status: 400, latency_ms: elapsed(), note: "empty-image" });
    return NextResponse.json(
      { status: "error", message: "empty image data" },
      { status: 400 }
    );
  }

  const sb = supabase();

  // Verify operator exists
  const { data: operator, error: opErr } = await sb
    .from("operators")
    .select("id, name")
    .eq("id", operator_id)
    .eq("active", true)
    .single();

  if (opErr || !operator) {
    logRequest({
      route: "/api/faces/train-bulk",
      method: "POST",
      status: 404,
      latency_ms: elapsed(),
      note: "operator-not-found",
    });
    return NextResponse.json(
      { status: "error", message: "operator not found" },
      { status: 404 }
    );
  }

  // Determine file extension from content_type
  const mime = content_type || "image/jpeg";
  const ext = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const storagePath = `face-pending/${operator_id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  // Upload to Supabase storage
  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(storagePath, imageBuffer, {
      contentType: mime,
      upsert: false,
    });

  if (uploadErr) {
    logRequest({
      route: "/api/faces/train-bulk",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: uploadErr.message,
    });
    return NextResponse.json(
      { status: "error", message: "storage upload failed" },
      { status: 500 }
    );
  }

  // Insert machine_images row
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
  const { data: imgRow, error: imgErr } = await sb
    .from("machine_images")
    .insert({
      machine_id: `face-pending:${operator_id}`,
      storage_path: storagePath,
      public_url: pub.publicUrl,
      content_type: mime,
      size_bytes: imageBuffer.length,
      caption: `Pending: ${operator.name}`,
    })
    .select("id")
    .single();

  if (imgErr || !imgRow) {
    logRequest({
      route: "/api/faces/train-bulk",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: imgErr?.message ?? "db insert failed",
    });
    return NextResponse.json(
      { status: "error", message: "db insert failed" },
      { status: 500 }
    );
  }

  logRequest({
    route: "/api/faces/train-bulk",
    method: "POST",
    status: 200,
    latency_ms: elapsed(),
    note: `operator=${operator_id} image=${imgRow.id}`,
  });

  return NextResponse.json({
    status: "ok",
    operator_id,
    operator_name: operator.name,
    image_id: imgRow.id,
  });
}
