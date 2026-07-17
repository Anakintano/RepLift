import type { NextConfig } from "next";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/**
 * STATIC_EXPORT=1 builds the GitHub Pages demo: fully static, served under
 * /RepLift, running the in-browser mock backend (NEXT_PUBLIC_API_MODE unset).
 * Default build keeps the same-origin proxy to FastAPI for the full stack.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath: "/RepLift",
      images: { unoptimized: true },
    }
  : {
      // Same-origin proxy to FastAPI: auth cookies flow without CORS gymnastics.
      async rewrites() {
        return [
          { source: "/api/v1/:path*", destination: `${BACKEND}/api/v1/:path*` },
        ];
      },
    };

export default nextConfig;
