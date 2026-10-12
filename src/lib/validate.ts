export type ExtractionCandidate = {
  name: string;
  version: string;
  endOfShelf: string | null;
  url: string;
};

export type ValidationOk = {
  ok: true;
  name: string;
  version: string;
  endOfShelf: string | null;
  url: string;
};

export type ValidationErr = {
  ok: false;
  reason: string;
};

/** Plausible software version: at least major.minor, optional more segments / build tags. */
const VERSION_RE = /^\d+\.\d+(\.\d+){0,3}([.+_-][A-Za-z0-9._-]+)?$/;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize / accept an end-of-shelf date only when it appears in the excerpt
 * (or as ISO that is clearly present). Never invent — return null if unknown.
 */
function validateEndOfShelf(
  value: string | null,
  excerpt: string,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (excerpt.includes(`ReleaseDate: ${trimmed}`)) {
    console.warn(
      `[validate] endOfShelf "${trimmed}" is a release date; treating as Unknown`,
    );
    return null;
  }

  // Prefer exact substring presence in excerpt
  if (excerpt.includes(trimmed)) {
    if (ISO_DATE_RE.test(trimmed)) return trimmed;
    // Allow human-readable dates that literally appear in the source
    if (trimmed.length <= 40) return trimmed;
    return null;
  }

  // If LLM returned ISO but excerpt has the same date in another form, still
  // require the ISO string itself (or reject to avoid invention).
  console.warn(
    `[validate] endOfShelf "${trimmed}" not found in excerpt; treating as Unknown`,
  );
  return null;
}

/**
 * Accept only https URLs that appear in the fetched excerpt (rejects hallucinations).
 * Name must be non-empty; version must look plausible and appear in the excerpt.
 * endOfShelf is optional — null when not found (do not invent).
 */
export function validateExtraction(
  candidate: ExtractionCandidate,
  excerpt: string,
  productLabel: string,
): ValidationOk | ValidationErr {
  const name = candidate.name.trim();
  const version = candidate.version.trim();
  let url = candidate.url.trim();
  const endOfShelf = validateEndOfShelf(candidate.endOfShelf, excerpt);

  if (!name) {
    return { ok: false, reason: "LLM returned an empty software name" };
  }
  if (name.length > 120) {
    return { ok: false, reason: "Software name is unreasonably long" };
  }

  if (!version) {
    return { ok: false, reason: "LLM returned an empty version" };
  }
  if (!VERSION_RE.test(version)) {
    return {
      ok: false,
      reason: `Version "${version}" is not a plausible version string`,
    };
  }

  if (!excerpt.includes(version)) {
    return {
      ok: false,
      reason: "Version not found in fetched excerpt (possible hallucination)",
    };
  }

  if (!url) {
    return { ok: false, reason: "LLM returned an empty URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "URL is not parseable" };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "URL must use https://" };
  }

  if (!excerpt.includes(url)) {
    const withoutHash = url.split("#")[0];
    if (!excerpt.includes(withoutHash)) {
      return {
        ok: false,
        reason: "URL not found in fetched excerpt (possible hallucination)",
      };
    }
    url = withoutHash;
  }

  const nameInExcerpt =
    excerpt.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(productLabel.toLowerCase()) ||
    productLabel.toLowerCase().includes(name.toLowerCase());
  if (!nameInExcerpt) {
    console.warn(
      `[validate] name "${name}" not clearly in excerpt; accepting with url/version checks`,
    );
  }

  return { ok: true, name, version, endOfShelf, url };
}
