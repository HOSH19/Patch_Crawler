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
  'Visual Studio Code 1.141.0 <a href="https://vscode.download.prss.microsoft.com/dbazure/download/stable/abc/VSCodeUserSetup-x64-1.141.0.exe">here</a>';

assert.equal(
  validateExtraction(
    {
      name: "Visual Studio Code",
      version: "1.141.0",
      url: "https://vscode.download.prss.microsoft.com/dbazure/download/stable/abc/VSCodeUserSetup-x64-1.141.0.exe",
    },
    excerpt,
    "VS Code",
  ).ok,
  true,
);

assert.equal(
  validateExtraction(
    {
      name: "Visual Studio Code",
      version: "1.141.0",
      url: "http://evil.example/x.exe",
    },
    excerpt,
    "VS Code",
  ).ok,
  false,
);

assert.equal(
  validateExtraction(
    {
      name: "Visual Studio Code",
      version: "1.141.0",
      url: "https://evil.example/fake-vscode.exe",
    },
    excerpt,
    "VS Code",
  ).ok,
  false,
);

assert.equal(
  validateExtraction(
    {
      name: "Visual Studio Code",
      version: "9.9.9",
      url: "https://vscode.download.prss.microsoft.com/dbazure/download/stable/abc/VSCodeUserSetup-x64-1.141.0.exe",
    },
    excerpt,
    "VS Code",
  ).ok,
  false,
);

assert.equal(
  validateExtraction(
    { name: "", version: "1.141.0", url: "https://example.com/a.exe" },
    excerpt,
    "VS Code",
  ).ok,
  false,
);

console.log("smoke-validate: ok");
