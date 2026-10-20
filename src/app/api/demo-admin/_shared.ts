import "server-only";
// Piezas comunes de las rutas de escritura de la demo (D-030).
import { revalidatePath } from "next/cache";
import { DemoStoreError } from "@/lib/demo-store";
import { rejectWrite } from "@/lib/demo-store/guard";

/** Respuesta JSON sin caché. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** 404 vacío: con la persistencia desactivada estas rutas "no existen". */
export function notFoundResponse(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** Devuelve una respuesta de rechazo (404 o 403) o null si la petición puede continuar. */
export function guard(request: Request): Response | null {
  const rejected = rejectWrite(request);
  if (rejected === 404) return notFoundResponse();
  if (rejected === 403) return json({ error: { code: "FORBIDDEN", message: "Petición no permitida." } }, 403);
  return null;
}

export function errorResponse(error: unknown): Response {
  if (error instanceof DemoStoreError) {
    if (error.status === 404) return notFoundResponse();
    return json({ error: { code: error.code, message: error.message, details: error.details } }, error.status);
  }
  console.error("[demo-admin]", error);
  return json({ error: { code: "INTERNAL", message: "Error interno del servidor de la demo." } }, 500);
}

/** Revalida lo que cambia al editar productos (igual que hará la revalidación bajo demanda real, D-022). */
export function revalidateCatalog(slugs: readonly string[], categories: readonly string[]): void {
  for (const slug of new Set(slugs)) revalidatePath(`/productos/${slug}`);
  for (const category of new Set(categories)) revalidatePath(`/categorias/${category}`);
  revalidatePath("/productos");
  revalidatePath("/");
  revalidatePath("/sitemap.xml");
}
