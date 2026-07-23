import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCAL_KEY_DIR = join(process.cwd(), ".data", "crypto");
const LOCAL_KEY_PATH = join(LOCAL_KEY_DIR, "notifications.key");

function resolveKeyMaterial(): Buffer {
  const secret =
    process.env.NOTIFICATION_ENC_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (secret) {
    return createHash("sha256")
      .update(`faith-notifications:v1:${secret}`)
      .digest();
  }

  if (!existsSync(LOCAL_KEY_DIR)) mkdirSync(LOCAL_KEY_DIR, { recursive: true });
  if (existsSync(LOCAL_KEY_PATH)) {
    return Buffer.from(readFileSync(LOCAL_KEY_PATH, "utf8").trim(), "hex");
  }
  const key = randomBytes(32);
  writeFileSync(LOCAL_KEY_PATH, key.toString("hex"), { mode: 0o600 });
  return key;
}

/** AES-256-GCM. AUTH_SECRET 또는 로컬 키로 암호화. */
export function sealJson(value: unknown): string {
  const key = resolveKeyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(value), "utf8");
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function openSealedJson<T>(sealed: string): T | null {
  try {
    const [ver, ivB64, tagB64, dataB64] = sealed.split(".");
    if (ver !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
    const key = resolveKeyMaterial();
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as T;
  } catch {
    return null;
  }
}
