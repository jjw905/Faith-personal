import type { NextConfig } from "next";

// 롤링 배포에서 Server Action ID가 어긋나지 않게 BUILD+RUNTIME에
// NEXT_SERVER_ACTIONS_ENCRYPTION_KEY를 동일하게 둔다. 코드에 키를 넣지 않는다.

const nextConfig: NextConfig = {
  // 불필요한 X-Powered-By 응답 헤더 제거(대역폭, 정보 노출 최소화)
  poweredByHeader: false,
  // 롤링 배포 중 구버전 페이지가 새 서버를 치지 않도록 힌트
  deploymentId:
    process.env.DIGITALOCEAN_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    undefined,
  experimental: {
    // lucide 전체 번들 스캔 줄여 빌드 시간 단축
    optimizePackageImports: ["lucide-react"],
    // 보관함 서버 경유(CORS 폴백) 업로드 여유
    proxyClientMaxBodySize: "32mb",
    serverActions: {
      bodySizeLimit: "32mb",
      allowedOrigins: [
        "faith-web-r9q5i.ondigitalocean.app",
        "localhost:3000",
      ],
    },
  },
  async headers() {
    const isDev = process.env.NODE_ENV === "development";
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
        ],
      },
    ];
  },
};

export default nextConfig;
