/**
 * 브라우저 GET 동시 호출만 합친다.
 * TTL 캐시는 쓰지 않는다 — 갱신이 바로 안 되는 체감의 주원인.
 */

type StoredResponse = {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
};

const inflight = new Map<string, Promise<StoredResponse>>();

function toResponse(stored: StoredResponse): Response {
  return new Response(stored.body, {
    status: stored.status,
    statusText: stored.statusText,
    headers: stored.headers,
  });
}

/** 하위 호환: 예전 TTL 캐시 무효화 호출부용 no-op에 가깝게 유지 */
export function invalidateClientFetch(_match?: string | RegExp) {
  // inflight만 쓰는 구조라 별도 캐시 없음. 호출은 남겨 둔다.
}

async function fetchStored(
  url: string,
  signal?: AbortSignal,
): Promise<StoredResponse> {
  const res = await fetch(url, { cache: "no-store", signal });
  const body = await res.text();
  return {
    status: res.status,
    statusText: res.statusText,
    headers: [...res.headers.entries()],
    body,
  };
}

export async function clientGet(
  url: string,
  options?: { ttlMs?: number; signal?: AbortSignal },
): Promise<Response> {
  // AbortSignal이 있으면 공유하지 않는다.
  if (options?.signal) {
    return toResponse(await fetchStored(url, options.signal));
  }

  let pending = inflight.get(url);
  if (!pending) {
    pending = fetchStored(url).finally(() => {
      inflight.delete(url);
    });
    inflight.set(url, pending);
  }

  return toResponse(await pending);
}
