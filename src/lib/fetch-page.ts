import { WINGET_MANIFESTS_API, type ProductConfig } from "./products";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 512_000;
const EXCERPT_CHARS = 40_000;
const EOL_CHARS = 6_000;
const WINGET_MAX_DEPTH = 3;
const USER_AGENT =
  "AI-Patch-Crawler-PoC/0.1 (+https://localhost; polite research bot)";

export type FetchedExcerpt = {
  url: string;
  excerpt: string;
  contentType: string | null;
};

function stripHtmlNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text contains at least one absolute https .exe/.msi installer URL. */
function hasInstallerUrl(text: string): boolean {
  return /https:\/\/[^\s"'<>]+\.(exe|msi)\b/i.test(text);
}

async function fetchRaw(url: string): Promise<FetchedExcerpt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/json,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type");
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      const clipped = text.slice(0, MAX_BYTES);
      const excerpt = stripHtmlNoise(clipped).slice(0, EXCERPT_CHARS);
      return { url: res.url || url, excerpt, contentType };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        chunks.push(
          value.slice(0, Math.max(0, MAX_BYTES - (total - value.byteLength))),
        );
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const text = buffer.toString("utf8");
    const excerpt = stripHtmlNoise(text).slice(0, EXCERPT_CHARS);
    return { url: res.url || url, excerpt, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reduce endoflife.date JSON to "cycle X: eol DATE" lines. Its "latest" version
 * fields can be newer than any installer we fetched, which tempts the LLM.
 */
function compactEolJson(text: string): string {
  try {
    const rows = JSON.parse(text) as Array<{ cycle?: unknown; eol?: unknown }>;
    return rows.map((r) => `cycle ${r.cycle}: eol ${r.eol}`).join("\n");
  } catch {
    return text;
  }
}

type WingetEntry = { name?: string; type?: string; download_url?: string };

/**
 * Vendor download pages rarely embed full installer URLs. Resolve the latest
 * winget installer manifest under a package dir, descending into the highest
 * numeric subdirectory (e.g. Python/Python/3 → 14 → 3.14.7) until one is found.
 */
async function fetchWingetInstallerYaml(
  dirUrl: string,
  depth = 0,
): Promise<FetchedExcerpt> {
  const listing = await fetchRaw(dirUrl);
  let entries: WingetEntry[] = [];
  try {
    entries = JSON.parse(listing.excerpt) as WingetEntry[];
  } catch {
    throw new Error(`Winget listing was not JSON: ${dirUrl}`);
  }

  const installer = entries.find(
    (e) => e.type === "file" && /installer\.ya?ml$/i.test(e.name ?? ""),
  );
  if (installer?.download_url) {
    const yaml = await fetchRaw(installer.download_url);
    return {
      url: installer.download_url,
      excerpt: yaml.excerpt,
      contentType: yaml.contentType,
    };
  }

  const latest = entries
    .filter((e) => e.type === "dir" && /^\d+(\.\d+)*$/.test(e.name ?? ""))
    .map((e) => e.name as string)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);

  if (!latest || depth >= WINGET_MAX_DEPTH) {
    throw new Error(`No winget installer manifest found under ${dirUrl}`);
  }
  return fetchWingetInstallerYaml(`${dirUrl}/${latest}`, depth + 1);
}

async function fetchSource(
  fallbackUrl: string,
): Promise<FetchedExcerpt> {
  if (fallbackUrl.startsWith(WINGET_MANIFESTS_API)) {
    return fetchWingetInstallerYaml(fallbackUrl);
  }
  return fetchRaw(fallbackUrl);
}

/**
 * Fetch primary seed page. Vendor marketing pages are often JS-heavy, so also
 * pull the configured fallback when the primary excerpt lacks download-like URLs.
 * When an EOL source is configured, append it so EOS dates appear verbatim.
 */
export async function fetchProductExcerpt(
  product: ProductConfig,
): Promise<FetchedExcerpt> {
  const { seedUrl, fallbackUrl, eolUrl } = product;
  const primary = await fetchSource(seedUrl);
  let combined = primary.excerpt;
  let usedUrl = primary.url;

  const sparse = !hasInstallerUrl(combined);

  if (fallbackUrl && sparse) {
    console.log(
      `[fetch] primary sparse/no installers; fetching fallback ${fallbackUrl}`,
    );
    const secondary = await fetchSource(fallbackUrl);
    // Prefer fallback (installer-rich) content; keep a short primary prefix only.
    const header = `--- PRIMARY (${primary.url}) ---\n`;
    const mid = `\n\n--- FALLBACK SOURCE (${secondary.url}) ---\n\n`;
    const budget = EXCERPT_CHARS - header.length - mid.length;
    const fallbackShare = Math.min(secondary.excerpt.length, Math.floor(budget * 0.75));
    const primaryShare = Math.max(0, budget - fallbackShare);
    combined =
      header +
      primary.excerpt.slice(0, primaryShare) +
      mid +
      secondary.excerpt.slice(0, fallbackShare);
    usedUrl = `${primary.url} + ${secondary.url}`;
  }

  if (eolUrl) {
    const eol = await fetchRaw(eolUrl);
    const section = `\n\n--- END-OF-LIFE DATES (${eol.url}) ---\n\n${compactEolJson(eol.excerpt).slice(0, EOL_CHARS)}`;
    combined = combined.slice(0, EXCERPT_CHARS - section.length) + section;
    usedUrl = `${usedUrl} + ${eol.url}`;
  }

  return {
    url: usedUrl,
    excerpt: combined,
    contentType: primary.contentType,
  };
}
