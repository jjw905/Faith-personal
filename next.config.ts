import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 프리사인 업로드가 기본. 서버 액션/프록시 여유분만 확보.
    proxyClientMaxBodySize: "12mb",
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
