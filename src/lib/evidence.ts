import { db } from "@/lib/db";
import { EVIDENCE } from "@/lib/ward109";

export type PreparedFile = {
  key: string;
  file: Blob;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  previewUrl: string | null;
};

const MAX_EDGE = 1600;

export function validateEvidence(file: File): string | null {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  if (!isImage && !isPdf) return `${file.name}: only photos and PDF documents can be attached.`;
  if (isPdf && file.size > EVIDENCE.maxBytes) return `${file.name}: PDFs must be 10 MB or smaller.`;
  return null;
}

// Re-draws photos onto a canvas: strips EXIF (including GPS location), fixes orientation and
// downsizes to MAX_EDGE so uploads stay small on mobile data. PDFs are uploaded unchanged.
export async function prepareEvidence(file: File): Promise<PreparedFile> {
  const key = crypto.randomUUID();
  if (file.type === "application/pdf") {
    return { key, file, name: file.name, mimeType: "application/pdf", previewUrl: null };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name}: this photo format can't be read. Please use JPG or PNG.`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new Error(`${file.name}: the photo could not be processed.`);
  if (blob.size > EVIDENCE.maxBytes) throw new Error(`${file.name}: the photo is too large.`);
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { key, file: blob, name, mimeType: "image/jpeg", previewUrl: URL.createObjectURL(blob) };
}

// Storage path must be `<complaint id>/<random>.<ext>` (enforced by the bucket policy).
// The attachment row is written first: the bucket's read rule only exposes files that have a
// row the viewer may see, and Storage checks that rule when it saves the upload.
export async function uploadEvidence(complaintId: string, userId: string, item: PreparedFile) {
  const ext = item.mimeType === "application/pdf" ? "pdf" : "jpg";
  const path = `${complaintId}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await db
    .from("complaint_attachments")
    .insert({
      complaint_id: complaintId,
      uploaded_by: userId,
      storage_path: path,
      file_name: item.name.slice(0, 200),
      mime_type: item.mimeType,
      size_bytes: item.file.size,
    })
    .select("id")
    .single();
  if (error) throw error;

  const upload = await db.storage
    .from(EVIDENCE.bucket)
    .upload(path, item.file, { contentType: item.mimeType, upsert: false });
  if (upload.error) {
    await db.from("complaint_attachments").delete().eq("id", data.id);
    throw upload.error;
  }
  return { id: data.id, path };
}

// Private bucket: links are short-lived and only issued after the storage access check.
export async function signedEvidenceUrls(paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await db.storage.from(EVIDENCE.bucket).createSignedUrls(paths, 600);
  if (error) throw error;
  return new Map(
    data.filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl]),
  );
}
