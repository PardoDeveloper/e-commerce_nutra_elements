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
