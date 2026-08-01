import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const forbiddenFile =
  /(^|\/)\.env(?:$|\.)|(^|\/)backend\/\.env|(^|\/)(?:local\.env\.example|.*\.env\.example)$|(^|\/)(?:credentials|service-account)[^/]*\.json$|(?:^|\/)gha-creds-[^/]+\.json$/i;

const contentRules = [
  {
    name: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  {
    name: "openai-key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  },
];

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

function isBinary(buffer) {
  return buffer.includes(0);
}

const violations = [];

for (const file of trackedFiles()) {
  if (forbiddenFile.test(file)) {
    violations.push(`${file}: forbidden secret-bearing filename`);
    continue;
  }

  let stat;
  try {
    stat = statSync(resolve(root, file));
  } catch {
    continue;
  }
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) continue;

  const buffer = readFileSync(resolve(root, file));
  if (isBinary(buffer)) continue;
  const text = buffer.toString("utf8");
  for (const rule of contentRules) {
    if (rule.pattern.test(text)) {
      violations.push(`${file}: ${rule.name} pattern`);
    }
  }
}

if (violations.length > 0) {
  console.error("Secret hygiene check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Secret hygiene check passed.");
}
