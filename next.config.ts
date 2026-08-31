import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["leaflet"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.tile.openstreetmap.org" },
      { protocol: "https", hostname: "www.ign.es" },
      { protocol: "https", hostname: "server.arcgisonline.com" },
    ],
  },
};

export default nextConfig;
