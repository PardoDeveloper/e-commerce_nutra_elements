// Sube una imagen de producto a disco (D-030). Solo con DEMO_PERSISTENCE="true".
// Campos: `sku` (texto) y `file` (archivo). El nombre final lo genera el servidor.
import { getBaseCatalog } from "@/lib/data";
import { saveImage } from "@/lib/demo-store";
import { MAX_IMAGE_BYTES } from "@/lib/demo-store/config";
import { errorResponse, guard, json } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rejected = guard(request);
  if (rejected) return rejected;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_IMAGE_BYTES + 64 * 1024) return json({ error: { code: "IMAGE_TOO_LARGE", message: "La imagen supera los 2 MiB." } }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: { code: "INVALID_FORM", message: "El cuerpo no es un formulario válido." } }, 400);
  }
  const sku = form.get("sku");
  const file = form.get("file");
  if (typeof sku !== "string" || !(file instanceof File)) {
    return json({ error: { code: "INVALID_INPUT", message: "Faltan los campos sku y file." } }, 400);
  }
  try {
    const base = getBaseCatalog().map((p) => ({ sku: p.sku, slug: p.slug, categoryId: p.categoryId }));
    const saved = await saveImage(base, sku, file.type, new Uint8Array(await file.arrayBuffer()));
    return json(saved, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
