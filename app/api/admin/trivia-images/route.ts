import "server-only";
import { NextResponse } from "next/server";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { requireAdminAuth } from "@/lib/adminAuth";

const LIVE_DIR = join(process.cwd(), "data", "live-trivia", "categories");

export type ImageQuestion = {
  slug: string;
  question: string;
  answer: string;
  difficulty: string;
  category: string;
  acceptableAnswers?: string[];
  imageUrl: string | null;
  imageCredit: string | null;
  file: string;
};

export type ImageCategory = {
  categoryName: string;
  file: string;
  questions: ImageQuestion[];
};

export type ImageCategorySummary = {
  categoryName: string;
  file: string;
  totalQuestions: number;
  totalWithImage: number;
  totalMissing: number;
};

function readImageData(): ImageCategory[] {
  const files = readdirSync(LIVE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const raw = JSON.parse(readFileSync(join(LIVE_DIR, file), "utf-8")) as {
      categoryName?: string;
      questions?: Array<{
        slug: string;
        question: string;
        answer: string;
        difficulty?: string;
        category?: string;
        acceptableAnswers?: string[];
        imageUrl?: string;
        imageCredit?: string;
      }>;
    };

    const categoryName =
      String(raw.categoryName ?? "")
        .trim() ||
      file.replace(/\.v\d+\.json$/i, "").replace(/-/g, " ");

    const questions: ImageQuestion[] = (raw.questions ?? []).map((q) => ({
      slug: q.slug,
      question: q.question,
      answer: q.answer,
      difficulty: q.difficulty ?? "easy",
      category: q.category ?? categoryName,
      acceptableAnswers: q.acceptableAnswers,
      imageUrl: q.imageUrl ?? null,
      imageCredit: q.imageCredit ?? null,
      file,
    }));

    return { categoryName, file, questions };
  });
}

function toCategorySummary(category: ImageCategory): ImageCategorySummary {
  const totalQuestions = category.questions.length;
  const totalWithImage = category.questions.filter((question) => question.imageUrl).length;

  return {
    categoryName: category.categoryName,
    file: category.file,
    totalQuestions,
    totalWithImage,
    totalMissing: totalQuestions - totalWithImage,
  };
}

// ─── Image fetching (mirrors enrich-landmark-images.cjs logic) ────────────────

const UNSPLASH_BASE = "https://api.unsplash.com";
const WIKI_API = "https://commons.wikimedia.org/w/api.php";
const PHOTO_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

async function fetchUnsplash(
  query: string,
  index: number
): Promise<{ imageUrl: string; imageCredit: string } | null> {
  const apiKey = process.env.UNSPLASH_API_KEY;
  if (!apiKey) throw new Error("UNSPLASH_API_KEY not set");

  const perPage = Math.max(10, index + 1);
  const url = `${UNSPLASH_BASE}/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape&content_filter=high`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 401) throw new Error("Unsplash API key invalid.");
  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { errors?: string[] };
    const msg = (body.errors ?? []).join(", ");
    if (msg.toLowerCase().includes("rate limit")) throw new Error("Unsplash rate limit hit (50/hr). Try again in an hour.");
    throw new Error(`Unsplash 403: ${msg || "forbidden"}`);
  }
  if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);

  const data = await res.json() as { results?: Array<{ urls: { raw: string }; user: { name: string } }> };
  const results = data.results ?? [];
  if (results.length === 0) return null;

  const photo = results[Math.min(index, results.length - 1)];
  const baseUrl = photo.urls.raw.split("?")[0];
  return {
    imageUrl: `${baseUrl}?w=800&fit=crop`,
    imageCredit: `Photo by ${photo.user.name} on Unsplash`,
  };
}

async function fetchWikimedia(
  query: string,
  index: number
): Promise<{ imageUrl: string; imageCredit: string } | null> {
  const searchUrl =
    `${WIKI_API}?action=query` +
    `&generator=search&gsrsearch=${encodeURIComponent(query)}` +
    `&gsrnamespace=6&gsrlimit=20` +
    `&prop=imageinfo&iiprop=url|extmetadata|mediatype` +
    `&iiurlwidth=800&format=json&origin=*`;

  const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Wikimedia HTTP ${res.status}`);
  const data = await res.json() as { query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ thumburl?: string; extmetadata?: Record<string, { value: string }> }> }> } };

  const pages = Object.values(data?.query?.pages ?? {});
  if (pages.length === 0) return null;

  const photoPages = pages.filter((p) => {
    const ext = (p.title ?? "").toLowerCase().split(".").pop() ?? "";
    return PHOTO_EXTS.has(ext);
  });
  const candidates = photoPages.length > 0 ? photoPages : pages;
  // Support index for cycling through results
  const best = candidates[Math.min(index, candidates.length - 1)];
  const info = best?.imageinfo?.[0];
  const thumbUrl = info?.thumburl;
  if (!thumbUrl) return null;

  const meta = info?.extmetadata ?? {};
  const artistRaw = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim();
  const credit = artistRaw
    ? `Photo: ${artistRaw} via Wikimedia Commons`
    : "Photo via Wikimedia Commons";

  return { imageUrl: thumbUrl, imageCredit: credit };
}

// Find which file contains a given slug and return its path
function findSlugFile(slug: string): string | null {
  for (const file of readdirSync(LIVE_DIR).filter((f) => f.endsWith(".json"))) {
    const raw = JSON.parse(readFileSync(join(LIVE_DIR, file), "utf-8")) as {
      questions?: Array<{ slug: string }>;
    };
    if ((raw.questions ?? []).some((q) => q.slug === slug)) return file;
  }
  return null;
}

// Write imageUrl + imageCredit back to the JSON file for a given slug
function patchSlugInFile(
  file: string,
  slug: string,
  imageUrl: string,
  imageCredit: string
): void {
  const filePath = join(LIVE_DIR, file);
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as {
    questions?: Array<{ slug: string; imageUrl?: string; imageCredit?: string }>;
  };
  const q = (raw.questions ?? []).find((q) => q.slug === slug);
  if (!q) throw new Error(`Slug "${slug}" not found in ${file}`);
  q.imageUrl = imageUrl;
  q.imageCredit = imageCredit;
  writeFileSync(filePath, JSON.stringify(raw, null, 2) + "\n", "utf-8");
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const requestedCategory = String(url.searchParams.get("category") ?? "").trim();
    const categories = readImageData();
    const summaries = categories.map(toCategorySummary);
    const totalQuestions = summaries.reduce((n, c) => n + c.totalQuestions, 0);
    const totalWithImage = summaries.reduce((n, c) => n + c.totalWithImage, 0);

    if (requestedCategory) {
      const matchedCategory = categories.find((category) => category.categoryName === requestedCategory);
      if (!matchedCategory) {
        return NextResponse.json(
          { ok: false, error: `Category "${requestedCategory}" not found.` },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        category: matchedCategory,
        summary: toCategorySummary(matchedCategory),
        categories: summaries,
        totalQuestions,
        totalWithImage,
        totalMissing: totalQuestions - totalWithImage,
      });
    }

    return NextResponse.json({
      ok: true,
      categories: summaries,
      totalQuestions,
      totalWithImage,
      totalMissing: totalQuestions - totalWithImage,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read trivia image data." },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: {
    slug?: string;
    index?: number;
    source?: string;
    query?: string;
    question?: string;
    answer?: string;
    difficulty?: string;
    acceptableAnswers?: string[];
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug, index = 0, source = "unsplash", query } = body;

  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  // Handle question field edits
  if (source === "edit") {
    const { question: newQuestion, answer: newAnswer, difficulty: newDifficulty, acceptableAnswers: newAcceptable } = body;

    const file = findSlugFile(slug);
    if (!file) return NextResponse.json({ ok: false, error: `Slug "${slug}" not found` }, { status: 404 });
    const filePath = join(LIVE_DIR, file);
    const fileRaw = JSON.parse(readFileSync(filePath, "utf-8")) as {
      questions?: Array<{
        slug: string;
        question?: string;
        answer?: string;
        difficulty?: string;
        acceptableAnswers?: string[];
      }>;
    };
    const q = (fileRaw.questions ?? []).find((q) => q.slug === slug);
    if (!q) return NextResponse.json({ ok: false, error: `Slug not found` }, { status: 404 });
    if (newQuestion !== undefined) q.question = newQuestion;
    if (newAnswer !== undefined) q.answer = newAnswer;
    if (newDifficulty !== undefined) q.difficulty = newDifficulty;
    if (newAcceptable !== undefined) {
      if (newAcceptable.length > 0) q.acceptableAnswers = newAcceptable;
      else delete (q as { acceptableAnswers?: string[] }).acceptableAnswers;
    }
    writeFileSync(filePath, JSON.stringify(fileRaw, null, 2) + "\n", "utf-8");
    return NextResponse.json({ ok: true });
  }

  // Handle image removal
  if (source === "remove-image" || source === "remove") {
    const file = findSlugFile(slug);
    if (!file) {
      return NextResponse.json({ ok: false, error: `Slug "${slug}" not found` }, { status: 404 });
    }
    const filePath = join(LIVE_DIR, file);
    const fileRaw = JSON.parse(readFileSync(filePath, "utf-8")) as {
      questions?: Array<{ slug: string; imageUrl?: string; imageCredit?: string }>;
    };
    const q = (fileRaw.questions ?? []).find((q) => q.slug === slug);
    if (!q) return NextResponse.json({ ok: false, error: `Slug not found` }, { status: 404 });
    delete q.imageUrl;
    delete q.imageCredit;
    writeFileSync(filePath, JSON.stringify(fileRaw, null, 2) + "\n", "utf-8");
    return NextResponse.json({ ok: true });
  }

  // Handle question removal
  if (source === "remove-question") {
    const file = findSlugFile(slug);
    if (!file) {
      return NextResponse.json({ ok: false, error: `Slug "${slug}" not found` }, { status: 404 });
    }
    const filePath = join(LIVE_DIR, file);
    const fileRaw = JSON.parse(readFileSync(filePath, "utf-8")) as {
      questions?: Array<{ slug: string }>;
    };
    const before = (fileRaw.questions ?? []).length;
    fileRaw.questions = (fileRaw.questions ?? []).filter((q) => q.slug !== slug);
    if (fileRaw.questions.length === before) {
      return NextResponse.json({ ok: false, error: `Slug not found` }, { status: 404 });
    }
    writeFileSync(filePath, JSON.stringify(fileRaw, null, 2) + "\n", "utf-8");
    return NextResponse.json({ ok: true });
  }

  // Find which file contains this slug
  const file = findSlugFile(slug);
  if (!file) {
    return NextResponse.json({ ok: false, error: `Slug "${slug}" not found in any category file` }, { status: 404 });
  }

  // Read the question to get its answer for search query
  const raw = JSON.parse(readFileSync(join(LIVE_DIR, file), "utf-8")) as {
    questions?: Array<{ slug: string; answer: string }>;
  };
  const question = (raw.questions ?? []).find((q) => q.slug === slug);
  if (!question) {
    return NextResponse.json({ ok: false, error: `Slug "${slug}" not found` }, { status: 404 });
  }

  const searchQuery = query ?? question.answer;

  try {
    let result: { imageUrl: string; imageCredit: string } | null = null;

    if (source === "wiki") {
      result = await fetchWikimedia(searchQuery, index);
    } else {
      result = await fetchUnsplash(searchQuery, index);
    }

    if (!result) {
      return NextResponse.json({ ok: false, error: `No images found for "${searchQuery}"` }, { status: 404 });
    }

    patchSlugInFile(file, slug, result.imageUrl, result.imageCredit);

    return NextResponse.json({ ok: true, imageUrl: result.imageUrl, imageCredit: result.imageCredit });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Image fetch failed" },
      { status: 500 }
    );
  }
}
