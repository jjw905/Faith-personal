import type { NextConfig } from "next";

// 롤링 배포에서 Server Action ID가 어긋나지 않게 BUILD+RUNTIME에
// NEXT_SERVER_ACTIONS_ENCRYPTION_KEY를 동일하게 둔다. 코드에 키를 넣지 않는다.

function serverActionAllowedOrigins() {
  const configured = process.env.NEXT_SERVER_ACTION_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return configured?.length
    ? configured
    : ["localhost:3000", "localhost:3001", "dofaith.net", "www.dofaith.net"];
}

const nextConfig: NextConfig = {
  // 불필요한 X-Powered-By 응답 헤더 제거(대역폭, 정보 노출 최소화)
  poweredByHeader: false,
  // 롤링 배포 중 구버전 페이지가 새 서버를 치지 않도록 힌트
  deploymentId:
    process.env.DIGITALOCEAN_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    undefined,
  // STT/로컬 디스크 경로가 NFT에 저장소 전체를 넣지 않게 제외
  outputFileTracingExcludes: {
    "*": [
      "./.data/**/*",
      "./.venv*/**/*",
      "./Faith-office/**/*",
      "./.local-wip/**/*",
      "./.cursor/**/*",
      "./.playwright-cli/**/*",
      "./ml/**/*",
      "./scripts/**/*",
    ],
  },
  turbopack: {
    ignoreIssue: [
      {
        path: "./next.config.ts",
        title: /unexpected file in NFT list/i,
      },
    ],
  },
  experimental: {
    // lucide 전체 번들 스캔 줄여 빌드 시간 단축
    optimizePackageImports: ["lucide-react"],
    // 보관함 서버 경유(CORS 폴백) 업로드 여유
    proxyClientMaxBodySize: "32mb",
    serverActions: {
      bodySizeLimit: "32mb",
      allowedOrigins: [
        ...serverActionAllowedOrigins(),
      ],
    },
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    // Next 인라인/폰트/reCAPTCHA/실시간(OpenAI·LiveKit)·스토리지까지 허용.
    // nonce 방식은 전면 dynamic 강제라 정적 헤더로 1차 CSP를 둔다.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.google.com https://www.gstatic.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' blob: data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https: wss: blob:",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-src https://www.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(isDev ? [] : ["upgrade-insecure-requests"]),
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: csp },
          ...(isDev
            ? [
                {
                  key: "Cache-Control",
                  value:
                    "private, no-cache, no-store, max-age=0, must-revalidate",
                },
              ]
            : []),
        ],
      },
      {
        source: "/login",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/signup/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/forgot-password",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/reset-password",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
          // OWASP Forgot Password: referrer leakage 완화
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
