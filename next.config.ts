import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // OCI Object Storage native endpoint — sa-saopaulo-1.
      { protocol: "https", hostname: "objectstorage.sa-saopaulo-1.oraclecloud.com" },
    ],
  },
};

export default nextConfig;
