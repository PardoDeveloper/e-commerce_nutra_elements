// Guarda cambios de productos del admin en disco (D-030). Solo con DEMO_PERSISTENCE="true".
import { getBaseCatalog } from "@/lib/data";
import { saveProducts } from "@/lib/demo-store";
import { MAX_PRODUCTS_PER_REQUEST } from "@/lib/demo-store/config";
import { errorResponse, guard, json, revalidateCatalog } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rejected = guard(request);
  if (rejected) return rejected;
  // Tope de tamaño del cuerpo (~1 KB por producto) antes de leerlo.
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_PRODUCTS_PER_REQUEST * 8192) return json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Petición demasiado grande." } }, 413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: { code: "INVALID_JSON", message: "El cuerpo no es JSON válido." } }, 400);
  }
  const products = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as { products?: unknown }).products : undefined;
  try {
    const base = getBaseCatalog().map((p) => ({ sku: p.sku, slug: p.slug, categoryId: p.categoryId }));
    const result = await saveProducts(base, products);
    revalidateCatalog(result.slugs, result.categories);
    return json({ saved: result.saved });
  } catch (error) {
    return errorResponse(error);
  }
}
