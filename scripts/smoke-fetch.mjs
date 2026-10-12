/** Smoke: seed pages + fallbacks yield download-like https URLs (and EOL dates) in excerpt. */

const WINGET =
  "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests";

const PRODUCTS = {
  nodejs: {
    seedUrl: `${WINGET}/o/OpenJS/NodeJS/LTS`,
    eolUrl: "https://endoflife.date/api/nodejs.json",
  },
  python: {
    seedUrl: "https://www.python.org/downloads/windows/",
    fallbackUrl: `${WINGET}/p/Python/Python/3`,
    eolUrl: "https://endoflife.date/api/python.json",
  },
  chrome: {
    seedUrl: "https://www.google.com/chrome/",
    fallbackUrl: `${WINGET}/g/Google/Chrome`,
  },
};

const USER_AGENT = "AI-Patch-Crawler-PoC/0.1 (+smoke)";
const MAX = 512_000;
const EXCERPT = 40_000;

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rich(text) {
  return /https:\/\/[^\s"'<>]+\.(exe|msi)\b/i.test(text);
}

async function fetchRaw(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json, */*",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return strip((await res.text()).slice(0, MAX));
}

function combine(primary, secondary) {
  const header = "--- PRIMARY ---\n";
  const mid = "\n\n--- FALLBACK ---\n\n";
  const budget = EXCERPT - header.length - mid.length;
  const fallbackShare = Math.min(secondary.length, Math.floor(budget * 0.75));
  const primaryShare = Math.max(0, budget - fallbackShare);
  return (
    header +
    primary.slice(0, primaryShare) +
    mid +
    secondary.slice(0, fallbackShare)
  );
}

async function wingetYaml(dirUrl, depth = 0) {
  const entries = JSON.parse(await fetchRaw(dirUrl));
  const installer = entries.find(
    (e) => e.type === "file" && /installer\.ya?ml$/i.test(e.name),
  );
  if (installer) return fetchRaw(installer.download_url);
  const latest = entries
    .filter((e) => e.type === "dir" && /^\d+(\.\d+)*$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  if (!latest || depth >= 3) throw new Error(`no installer under ${dirUrl}`);
  return wingetYaml(`${dirUrl}/${latest}`, depth + 1);
}

async function main() {
  for (const [id, p] of Object.entries(PRODUCTS)) {
    const primary = p.seedUrl.startsWith(WINGET)
      ? await wingetYaml(p.seedUrl)
      : await fetchRaw(p.seedUrl);
    let excerpt = primary.slice(0, EXCERPT);
    if (!rich(excerpt)) {
      excerpt = combine(primary, await wingetYaml(p.fallbackUrl));
    }
    const eol = p.eolUrl ? await fetchRaw(p.eolUrl) : "";
    const links = (excerpt.match(/https:\/\/[^\s"'<>]+/gi) || []).filter((u) =>
      /\.exe|\.msi|dl\.google/i.test(u),
    );
    const eolDates = eol.match(/"eol":"\d{4}-\d{2}-\d{2}"/g) || [];
    console.log(`\n=== ${id} ===`);
    console.log("rich:", rich(excerpt), "downloadish:", links.slice(0, 3));
    if (p.eolUrl) console.log("eol:", eolDates.slice(0, 2));
    if (!rich(excerpt) || links.length === 0 || (p.eolUrl && !eolDates.length)) {
      console.error(`FAIL ${id}`);
      process.exitCode = 1;
    }
  }
  console.log("\nsmoke-fetch: done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
