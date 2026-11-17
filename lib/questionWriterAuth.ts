import "server-only";
import crypto from "node:crypto";

// The writer token (docs/speed-trivia-backlog-and-quality-plan.md Phase 4b, step 3): 32 random bytes, in Vercel
// Production env and the private writer repo's secrets. It can only read the brief and insert candidates.
// Fails closed: no token configured (or a short one) means no request passes.
export const MIN_WRITER_TOKEN_CHARS = 43; // 32 bytes, base64url

const digest = (value: string) => crypto.createHash("sha256").update(value).digest();

export const isWriterAuthorized = (request: Request): boolean => {
  const token = process.env.QUESTION_WRITER_TOKEN?.trim();
  if (!token || token.length < MIN_WRITER_TOKEN_CHARS) return false;
  // Equal-length digests, so the compare is constant-time whatever was sent.
  return crypto.timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${token}`));
};
