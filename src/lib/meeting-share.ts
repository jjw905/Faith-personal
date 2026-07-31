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
