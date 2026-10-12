const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 512_000;
const EXCERPT_CHARS = 40_000;
const USER_AGENT =
  "AI-Patch-Crawler-PoC/0.1 (+https://localhost; polite research bot)";

const WINGET_CHROME_API =
  "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/g/Google/Chrome";

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

function countHttpsLinks(text: string): number {
  const matches = text.match(/https:\/\/[^\s"'<>]+/gi);
  return matches?.length ?? 0;
}

function looksDownloadRich(text: string): boolean {
  return (
    /\.exe\b/i.test(text) ||
    /\.msi\b/i.test(text) ||
    /InstallerUrl:/i.test(text) ||
    /vscode\.download\.prss\.microsoft\.com/i.test(text) ||
    /update\.code\.visualstudio\.com/i.test(text) ||
    /dl\.google\.com/i.test(text) ||
    /win32-x64/i.test(text)
  );
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
 * Chrome marketing pages rarely embed installer URLs. Resolve the latest
 * winget Google.Chrome installer manifest (contains dl.google.com URLs).
 */
async function fetchChromeWingetInstallerYaml(): Promise<FetchedExcerpt> {
  const index = await fetchRaw(WINGET_CHROME_API);
  let entries: Array<{ name?: string; type?: string }> = [];
  try {
    entries = JSON.parse(index.excerpt) as Array<{
      name?: string;
      type?: string;
    }>;
  } catch {
    throw new Error("Chrome winget index was not JSON");
  }

  const versions = entries
    .filter((e) => e.type === "dir" && typeof e.name === "string")
    .map((e) => e.name as string)
    .filter((name) => /^\d+\./.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const latest = versions.at(-1);
  if (!latest) {
    throw new Error("No versioned Chrome winget manifests found");
  }

  const dirUrl = `${WINGET_CHROME_API}/${latest}`;
  const dirListing = await fetchRaw(dirUrl);
  let files: Array<{ name?: string; download_url?: string }> = [];
  try {
    files = JSON.parse(dirListing.excerpt) as Array<{
      name?: string;
      download_url?: string;
    }>;
  } catch {
    throw new Error("Chrome winget version dir was not JSON");
  }

  const installer = files.find((f) =>
    /installer\.ya?ml$/i.test(f.name ?? ""),
  );
  if (!installer?.download_url) {
    throw new Error(`No installer.yaml for Chrome ${latest}`);
  }

  const yaml = await fetchRaw(installer.download_url);
  return {
    url: installer.download_url,
    excerpt: yaml.excerpt,
    contentType: yaml.contentType,
  };
}

async function fetchFallback(
  fallbackUrl: string,
): Promise<FetchedExcerpt> {
  if (fallbackUrl.startsWith(WINGET_CHROME_API)) {
    return fetchChromeWingetInstallerYaml();
  }
  return fetchRaw(fallbackUrl);
}

/**
 * Fetch primary seed page. Vendor marketing pages are often JS-heavy, so also
 * pull the configured fallback when the primary excerpt lacks download-like URLs.
 */
export async function fetchProductExcerpt(
  seedUrl: string,
  fallbackUrl?: string,
): Promise<FetchedExcerpt> {
  const primary = await fetchRaw(seedUrl);
  let combined = primary.excerpt;
  let usedUrl = primary.url;

  const sparse =
    countHttpsLinks(combined) < 2 || !looksDownloadRich(combined);

  if (fallbackUrl && sparse) {
    console.log(
      `[fetch] primary sparse/no installers; fetching fallback ${fallbackUrl}`,
    );
    const secondary = await fetchFallback(fallbackUrl);
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

  return {
    url: usedUrl,
    excerpt: combined,
    contentType: primary.contentType,
  };
}
