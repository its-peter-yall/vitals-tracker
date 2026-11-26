import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "tesseract.js", "tesseract.js-core"],
};

export default nextConfig;
