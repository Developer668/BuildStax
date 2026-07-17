import type { NextConfig } from "next";

function securityHeaders(microphone: "()" | "(self)") {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: `camera=(), microphone=${microphone}, geolocation=()` },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    {
      key: "Content-Security-Policy",
      value:
        `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; connect-src 'self'; upgrade-insecure-requests`,
    },
  ];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/local-call",
        headers: securityHeaders("(self)"),
      },
      {
        source: "/((?!local-call$).*)",
        headers: securityHeaders("()"),
      },
    ];
  },
};

export default nextConfig;
