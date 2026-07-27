/** overflow 스크롤 조상. html/body·실제 스크롤 불가 노드는 제외. */
export function getScrollParent(el: HTMLElement): HTMLElement | null {
  let p: HTMLElement | null = el.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const { overflowY } = getComputedStyle(p);
    const canY =
      overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    // 내용이 넘칠 때만 스크롤 컨테이너로 인정 (마케팅 페이지 html overflow-x 오인 방지)
    if (canY && p.scrollHeight > p.clientHeight + 1) {
      return p;
    }
    p = p.parentElement;
  }
  return null;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

let activeScroll: number | null = null;

/**
 * 스크롤 컨테이너 기준 요소를 세로 가운데로 이동.
 */
export function scrollElementToCenter(el: HTMLElement, durationMs = 480) {
  const root = getScrollParent(el);
  if (!root) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const start = root.scrollTop;
  const elMid =
    elRect.top - rootRect.top + start + elRect.height / 2;
  const target = Math.max(0, elMid - root.clientHeight / 2);
  const distance = target - start;

  if (Math.abs(distance) < 2) return;

  if (activeScroll !== null) {
    window.cancelAnimationFrame(activeScroll);
    activeScroll = null;
  }

  const startTime = performance.now();
  const duration = Math.min(
    durationMs,
    Math.max(280, Math.abs(distance) * 0.4),
  );

  const step = (now: number) => {
    const progress = Math.min((now - startTime) / duration, 1);
    root.scrollTop = start + distance * easeOutCubic(progress);
    root.dispatchEvent(new Event("scroll"));
    if (progress < 1) {
      activeScroll = window.requestAnimationFrame(step);
    } else {
      activeScroll = null;
    }
  };

  activeScroll = window.requestAnimationFrame(step);
}
