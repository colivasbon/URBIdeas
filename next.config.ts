import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["leaflet"],
  async rewrites() {
    // Fase 1 IDEAS Sostenibilidad: alias de compatibilidad del módulo URBideas.
    // Las rutas históricas (/mapa, /municipios, /legislacion, /api-docs) no se mueven;
    // /urbideas/* las reutiliza vía rewrite interno (200, sin redirección ni bucles).
    // /admin y /api/* quedan excluidos intencionadamente.
    return [
      { source: "/urbideas/mapa", destination: "/mapa" },
      { source: "/urbideas/municipios", destination: "/municipios" },
      { source: "/urbideas/municipios/:path*", destination: "/municipios/:path*" },
      { source: "/urbideas/legislacion", destination: "/legislacion" },
      { source: "/urbideas/api-docs", destination: "/api-docs" },
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
