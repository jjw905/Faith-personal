import type { NerSpan } from "@/lib/masking/hybrid";

const DEFAULT_NER_URL =
  process.env.FAITH_NER_URL?.replace(/\/$/, "") || "http://127.0.0.1:8765";

export async function detectNerSpans(
  text: string,
  opts?: { timeoutMs?: number; url?: string },
): Promise<{ spans: NerSpan[]; ok: boolean; error?: string }> {
  if (!text.trim()) return { spans: [], ok: true };

  const url = `${opts?.url ?? DEFAULT_NER_URL}/detect`;
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { spans: [], ok: false, error: `NER HTTP ${res.status}` };
    }
    const data = (await res.json()) as { spans?: NerSpan[] };
    return { spans: data.spans ?? [], ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "NER unreachable";
    return { spans: [], ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function nerHealth(
  url = DEFAULT_NER_URL,
): Promise<{ ok: boolean; detail?: unknown }> {
  try {
    const res = await fetch(`${url}/health`, { cache: "no-store" });
    if (!res.ok) return { ok: false };
    return { ok: true, detail: await res.json() };
  } catch {
    return { ok: false };
  }
}
