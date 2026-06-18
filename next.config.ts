import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["rss-parser"],
  // Baseline security headers (safe; CSP omitted for now to avoid breaking the
  // app's inline styles — add it later in Report-Only first).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
