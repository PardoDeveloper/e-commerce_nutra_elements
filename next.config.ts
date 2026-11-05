import type { NextConfig } from "next";

// Mientras SITE_INDEXABLE no sea "true", todo el sitio sale con noindex
// también por cabecera (cubre imágenes y archivos). Ver contrato SEO 06, sección 2.
const indexable = process.env.SITE_INDEXABLE === "true";

// Las URL del pedido llevan el token de acceso (?t=): nunca se envían como Referer a otros sitios
// (A2, functions.md 3.3.1). Aplica al checkout, al retorno de Flow y a la página del pedido.
const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];

const nextConfig: NextConfig = {
  trailingSlash: false,
  poweredByHeader: false,
  // Tope de vida del HTML en caché (D-049). Por defecto Next usa 1 año y envía
  // `stale-while-revalidate=31535880`: el CDN de App Hosting seguía sirviendo fichas sin
  // los descuentos nuevos. Con 300 s: `s-maxage=120, stale-while-revalidate=180`, y la caché
  // ISR de cada instancia regenera de forma bloqueante lo que tenga más de 5 minutos.
  expireTime: 300,
  // Las preguntas frecuentes se movieron al final de la página principal.
  async redirects() {
    return [{ source: "/preguntas-frecuentes", destination: "/#preguntas-frecuentes", permanent: true }];
  },
  async headers() {
    return [
      { source: "/checkout/:path*", headers: noReferrer },
      { source: "/checkout", headers: noReferrer },
      { source: "/pedido/:path*", headers: noReferrer },
      ...(indexable ? [] : [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }]),
    ];
  },
};

export default nextConfig;
