/** easeOutCubic — 초반에 빨리 가고 끝만 부드럽게. */
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

let activeScroll: number | null = null;

/**
 * 해시 앵커로 스크롤.
 * CSS scroll-behavior:smooth와 겹치지 않게 잠시 끈 뒤 rAF로 이동.
 */
export function scrollToHash(href: string, durationMs = 720) {
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
    activeScroll = null;
  }

  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  root.setAttribute("data-programmatic-scroll", "1");

  const startTime = performance.now();
  // 거리 짧으면 더 짧게
  const duration = Math.min(
    durationMs,
    Math.max(320, Math.abs(distance) * 0.45),
  );

  const finish = () => {
    activeScroll = null;
    root.style.scrollBehavior = prevBehavior;
    root.removeAttribute("data-programmatic-scroll");
    window.history.pushState(null, "", `#${id}`);
  };

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(progress);
    window.scrollTo(0, startY + distance * eased);

    if (progress < 1) {
      activeScroll = window.requestAnimationFrame(step);
    } else {
      finish();
    }
  };

  activeScroll = window.requestAnimationFrame(step);
}
