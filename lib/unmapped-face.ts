import { SupabaseClient } from "@supabase/supabase-js";
import { descriptorToArray, FaceDescriptor } from "@/lib/face";

const BUCKET = "machine-images";

/**
 * Save an unmapped face: optionally upload the image, then insert a
 * face_embeddings row with profile_id = NULL.
 *
 * @param existingImageId  If the image is already stored (e.g. from /api/images),
 *                         pass its id to skip the upload.
 * @returns  The embedding row id, or null on failure.
 */
export async function saveUnmappedFace(
  sb: SupabaseClient,
  descriptor: FaceDescriptor,
  imageBuffer: Buffer,
  machine_id: string,
  contentType: string,
  existingImageId?: string
): Promise<string | null> {
  let sourceImageId = existingImageId ?? null;

  // Upload image if not already stored
  if (!sourceImageId) {
    const ext =
      contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
    const safeMachine = machine_id.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `unmapped-faces/${safeMachine}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(storagePath, imageBuffer, { contentType, upsert: false });

    if (upErr) {
      console.error(
        JSON.stringify({
          t: new Date().toISOString(),
          note: `unmapped face upload error: ${upErr.message}`,
        })
      );
      return null;
    }

    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(storagePath);
    const { data: imgRow } = await sb
      .from("machine_images")
      .insert({
        machine_id: `unmapped-face:${machine_id}`,
        storage_path: storagePath,
        public_url: pub.publicUrl,
        content_type: contentType,
        size_bytes: imageBuffer.length,
        caption: "Unmapped face",
      })
      .select("id")
      .single();

    sourceImageId = imgRow?.id ?? null;
  }

  // Insert embedding with profile_id = NULL (unmapped)
  const embeddingArray = descriptorToArray(descriptor);
  const { data: embRow, error: embErr } = await sb
    .from("face_embeddings")
    .insert({
      profile_id: null,
      embedding: JSON.stringify(embeddingArray),
      source_image_id: sourceImageId,
      machine_id,
    })
    .select("id")
    .single();

  if (embErr) {
    console.error(
      JSON.stringify({
        t: new Date().toISOString(),
        note: `unmapped embedding insert error: ${embErr.message}`,
      })
    );
    return null;
  }

  return embRow?.id ?? null;
}
