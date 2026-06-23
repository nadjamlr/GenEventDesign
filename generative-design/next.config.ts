import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 blocks client-side dev resources (HMR + JS) for origins other than
  // "localhost" by default. Allow 127.0.0.1 and the LAN IP so the app hydrates
  // when opened from those addresses too.
  allowedDevOrigins: ["127.0.0.1", "172.23.20.17"],
};

export default nextConfig;
