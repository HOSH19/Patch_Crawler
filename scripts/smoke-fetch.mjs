/** Smoke: seed pages + fallbacks yield download-like https URLs in excerpt. */

const PRODUCTS = {
  vscode: {
    seedUrl: "https://code.visualstudio.com/Download",
    fallbackUrl:
      "https://update.code.visualstudio.com/api/update/win32-x64-user/stable/latest",
  },
  chrome: {
    seedUrl: "https://www.google.com/chrome/",
    fallbackUrl:
      "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/g/Google/Chrome",
  },
};

const USER_AGENT = "AI-Patch-Crawler-PoC/0.1 (+smoke)";
const MAX = 512_000;
const EXCERPT = 40_000;
const WINGET = PRODUCTS.chrome.fallbackUrl;

function strip(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rich(text) {
  return (
    /\.exe\b/i.test(text) ||
    /\.msi\b/i.test(text) ||
    /InstallerUrl:/i.test(text) ||
    /dl\.google\.com/i.test(text) ||
    /vscode\.download\.prss\.microsoft\.com/i.test(text)
  );
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

async function chromeYaml() {
  const index = JSON.parse(await fetchRaw(WINGET));
  const latest = index
    .filter((e) => e.type === "dir" && /^\d+\./.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  const files = JSON.parse(await fetchRaw(`${WINGET}/${latest}`));
  const installer = files.find((f) => /installer\.ya?ml$/i.test(f.name));
  return fetchRaw(installer.download_url);
}

async function main() {
  for (const [id, p] of Object.entries(PRODUCTS)) {
    const primary = await fetchRaw(p.seedUrl);
    let excerpt = primary.slice(0, EXCERPT);
    if (!rich(excerpt)) {
      const secondary =
        id === "chrome" ? await chromeYaml() : await fetchRaw(p.fallbackUrl);
      excerpt = combine(primary, secondary);
    }
    const links = (excerpt.match(/https:\/\/[^\s"'<>]+/gi) || []).filter((u) =>
      /\.exe|\.msi|dl\.google|prss\.microsoft/i.test(u),
    );
    console.log(`\n=== ${id} ===`);
    console.log("rich:", rich(excerpt), "downloadish:", links.slice(0, 4));
    if (!rich(excerpt) || links.length === 0) {
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
