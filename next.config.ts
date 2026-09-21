import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow this LAN machine's IP so other PCs on the network can open the dashboard in dev mode.
  allowedDevOrigins: ['10.10.50.104'],
};

export default nextConfig;
