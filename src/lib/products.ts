export type ProductId = "nodejs" | "python" | "chrome";

export const WINGET_MANIFESTS_API =
  "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests";

export type ProductConfig = {
  id: ProductId;
  label: string;
  /** Primary official page (or winget manifests dir) to fetch */
  seedUrl: string;
  /** Optional secondary source if primary HTML lacks download links */
  fallbackUrl?: string;
  /** Optional endoflife.date API URL; always appended so EOS dates are verbatim in the excerpt */
  eolUrl?: string;
  /** Hint baked into the LLM prompt */
  targetHint: string;
};

export const PRODUCTS: Record<ProductId, ProductConfig> = {
  nodejs: {
    id: "nodejs",
    label: "Node.js LTS",
    // nodejs.org/en/download is client-rendered and advertises versions with no
    // installer URL in the HTML; winget's LTS manifest has the nodejs.org/dist URL.
    seedUrl: `${WINGET_MANIFESTS_API}/o/OpenJS/NodeJS/LTS`,
    eolUrl: "https://endoflife.date/api/nodejs.json",
    targetHint:
      "Latest Node.js LTS Windows x64 installer (.msi) from nodejs.org/dist. endOfShelf is the eol date of the matching release cycle (major version, e.g. cycle 24 for 24.x).",
  },
  python: {
    id: "python",
    label: "Python",
    seedUrl: "https://www.python.org/downloads/windows/",
    fallbackUrl: `${WINGET_MANIFESTS_API}/p/Python/Python/3`,
    eolUrl: "https://endoflife.date/api/python.json",
    targetHint:
      "Latest stable Python 3 Windows x64 (amd64) installer (.exe) from python.org/ftp. endOfShelf is the eol date of the matching release cycle (major.minor, e.g. cycle 3.14 for 3.14.x).",
  },
  chrome: {
    id: "chrome",
    label: "Chrome",
    seedUrl: "https://www.google.com/chrome/",
    fallbackUrl: `${WINGET_MANIFESTS_API}/g/Google/Chrome`,
    targetHint:
      "Latest stable Google Chrome Windows x64 offline/enterprise installer URL (dl.google.com .msi or .exe).",
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];

export function isProductId(value: unknown): value is ProductId {
  return typeof value === "string" && value in PRODUCTS;
}
