/** Auth 분기 응답 시간을 비슷하게 맞춤 (존재 여부 타이밍 유출 완화). */

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withAuthTiming<T>(
  minMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const elapsed = Date.now() - started;
    if (elapsed < minMs) {
      await sleep(minMs - elapsed);
    }
  }
}
