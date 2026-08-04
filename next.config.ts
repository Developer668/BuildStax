import type { NextConfig } from "next";

/**
 * Origins the embedded Dograh Web Call widget needs (dev-only, and only when the
 * feature is configured). Mirrors `dograhCspOrigins` in `src/lib/integrations/dograh.ts`,
 * inlined here because `next.config` cannot import the `"server-only"` app module.
 */
function dograhOrigins(): string[] {
  if (process.env.NODE_ENV === "production" || process.env.APP_MODE === "production") return [];
  if (process.env.DOGRAH_LOCAL_CALLS_ENABLED !== "true") return [];
  const scriptUrl = process.env.DOGRAH_WIDGET_SCRIPT_URL?.trim();
  if (!scriptUrl) return [];
  let origin = process.env.DOGRAH_ORIGIN?.trim() || "";
  if (!origin) {
    try {
      origin = new URL(scriptUrl).origin;
    } catch {
      return [];
    }
  }
  const origins = new Set<string>([origin]);
  if (origin.startsWith("http://")) origins.add(`ws://${origin.slice("http://".length)}`);
  else if (origin.startsWith("https://")) origins.add(`wss://${origin.slice("https://".length)}`);
  return [...origins];
}

function securityHeaders(microphone: "()" | "(self)", dograh: string[] = []) {
  const dev = process.env.NODE_ENV === "development";
  const httpExtra = (() => {
    const http = dograh.filter((origin) => origin.startsWith("http"));
    return http.length ? ` ${http.join(" ")}` : "";
  })();
  const connectExtra = dograh.length ? ` ${dograh.join(" ")}` : "";
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    `img-src 'self' data: blob:${httpExtra}`,
    `font-src 'self' data:${httpExtra}`,
    `style-src 'self' 'unsafe-inline'${httpExtra}`,
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${httpExtra}`,
    `connect-src 'self'${connectExtra}`,
  ];
  if (dograh.length) {
    directives.push(`frame-src 'self'${httpExtra}`);
    directives.push(`worker-src 'self' blob:${httpExtra}`);
    directives.push(`media-src 'self' blob:${httpExtra}`);
  }
  directives.push("upgrade-insecure-requests");
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: `camera=(), microphone=${microphone}, geolocation=()` },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    { key: "Content-Security-Policy", value: directives.join("; ") },
  ];
}

const nextConfig: NextConfig = {
  ...(process.env.BUILDSTAX_NEXT_DIST_DIR ? { distDir: process.env.BUILDSTAX_NEXT_DIST_DIR } : {}),
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  async headers() {
    const dograh = dograhOrigins();
    const businessCallMicrophone = dograh.length ? "(self)" : "()";
    return [
      {
        source: "/local-call",
        headers: securityHeaders("(self)"),
      },
      {
        // Secondary browser-based Dograh voice call, scoped per business.
        source: "/businesses/:id/local-call",
        headers: securityHeaders(businessCallMicrophone, dograh),
      },
      {
        source: "/((?!.*local-call$).*)",
        headers: securityHeaders("()"),
      },
    ];
  },
};

export default nextConfig;
