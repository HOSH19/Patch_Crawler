"use client";

import { useState } from "react";

type ProductId = "nodejs" | "python" | "chrome";

type ApiSuccess = {
  name: string;
  version: string;
  endOfShelf: string | null;
  url: string;
  product: ProductId;
  fetchedAt: string;
  cached?: boolean;
};

type ApiError = {
  error: string;
};

export default function Home() {
  const [product, setProduct] = useState<ProductId>("nodejs");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiSuccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function findLatest() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = (await res.json()) as ApiSuccess | ApiError;
      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : `Request failed (${res.status})`);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl() {
    if (!result?.url) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.25rem",
      }}
    >
      <div className="poc-panel" style={{ width: "100%", maxWidth: 560 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "clamp(2rem, 5vw, 2.75rem)",
            fontWeight: 600,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}
        >
          AI Patch Crawler
        </p>
        <p
          style={{
            margin: "0.85rem 0 0",
            color: "var(--muted)",
            fontSize: "1.05rem",
            lineHeight: 1.5,
            maxWidth: "42ch",
          }}
        >
          Pick a product. We fetch the official page and ask an LLM for name,
          version, end-of-shelf date (when known), and the latest stable Windows
          x64 download URL.
        </p>

        <label
          htmlFor="product"
          style={{
            display: "block",
            marginTop: "2rem",
            marginBottom: "0.5rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "var(--muted)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Product
        </label>
        <select
          id="product"
          className="poc-select"
          value={product}
          onChange={(e) => setProduct(e.target.value as ProductId)}
          disabled={loading}
          style={{
            width: "100%",
            appearance: "none",
            backgroundColor: "var(--bg-2)",
            color: "var(--ink)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            padding: "0.85rem 2.5rem 0.85rem 1rem",
            fontSize: "1rem",
            fontFamily: "inherit",
            outline: "none",
          }}
        >
          <option value="nodejs">Node.js LTS</option>
          <option value="python">Python</option>
          <option value="chrome">Chrome</option>
        </select>

        <p
          style={{
            margin: "0.65rem 0 0",
            fontSize: "0.9rem",
            color: "var(--muted)",
          }}
        >
          Platform default: Windows x64 (stable)
        </p>

        <button
          type="button"
          className="poc-btn"
          onClick={findLatest}
          disabled={loading}
          style={{
            marginTop: "1.5rem",
            width: "100%",
            border: "none",
            borderRadius: 10,
            padding: "0.95rem 1.25rem",
            background: loading ? "#2f6b58" : "var(--accent)",
            color: "#06140f",
            fontWeight: 700,
            fontSize: "1rem",
            fontFamily: "inherit",
            cursor: loading ? "wait" : "pointer",
            transition: "background 0.2s ease, transform 0.15s ease",
          }}
        >
          {loading ? "Finding latest…" : "Find latest"}
        </button>

        {error && (
          <p
            role="alert"
            style={{
              marginTop: "1.25rem",
              color: "var(--danger)",
              fontSize: "0.95rem",
              lineHeight: 1.45,
            }}
          >
            {error}
          </p>
        )}

        {result && (
          <div
            className="poc-result"
            style={{
              marginTop: "1.5rem",
              paddingTop: "1.25rem",
              borderTop: "1px solid var(--line)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Latest result
              {result.cached ? " (cached)" : ""}
            </p>

            <dl
              className="poc-fields"
              style={{
                margin: "0.85rem 0 0",
                display: "grid",
                rowGap: "0.55rem",
                columnGap: "0.75rem",
                fontSize: "0.95rem",
                lineHeight: 1.45,
              }}
            >
              <dt style={{ margin: 0, color: "var(--muted)", fontWeight: 600 }}>
                Name
              </dt>
              <dd style={{ margin: 0 }}>{result.name}</dd>

              <dt style={{ margin: 0, color: "var(--muted)", fontWeight: 600 }}>
                Version
              </dt>
              <dd style={{ margin: 0 }}>{result.version}</dd>

              <dt style={{ margin: 0, color: "var(--muted)", fontWeight: 600 }}>
                End of shelf
              </dt>
              <dd style={{ margin: 0 }}>
                {result.endOfShelf ?? "Unknown"}
              </dd>

              <dt style={{ margin: 0, color: "var(--muted)", fontWeight: 600 }}>
                Download URL
              </dt>
              <dd style={{ margin: 0, wordBreak: "break-all" }}>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent-hover)" }}
                >
                  {result.url}
                </a>
              </dd>
            </dl>

            <div
              style={{
                marginTop: "1rem",
                display: "flex",
                gap: "0.75rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                className="poc-btn"
                onClick={copyUrl}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "0.55rem 1rem",
                  background: "transparent",
                  color: "var(--ink)",
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
              {copied && (
                <span
                  style={{
                    fontSize: "0.9rem",
                    color: "var(--accent-hover)",
                    fontWeight: 600,
                  }}
                >
                  Copied
                </span>
              )}
            </div>
            <p
              style={{
                margin: "0.75rem 0 0",
                fontSize: "0.8rem",
                color: "var(--muted)",
              }}
            >
              Fetched {new Date(result.fetchedAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
