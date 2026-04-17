import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const MAX_IMAGE_BYTES = 300 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STORAGE_BUCKET = process.env.SUPABASE_ADS_BUCKET?.trim() || "advertisements";

function getFileExtension(contentType: string, filename: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";

  const fromName = filename.split(".").pop()?.trim().toLowerCase();
  return fromName && /^[a-z0-9]+$/.test(fromName) ? fromName : "bin";
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
    }

    const formData = await request.formData();
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ ok: false, error: "A file is required." }, { status: 400 });
    }

    if (!ALLOWED_CONTENT_TYPES.has(uploaded.type)) {
      return NextResponse.json(
        { ok: false, error: "Only static JPG, PNG, or WebP images are allowed." },
        { status: 400 }
      );
    }

    if (uploaded.size <= 0) {
      return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 });
    }

    if (uploaded.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ ok: false, error: "File must be under 300KB." }, { status: 400 });
    }

    const extension = getFileExtension(uploaded.type, uploaded.name);
    const today = new Date().toISOString().slice(0, 10);
    const objectPath = `admin-uploads/${today}/${crypto.randomUUID()}.${extension}`;
    const fileBuffer = Buffer.from(await uploaded.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(objectPath, fileBuffer, {
      contentType: uploaded.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      throw new Error(uploadError.message || "Failed to upload advertisement image.");
    }

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);

    if (!publicUrl) {
      throw new Error("Failed to generate advertisement image URL.");
    }

    return NextResponse.json({
      ok: true,
      imageUrl: publicUrl,
      path: objectPath,
      bytes: uploaded.size,
      contentType: uploaded.type,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to upload advertisement image." },
      { status: 500 }
    );
  }
}
