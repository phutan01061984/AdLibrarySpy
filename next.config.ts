import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel-ready: no rewrites needed since API routes are built-in
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
