import type { MaskStyle } from "@/lib/masking";

/** 회의 링크 공유. Web Share → 클립보드 폴백. */
export async function shareMeetingLink(payload: {
  title: string;
  url?: string;
}): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const url =
    payload.url ??
    (typeof window !== "undefined" ? window.location.href : "");
  const data = {
    title: payload.title,
    text: payload.title,
    url,
  };

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const can =
        typeof navigator.canShare !== "function" || navigator.canShare(data);
      if (can) {
        await navigator.share(data);
        return "shared";
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

/** 공유 링크에 파일/화면과 같은 개인정보 가림 정책을 전달한다. */
export function buildMeetingShareUrl(
  maskStyle: MaskStyle,
  baseUrl?: string,
): string {
  const rawUrl =
    baseUrl ?? (typeof window !== "undefined" ? window.location.href : "");
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (maskStyle === "off") url.searchParams.delete("mask");
    else url.searchParams.set("mask", maskStyle);
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function resolveMeetingShareMask(
  value: string | string[] | undefined,
): MaskStyle | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "partial" || raw === "off") return raw;
  // 구 공유 링크의 [유형] 표기 → 부분 가림으로 호환
  if (raw === "label") return "partial";
  return null;
}
