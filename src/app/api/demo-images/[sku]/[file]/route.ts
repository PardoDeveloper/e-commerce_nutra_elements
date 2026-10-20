// Sirve SOLO archivos de .demo-data/images (D-030). `public/` no sirve archivos agregados después
// del build, por eso existe esta ruta. Con la persistencia desactivada responde 404.
import { readImage } from "@/lib/demo-store";

export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ sku: string; file: string }> }): Promise<Response> {
  const { sku, file } = await params;
  // readImage valida SKU y nombre con regex estrictos y verifica que la ruta quede dentro de images/.
  const image = await readImage(sku, file);
  if (!image) return NOT_FOUND();
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.length),
      // Caché corta: el nombre es único por subida, pero Restablecer puede borrar el archivo.
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
