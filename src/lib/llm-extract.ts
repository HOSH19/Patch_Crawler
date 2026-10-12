import OpenAI from "openai";
import type { ProductConfig } from "./products";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export type LlmExtractResult = {
  name: string;
  version: string;
  /** ISO date (YYYY-MM-DD) or human-readable date string; null if unknown */
  endOfShelf: string | null;
  url: string;
  raw: string;
};

export async function extractDownloadUrl(
  product: ProductConfig,
  excerpt: string,
): Promise<LlmExtractResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey });

  const system = `You extract official software download metadata from HTML/JSON/YAML excerpts.
Return ONLY valid JSON:
{"name":"<software name>","version":"<version>","endOfShelf":"<YYYY-MM-DD or readable date or null>","url":"<https download url>"}

Rules:
- Choose the latest stable Windows x64 installer for the product.
- Prefer direct .exe / .msi / offline installer / CDN links from the official vendor.
- "name" is the human-facing product name (e.g. "Node.js", "Python", "Google Chrome").
- "version" is the release version string as it appears in the excerpt (e.g. "24.20.0", "3.14.7", "155.0.8059.40").
- "endOfShelf" is the end-of-support / EOL / shelf-life end date for this release when the excerpt states one. Prefer ISO YYYY-MM-DD. If not present, return null — NEVER invent or guess dates.
- If the excerpt has an END-OF-LIFE DATES section, find the "cycle X: eol DATE" line whose cycle matches the chosen version and use that DATE verbatim. Take name/version/url only from the other sections.
- Release dates (e.g. "ReleaseDate:") are NOT end-of-shelf dates.
- The URL MUST appear verbatim as a substring in the provided excerpt.
- The version SHOULD appear as a substring in the excerpt.
- Prefer endOfShelf values that appear in the excerpt.
- Never invent name, version, url, or dates. Use empty strings for missing name/version/url; null for missing endOfShelf.`;

  const user = `Product: ${product.label} (${product.id})
Target: ${product.targetHint}
Platform: Windows x64 (stable)

Excerpt:
"""
${excerpt}
"""`;

  console.log(
    `[llm] model=${MODEL} product=${product.id} excerptChars=${excerpt.length}`,
  );

  const completion = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  console.log(`[llm] raw response: ${raw.slice(0, 500)}`);

  let parsed: {
    name?: unknown;
    version?: unknown;
    endOfShelf?: unknown;
    url?: unknown;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("LLM returned non-JSON response");
  }

  let endOfShelf: string | null = null;
  if (typeof parsed.endOfShelf === "string") {
    const trimmed = parsed.endOfShelf.trim();
    if (
      trimmed &&
      trimmed.toLowerCase() !== "null" &&
      trimmed.toLowerCase() !== "unknown" &&
      trimmed.toLowerCase() !== "n/a"
    ) {
      endOfShelf = trimmed;
    }
  }

  return {
    name: typeof parsed.name === "string" ? parsed.name.trim() : "",
    version: typeof parsed.version === "string" ? parsed.version.trim() : "",
    endOfShelf,
    url: typeof parsed.url === "string" ? parsed.url.trim() : "",
    raw,
  };
}
