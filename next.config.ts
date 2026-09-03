import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["leaflet"],
  async rewrites() {
    // Fase 1.1: las rutas canónicas del módulo viven bajo /urbideas/*.
    // Las rutas históricas (/mapa, /municipios, /legislacion, /api-docs) se
    // conservan como alias de compatibilidad vía rewrite interno
    // (200, sin redirección, sin bucles, con query parameters intactos).
    // /admin y /api/* quedan excluidos intencionadamente.
    return [
      { source: "/mapa", destination: "/urbideas/mapa" },
      { source: "/municipios", destination: "/urbideas/municipios" },
      { source: "/municipios/:path*", destination: "/urbideas/municipios/:path*" },
      { source: "/legislacion", destination: "/urbideas/legislacion" },
      { source: "/api-docs", destination: "/urbideas/api-docs" },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.tile.openstreetmap.org" },
      { protocol: "https", hostname: "www.ign.es" },
      { protocol: "https", hostname: "server.arcgisonline.com" },
    ],
  },
};

export default nextConfig;
