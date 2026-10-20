// Borra los cambios guardados y las imágenes: vuelve al catálogo original (D-030).
import { revalidatePath } from "next/cache";
import { resetStore } from "@/lib/demo-store";
import { errorResponse, guard, json } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rejected = guard(request);
  if (rejected) return rejected;
  try {
    await resetStore();
    revalidatePath("/", "layout");
    return json({ reset: true });
  } catch (error) {
    return errorResponse(error);
  }
}
