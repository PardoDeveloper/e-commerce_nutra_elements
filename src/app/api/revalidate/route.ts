// POST /api/revalidate: recibe la revalidación firmada que envían los triggers de Functions
// (contrato functions.md 8.2, D-022, D-031). El secreto compartido es la única autenticación.
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { parseBody, verifyRequest } from "./verify";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request): Promise<NextResponse> {
  // Cuerpo crudo: la firma se calcula sobre el texto exacto, no sobre el JSON re-serializado.
  const rawBody = await request.text();
  if (rawBody.length > 16_384) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400, headers: NO_STORE });

  const verdict = verifyRequest(
    process.env.REVALIDATE_SECRET,
    request.headers.get("x-ne-timestamp"),
    request.headers.get("x-ne-signature"),
    rawBody,
  );
  if (verdict !== "ok") return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });

  const body = parseBody(rawBody);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400, headers: NO_STORE });

  for (const path of body.paths) revalidatePath(path);
  // Las lecturas no usan etiquetas de caché, así que cada etiqueta se traduce a rutas.
  // "settings" afecta la oferta de envío en todas las fichas de producto.
  if (body.tags.includes("settings")) revalidatePath("/productos/[slug]", "page");

  return NextResponse.json({ revalidated: true, paths: body.paths, tags: body.tags }, { headers: NO_STORE });
}
