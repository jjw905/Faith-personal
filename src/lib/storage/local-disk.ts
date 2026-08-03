import { mkdir, open, readFile, unlink, writeFile } from "fs/promises";
import path from "node:path";

import { faithDataPath } from "@/lib/faith-data-root";

const ROOT = faithDataPath("vault");

function resolveKey(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(path.resolve(ROOT) + path.sep) && full !== path.resolve(ROOT)) {
    throw new Error("잘못된 저장 경로입니다.");
  }
  return full;
}

/** 로컬 vault 파일 절대경로. Range 스트리밍용. */
export function localObjectPath(key: string) {
  return resolveKey(key);
}

export async function localPutObject(key: string, data: Buffer) {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function localReadObject(key: string) {
  const full = resolveKey(key);
  return readFile(full);
}

export async function localReadObjectRange(
  key: string,
  start: number,
  end: number,
) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new Error("잘못된 저장 범위입니다.");
  }
  const handle = await open(resolveKey(key), "r");
  try {
    const body = Buffer.allocUnsafe(end - start + 1);
    const { bytesRead } = await handle.read(body, 0, body.length, start);
    if (bytesRead !== body.length) {
      throw new Error("저장 파일 범위를 끝까지 읽지 못했습니다.");
    }
    return body;
  } finally {
    await handle.close();
  }
}

export async function localHeadObject(key: string) {
  const buf = await localReadObject(key);
  return { size: buf.length };
}

export async function localDeleteObject(key: string) {
  const full = resolveKey(key);
  await unlink(full).catch(() => undefined);
}
