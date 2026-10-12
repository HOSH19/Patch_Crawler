/**
 * Offline smoke: validation rejects bad urls/versions and hallucinated fields.
 */
import assert from "node:assert/strict";

const VERSION_RE = /^\d+\.\d+(\.\d+){0,3}([.+_-][A-Za-z0-9._-]+)?$/;

function validateExtraction(candidate, excerpt, productLabel) {
  const name = candidate.name.trim();
  const version = candidate.version.trim();
  let url = candidate.url.trim();

  if (!name) return { ok: false, reason: "empty name" };
  if (!version) return { ok: false, reason: "empty version" };
  if (!VERSION_RE.test(version)) return { ok: false, reason: "bad version" };
  if (!excerpt.includes(version)) return { ok: false, reason: "version hallucination" };
  if (!url) return { ok: false, reason: "empty url" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "parse" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "https" };
  if (!excerpt.includes(url)) return { ok: false, reason: "url hallucination" };
  void productLabel;
  return { ok: true, name, version, url };
}

const excerpt =
  "PackageVersion: 24.20.0 InstallerUrl: https://nodejs.org/dist/v24.20.0/node-v24.20.0-x64.msi";

assert.equal(
  validateExtraction(
    {
      name: "Node.js",
      version: "24.20.0",
      url: "https://nodejs.org/dist/v24.20.0/node-v24.20.0-x64.msi",
    },
    excerpt,
    "Node.js LTS",
  ).ok,
  true,
);

assert.equal(
  validateExtraction(
    {
      name: "Node.js",
      version: "24.20.0",
      url: "http://evil.example/x.exe",
    },
    excerpt,
    "Node.js LTS",
  ).ok,
  false,
);

assert.equal(
  validateExtraction(
    {
      name: "Node.js",
      version: "24.20.0",
      url: "https://evil.example/fake-node.msi",
    },
    excerpt,
    "Node.js LTS",
  ).ok,
  false,
);

assert.equal(
  validateExtraction(
    {
      name: "Node.js",
      version: "9.9.9",
      url: "https://nodejs.org/dist/v24.20.0/node-v24.20.0-x64.msi",
    },
    excerpt,
    "Node.js LTS",
  ).ok,
  false,
);

assert.equal(
  validateExtraction(
    { name: "", version: "24.20.0", url: "https://example.com/a.exe" },
    excerpt,
    "Node.js LTS",
  ).ok,
  false,
);

console.log("smoke-validate: ok");
