import { notFound } from "next/navigation";

import { FeaturePreviewClient } from "@/app/dev/feature-preview/feature-preview-client";

/** 로컬 임시. 제작중 / 중간저장 / 음성+대사. */
export default function FeaturePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FeaturePreviewClient />;
}
