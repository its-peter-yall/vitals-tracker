import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql", "tesseract.js", "tesseract.js-core"],
  async headers() {
    return [{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-store" }] }];
  },
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: "/", destination: "/icons/foundation.html" }] };
  },
};

export default nextConfig;
