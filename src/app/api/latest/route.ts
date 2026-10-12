import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { fetchProductExcerpt } from "@/lib/fetch-page";
import { extractDownloadUrl } from "@/lib/llm-extract";
import { isProductId, PRODUCTS, type ProductId } from "@/lib/products";
import { validateExtraction } from "@/lib/validate";

export const runtime = "nodejs";

type SuccessBody = {
  name: string;
  version: string;
  endOfShelf: string | null;
  url: string;
  product: ProductId;
  fetchedAt: string;
  cached?: boolean;
};

type ErrorBody = {
  error: string;
};

type CachedPayload = Omit<SuccessBody, "cached">;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" } satisfies ErrorBody,
      { status: 400 },
    );
  }

  const productId =
    typeof body === "object" &&
    body !== null &&
    "product" in body &&
    (body as { product: unknown }).product;

  if (!isProductId(productId)) {
    return NextResponse.json(
      { error: "product must be 'vscode' or 'chrome'" } satisfies ErrorBody,
      { status: 400 },
    );
  }

  const cacheKey = `latest:${productId}:win-x64:v3`;
  const cached = cacheGet<CachedPayload>(cacheKey);
  if (cached) {
    console.log(`[api] cache hit ${cacheKey}`);
    return NextResponse.json({ ...cached, cached: true } satisfies SuccessBody);
  }

  const product = PRODUCTS[productId];

  try {
    console.log(`[api] fetching seed for ${productId}: ${product.seedUrl}`);
    const fetched = await fetchProductExcerpt(
      product.seedUrl,
      product.fallbackUrl,
    );
    console.log(
      `[api] excerpt ready (${fetched.excerpt.length} chars) from ${fetched.url}`,
    );

    const extracted = await extractDownloadUrl(product, fetched.excerpt);
    const validated = validateExtraction(
      extracted,
      fetched.excerpt,
      product.label,
    );
    if (!validated.ok) {
      console.warn(`[api] validation failed: ${validated.reason}`);
      return NextResponse.json(
        { error: validated.reason } satisfies ErrorBody,
        { status: 502 },
      );
    }

    const payload: CachedPayload = {
      name: validated.name,
      version: validated.version,
      endOfShelf: validated.endOfShelf,
      url: validated.url,
      product: productId,
      fetchedAt: new Date().toISOString(),
    };
    cacheSet(cacheKey, payload);
    console.log(
      `[api] success ${productId} → ${payload.name} ${payload.version} eos=${payload.endOfShelf} ${payload.url}`,
    );

    return NextResponse.json({
      ...payload,
      cached: false,
    } satisfies SuccessBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[api] error for ${productId}:`, message);
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message } satisfies ErrorBody, {
      status,
    });
  }
}
