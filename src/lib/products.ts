export type ProductId = "vscode" | "chrome";

export type ProductConfig = {
  id: ProductId;
  label: string;
  /** Primary official page to fetch */
  seedUrl: string;
  /** Optional secondary source if primary HTML lacks download links */
  fallbackUrl?: string;
  /** Hint baked into the LLM prompt */
  targetHint: string;
};

export const PRODUCTS: Record<ProductId, ProductConfig> = {
  vscode: {
    id: "vscode",
    label: "VS Code",
    seedUrl: "https://code.visualstudio.com/Download",
    // Official update JSON includes the Windows x64 User .exe URL as text
    fallbackUrl:
      "https://update.code.visualstudio.com/api/update/win32-x64-user/stable/latest",
    targetHint:
      "Latest stable Visual Studio Code Windows x64 User or System installer (.exe), preferably a direct CDN/update download link.",
  },
  chrome: {
    id: "chrome",
    label: "Chrome",
    seedUrl: "https://www.google.com/chrome/",
    // Winget package index — resolved further in fetch-page to the installer YAML
    fallbackUrl:
      "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/g/Google/Chrome",
    targetHint:
      "Latest stable Google Chrome Windows x64 offline/enterprise installer URL (dl.google.com .msi or .exe).",
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];

export function isProductId(value: unknown): value is ProductId {
  return typeof value === "string" && value in PRODUCTS;
}
