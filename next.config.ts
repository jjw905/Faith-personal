import type { NextConfig } from "next";

// 배포마다 Server Action ID가 바뀌지 않도록 빌드 시 고정 키 사용.
// DO App Platform에도 동일 값을 BUILD+RUNTIME으로 넣는 것을 권장.
if (!process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY?.trim()) {
  process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY =
    "Rqh8n3sxfdbd69IuHuiSD9Ha/1nuLB1o75zE/YhEgLE=";
}

const nextConfig: NextConfig = {
  // 롤링 배포 중 구버전 페이지가 새 서버를 치지 않도록 힌트
  deploymentId:
    process.env.DIGITALOCEAN_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    undefined,
  experimental: {
    // lucide 전체 번들 스캔 줄여 빌드 시간 단축
    optimizePackageImports: ["lucide-react"],
    proxyClientMaxBodySize: "12mb",
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: [
        "faith-web-r9q5i.ondigitalocean.app",
        "localhost:3000",
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
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
