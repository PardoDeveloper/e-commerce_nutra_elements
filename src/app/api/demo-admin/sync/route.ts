// Revalida todo el sitio. Lo llama `scripts/demo-start.mjs` al arrancar: las páginas generadas en el
// build no conocen lo guardado en sesiones anteriores (D-030).
import { revalidatePath } from "next/cache";
import { errorResponse, guard, json } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rejected = guard(request);
  if (rejected) return rejected;
  try {
    revalidatePath("/", "layout");
    return json({ synced: true });
  } catch (error) {
    return errorResponse(error);
  }
}
