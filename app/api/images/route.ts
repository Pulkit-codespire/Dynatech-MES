import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkApiKey } from "@/lib/auth";
import { logRequest, startTimer } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "machine-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/images", method: "POST", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  let body: {
    machine_id?: unknown;
    image_base64?: unknown;
    content_type?: unknown;
    caption?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { status: "error", message: "invalid JSON body" },
      { status: 400 }
    );
  }

  const machine_id = String(body.machine_id ?? "").trim();
  let image_base64 = String(body.image_base64 ?? "").trim();
  let contentType = String(body.content_type ?? "").trim().toLowerCase();
  const caption = body.caption ? String(body.caption).trim() || null : null;

  if (!machine_id) {
    return NextResponse.json(
      { status: "error", message: "machine_id required" },
      { status: 400 }
    );
  }
  if (!image_base64) {
    return NextResponse.json(
      { status: "error", message: "image_base64 required" },
      { status: 400 }
    );
  }

  // Tolerate data URLs: "data:image/jpeg;base64,AAAA..."
  const dataUrlMatch = /^data:([\w/.+-]+);base64,(.*)$/i.exec(image_base64);
  if (dataUrlMatch) {
    if (!contentType) contentType = dataUrlMatch[1].toLowerCase();
    image_base64 = dataUrlMatch[2];
  }
  // Strip whitespace/newlines that sometimes sneak in
  image_base64 = image_base64.replace(/\s+/g, "");

  if (!contentType) contentType = "image/jpeg"; // default for device cameras
  if (!ALLOWED.has(contentType)) {
    return NextResponse.json(
      { status: "error", message: `unsupported content-type: ${contentType}` },
      { status: 415 }
    );
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(image_base64, "base64");
  } catch {
    return NextResponse.json(
      { status: "error", message: "image_base64 is not valid base64" },
      { status: 400 }
    );
  }
  if (bytes.length === 0) {
    return NextResponse.json(
      { status: "error", message: "decoded image is empty" },
      { status: 400 }
    );
  }
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json(
      { status: "error", message: `image exceeds max size ${MAX_BYTES} bytes` },
      { status: 413 }
    );
  }

  const ext = contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
  const safeMachine = machine_id.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storage_path = `${safeMachine}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const sb = supabase();

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(storage_path, bytes, {
      contentType,
      upsert: false,
    });

  if (upErr) {
    logRequest({
      route: "/api/images",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: `storage: ${upErr.message}`,
    });
    return NextResponse.json(
      { status: "error", message: `storage upload failed: ${upErr.message}` },
      { status: 500 }
    );
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storage_path);
  const public_url = pub.publicUrl;

  const { data: row, error: insErr } = await sb
    .from("machine_images")
    .insert({
      machine_id,
      storage_path,
      public_url,
      content_type: contentType,
      size_bytes: bytes.length,
      caption,
    })
    .select("id, machine_id, storage_path, public_url, content_type, size_bytes, caption, uploaded_at")
    .single();

  if (insErr) {
    // best-effort: remove uploaded blob so we don't leak orphans
    await sb.storage.from(BUCKET).remove([storage_path]);
    logRequest({
      route: "/api/images",
      method: "POST",
      status: 500,
      latency_ms: elapsed(),
      note: `db: ${insErr.message}`,
    });
    return NextResponse.json(
      { status: "error", message: `db insert failed: ${insErr.message}` },
      { status: 500 }
    );
  }

  logRequest({
    route: "/api/images",
    method: "POST",
    status: 200,
    latency_ms: elapsed(),
    note: `machine=${machine_id} bytes=${bytes.length}`,
  });
  return NextResponse.json({ status: "ok", image: row });
}

export async function GET(req: Request) {
  const elapsed = startTimer();
  const authFail = checkApiKey(req);
  if (authFail) {
    logRequest({ route: "/api/images", method: "GET", status: 401, latency_ms: elapsed() });
    return authFail;
  }

  const url = new URL(req.url);
  const machine_id = url.searchParams.get("machine_id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 200);

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

  logRequest({ route: "/api/images", method: "GET", status: 200, latency_ms: elapsed(), count: data?.length ?? 0 });
  return NextResponse.json({ status: "ok", images: data ?? [] });
}
