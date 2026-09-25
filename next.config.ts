import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AliExpress-Produktbilder (Live-Modus) und Platzhalter im Mock-Modus
    remotePatterns: [
      { protocol: "https", hostname: "**.alicdn.com" },
      { protocol: "https", hostname: "**.aliexpress-media.com" },
    ],
  },
};

export default nextConfig;
