import type { NextConfig } from "next";

// Mientras SITE_INDEXABLE no sea "true", todo el sitio sale con noindex
// también por cabecera (cubre imágenes y archivos). Ver contrato SEO 06, sección 2.
const indexable = process.env.SITE_INDEXABLE === "true";

const nextConfig: NextConfig = {
  trailingSlash: false,
  poweredByHeader: false,
  async headers() {
    if (indexable) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
