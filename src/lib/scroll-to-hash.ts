/** easeInOutCubic — 시작·끝이 부드러운 스크롤 곡선. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

let activeScroll: number | null = null;

/**
 * 해시 앵커로 천천히 자동 스크롤.
 * 브라우저 기본 smooth보다 duration을 길게 잡아 여유 있게 이동.
 */
export function scrollToHash(href: string, durationMs = 1600) {
  const id = href.startsWith("#") ? href.slice(1) : href;
  const el = document.getElementById(id);
  if (!el) return;

  const header = document.querySelector("header");
  const headerOffset = header instanceof HTMLElement ? header.offsetHeight : 0;
  const targetY =
    el.getBoundingClientRect().top + window.scrollY - headerOffset - 8;
  const startY = window.scrollY;
  const distance = targetY - startY;

  if (Math.abs(distance) < 2) {
    window.history.pushState(null, "", `#${id}`);
    return;
  }

  if (activeScroll !== null) {
    window.cancelAnimationFrame(activeScroll);
  }

  const startTime = performance.now();

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeInOutCubic(progress);
    // CSS scroll-behavior:smooth 간섭 방지
    window.scrollTo({ top: startY + distance * eased, behavior: "auto" });

    if (progress < 1) {
      activeScroll = window.requestAnimationFrame(step);
    } else {
      activeScroll = null;
      window.history.pushState(null, "", `#${id}`);
    }
  };

  activeScroll = window.requestAnimationFrame(step);
}
