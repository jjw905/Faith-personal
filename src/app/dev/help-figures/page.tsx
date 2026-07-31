import { notFound } from "next/navigation";

import {
  HelpFiguresClient,
  type HelpFigScene,
  type HelpFigVp,
} from "./help-figures-client";

function parseScene(raw: string | string[] | undefined): HelpFigScene {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "home" || v === "timeline" || v === "masking") return v;
  return "home";
}

function parseVp(raw: string | string[] | undefined): HelpFigVp {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "mobile" || v === "desktop") return v;
  return "desktop";
}

/** 도움말 PNG용 정지 장면. 픽션 문구만. production 숨김. */
export default async function HelpFiguresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  return (
    <HelpFiguresClient scene={parseScene(sp.scene)} vp={parseVp(sp.vp)} />
  );
}
