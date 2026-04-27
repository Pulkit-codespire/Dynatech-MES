import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns pending face training images grouped by operator.
 * Images uploaded by devices via POST /api/faces/train-bulk are stored
 * with machine_id = 'face-pending:{operator_id}' until trained.
 */
export async function GET() {
  const sb = supabase();

  // Fetch all pending training images
  const { data: images, error } = await sb
    .from("machine_images")
    .select("id, machine_id, public_url, content_type, size_bytes, caption, uploaded_at")
    .like("machine_id", "face-pending:%")
    .order("uploaded_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }

  // Extract unique operator IDs from machine_id prefix
  const operatorIds = [
    ...new Set((images ?? []).map((img) => img.machine_id.replace("face-pending:", ""))),
  ];

  // Look up operator names from the operators table
  const nameMap = new Map<string, string>();
  if (operatorIds.length > 0) {
    const { data: operators } = await sb
      .from("operators")
      .select("id, name")
      .in("id", operatorIds);

    for (const op of operators ?? []) {
      nameMap.set(op.id, op.name);
    }
  }

  // Group images by operator_id
  const grouped = new Map<string, {
    operator_id: string;
    operator_name: string;
    images: typeof images;
  }>();

  for (const img of images ?? []) {
    const operatorId = img.machine_id.replace("face-pending:", "");
    if (!grouped.has(operatorId)) {
      grouped.set(operatorId, {
        operator_id: operatorId,
        operator_name: nameMap.get(operatorId) ?? operatorId,
        images: [],
      });
    }
    grouped.get(operatorId)!.images.push(img);
  }

  return NextResponse.json({
    status: "ok",
    pending: Array.from(grouped.values()),
  });
}
