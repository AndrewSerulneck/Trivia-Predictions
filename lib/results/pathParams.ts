// A Results URL path segment (competition id, gameKey) as the adapter expects it. The client
// encodes a gameKey with encodeURIComponent ("<scheduleId>%3A<date>"); decode it once here, and
// treat a malformed escape as a value no adapter accepts (→ 404), never a thrown 500. Pure.

export const decodeResultsPathParam = (value: string | undefined): string => {
  const raw = String(value ?? "");
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
};
