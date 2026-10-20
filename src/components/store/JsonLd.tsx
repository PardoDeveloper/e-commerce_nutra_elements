import { serializeJsonLd, type JsonLdNode } from "@/lib/seo";

/** Bloque JSON-LD renderizado en el servidor (parte del HTML inicial). */
export function JsonLd({ data }: { data: JsonLdNode }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
