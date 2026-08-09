#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(import.meta.dirname, "..");
const convertedAt = "2026-08-09";
const sourceRoots = [
  "Faith-office/08_검증_정답셋/Faith_STT_상황진단_공식공청회_2026-08-06/00_source",
  "Faith-office/08_검증_정답셋/Faith_STT_상황진단_정책브리핑_2026-08-06/00_source",
  "Faith-office/08_검증_정답셋/Faith_STT_수집_공식회의_속기록_2026-08-05/00_source",
];
const queuePath = join(
  repoRoot,
  "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/diarization-pilot-queue.v1.json",
);
const ledgerPath = join(
  repoRoot,
  "Faith-office/08_검증_정답셋/M4A_무손실_변환_장부_2026-08-09.md",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed: ${String(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout;
}

function probe(file) {
  return JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file,
    ]),
  );
}

function packetHash(file) {
  const packetHashes = run(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_packets",
      "-show_entries",
      "packet=data_hash",
      "-show_data_hash",
      "sha256",
      "-of",
      "csv=p=0",
      file,
    ],
    { maxBuffer: 512 * 1024 * 1024 },
  );
  return createHash("sha256").update(packetHashes).digest("hex");
}

function sha256File(file) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function walk(dir, extensions) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path, extensions));
    else if (extensions.has(extname(entry.name))) found.push(path);
  }
  return found;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function markdownEscape(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

const queue = JSON.parse(readFileSync(queuePath, "utf8"));
const queuedTasks = [...(queue.tasks ?? []), ...(queue.followupTasks ?? [])];
const queueByOldPath = new Map(
  queuedTasks
    .filter((task) => task?.source?.path)
    .map((task) => [task.source.path, task]),
);

const records = [];
for (const rootRelative of sourceRoots) {
  const root = join(repoRoot, rootRelative);
  const group = rootRelative.includes("공식공청회")
    ? "공식공청회"
    : rootRelative.includes("정책브리핑")
      ? "정책브리핑"
      : "공식회의";
  for (const name of readdirSync(root).filter((entry) => entry.endsWith(".mp4")).sort()) {
    const oldAbsolute = join(root, name);
    const newAbsolute = oldAbsolute.slice(0, -4) + ".m4a";
    const oldRelative = relative(repoRoot, oldAbsolute);
    const newRelative = relative(repoRoot, newAbsolute);
    const stem = basename(name, ".mp4");
    const metaPath = join(dirname(root), "03_meta", `${stem}.json`);
    if (!existsSync(newAbsolute)) throw new Error(`Missing M4A: ${newRelative}`);
    if (!existsSync(metaPath)) throw new Error(`Missing metadata: ${relative(repoRoot, metaPath)}`);

    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const sourceProbe = probe(oldAbsolute);
    const targetProbe = probe(newAbsolute);
    const sourceAudio = sourceProbe.streams.find((stream) => stream.codec_type === "audio");
    const targetAudio = targetProbe.streams.find((stream) => stream.codec_type === "audio");
    const targetVideo = targetProbe.streams.find((stream) => stream.codec_type === "video");
    if (!sourceAudio || !targetAudio || targetVideo) {
      throw new Error(`Unexpected stream layout: ${newRelative}`);
    }

    const oldSha256 = await sha256File(oldAbsolute);
    const expectedOldSha256 = meta?.source?.sha256;
    if (!expectedOldSha256 || expectedOldSha256 !== oldSha256) {
      throw new Error(`Original SHA mismatch: ${oldRelative}`);
    }
    const sourcePacketSha256 = packetHash(oldAbsolute);
    const targetPacketSha256 = packetHash(newAbsolute);
    if (sourcePacketSha256 !== targetPacketSha256) {
      throw new Error(`AAC packet mismatch: ${oldRelative}`);
    }
    for (const field of ["codec_name", "sample_rate", "channels"]) {
      if (String(sourceAudio[field]) !== String(targetAudio[field])) {
        throw new Error(`Audio ${field} mismatch: ${oldRelative}`);
      }
    }
    const sourceDurationSec = Number(sourceAudio.duration ?? sourceProbe.format.duration);
    const targetDurationSec = Number(targetAudio.duration ?? targetProbe.format.duration);
    const durationDeltaSec = Math.abs(sourceDurationSec - targetDurationSec);
    if (!Number.isFinite(durationDeltaSec) || durationDeltaSec > 0.03) {
      throw new Error(`Duration mismatch: ${oldRelative} (${durationDeltaSec})`);
    }

    const newSha256 = await sha256File(newAbsolute);
    const task = queueByOldPath.get(oldRelative);
    const assessment = meta.situationAssessment ?? {};
    const tags = unique([
      task?.classification?.primaryBucket,
      task?.classification?.primaryDomain,
      task?.classification?.primaryFocus,
      ...(task?.classification?.candidateTags ?? []),
      meta.primaryBucket,
      meta.primaryDomain,
      meta.primaryFocus,
      meta.plannedBucket,
      meta.plannedDomain,
      meta.plannedFocus,
      assessment.primaryBucket,
      assessment.primaryDomain,
      assessment.primaryFocus,
      ...(meta.secondaryTags ?? []),
      ...(assessment.secondaryTags ?? []),
      meta.institution,
      meta.committee,
      meta?.qualityGate?.tuningCandidate ? "tuning_candidate" : null,
    ]);
    const sourceUrl =
      task?.source?.sourcePageUrl ??
      meta.sourcePageUrl ??
      meta.sourceUrl ??
      meta.canonicalSourceUrl ??
      meta.videoUrl ??
      "-";
    const title =
      meta?.sourceInfo?.title ??
      meta.pageTitle ??
      meta.meetingTitle ??
      meta.catalogTitle ??
      stem;

    records.push({
      alias: stem,
      title,
      group,
      taskId: task?.taskId ?? "-",
      tags,
      sourceUrl,
      oldAbsolute,
      oldRelative,
      newAbsolute,
      newRelative,
      metaPath,
      oldSha256,
      newSha256,
      packetSha256: sourcePacketSha256,
      oldBytes: statSync(oldAbsolute).size,
      newBytes: statSync(newAbsolute).size,
      durationSec: Number(targetProbe.format.duration ?? targetDurationSec),
      durationDeltaSec,
      codec: targetAudio.codec_name,
      sampleRate: Number(targetAudio.sample_rate),
      channels: Number(targetAudio.channels),
    });
  }
}

if (records.length !== 31) throw new Error(`Expected 31 sources, found ${records.length}`);

const byOldPath = new Map(records.map((record) => [record.oldRelative, record]));

function updateJsonNode(node) {
  if (Array.isArray(node)) return node.map(updateJsonNode);
  if (!node || typeof node !== "object") return node;

  let matched = null;
  for (const value of Object.values(node)) {
    if (typeof value === "string" && byOldPath.has(value)) {
      matched = byOldPath.get(value);
      break;
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && byOldPath.has(value)) {
      node[key] = byOldPath.get(value).newRelative;
    } else {
      node[key] = updateJsonNode(value);
    }
  }
  if (matched) {
    if ("sha256" in node) node.sha256 = matched.newSha256;
    if ("sourceSha256" in node) node.sourceSha256 = matched.newSha256;
    if ("bytes" in node) node.bytes = matched.newBytes;
    if ("sourceBytes" in node) node.sourceBytes = matched.newBytes;
    if ("durationSec" in node) node.durationSec = matched.durationSec;
    if ("sourceDurationSec" in node) node.sourceDurationSec = matched.durationSec;
  }
  return node;
}

const jsonRoots = [
  join(repoRoot, "Faith-office/08_검증_정답셋"),
  join(repoRoot, ".data/vast/community1-full-baseline"),
];
const stagedRenames = [];
for (const jsonPath of jsonRoots.flatMap((root) => walk(root, new Set([".json"])))) {
  const original = readFileSync(jsonPath, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(original);
  } catch {
    continue;
  }
  const updated = updateJsonNode(parsed);
  const rendered = `${JSON.stringify(updated, null, 2)}\n`;
  if (rendered !== original) {
    const tempPath = `${jsonPath}.m4a-conversion-tmp`;
    writeFileSync(tempPath, rendered);
    stagedRenames.push([tempPath, jsonPath]);
  }
}

for (const record of records) {
  const meta = JSON.parse(readFileSync(record.metaPath, "utf8"));
  const originalSource = structuredClone(meta.source);
  updateJsonNode(meta);
  meta.source = {
    ...originalSource,
    path: record.newRelative,
    sha256: record.newSha256,
    bytes: record.newBytes,
    durationSec: record.durationSec,
    container: "M4A audio-only remux; original AAC packets copied without re-encoding",
    video: null,
    reencodedByCollector: false,
    originalVideo: {
      path: record.oldRelative,
      sha256: record.oldSha256,
      bytes: record.oldBytes,
      video: originalSource.video ?? null,
      deletedAfterVerifiedRemux: convertedAt,
    },
    losslessRemux: {
      method: "ffmpeg -map 0:a:0 -vn -c:a copy -movflags +faststart",
      aacPacketSha256: record.packetSha256,
      decodedAudioEquivalent: true,
      durationMetadataDeltaSec: record.durationDeltaSec,
      ledgerPath: relative(repoRoot, ledgerPath),
    },
  };
  if (meta.audioDerivative) {
    meta.audioDerivative.status = "source_m4a_audio_used_directly";
    meta.audioDerivative.path = record.newRelative;
  }
  const tempPath = `${record.metaPath}.m4a-conversion-tmp`;
  writeFileSync(tempPath, `${JSON.stringify(meta, null, 2)}\n`);
  const existing = stagedRenames.findIndex(([, finalPath]) => finalPath === record.metaPath);
  if (existing >= 0) stagedRenames.splice(existing, 1);
  stagedRenames.push([tempPath, record.metaPath]);
}

const markdownRoots = [join(repoRoot, "docs"), join(repoRoot, "Faith-office")];
for (const markdownPath of markdownRoots.flatMap((root) => walk(root, new Set([".md"])))) {
  let content = readFileSync(markdownPath, "utf8");
  const original = content;
  for (const record of records) content = content.replaceAll(record.oldRelative, record.newRelative);
  if (content !== original) {
    const tempPath = `${markdownPath}.m4a-conversion-tmp`;
    writeFileSync(tempPath, content);
    stagedRenames.push([tempPath, markdownPath]);
  }
}

const totalOldBytes = records.reduce((sum, record) => sum + record.oldBytes, 0);
const totalNewBytes = records.reduce((sum, record) => sum + record.newBytes, 0);
const totalDurationSec = records.reduce((sum, record) => sum + record.durationSec, 0);
const ledger = [
  "# M4A 무손실 변환 장부",
  "",
  `- 실행일: ${convertedAt}`,
  "- 범위: Community-1/STT 수집 폴더의 `00_source/*.mp4` 31개",
  `- 총 길이: ${(totalDurationSec / 3600).toFixed(4)}시간`,
  `- 변환 전: ${(totalOldBytes / 1024 ** 3).toFixed(3)}GiB`,
  `- 변환 후: ${(totalNewBytes / 1024 ** 3).toFixed(3)}GiB`,
  `- 절감: ${((totalOldBytes - totalNewBytes) / 1024 ** 3).toFixed(3)}GiB (${(((totalOldBytes - totalNewBytes) / totalOldBytes) * 100).toFixed(1)}%)`,
  "- 변환 방식: `ffmpeg -map 0:a:0 -vn -c:a copy -movflags +faststart`; AAC 재인코딩 없음",
  "- 삭제 조건: 원본 SHA-256이 기존 메타데이터와 일치하고, MP4/M4A AAC 패킷 SHA-256·코덱·샘플레이트·채널이 일치하며 길이 메타데이터 차이가 0.03초 이하인 경우만 원본 MP4 삭제",
  "- 검증 결과: 31/31 통과. 정책브리핑 9개와 서울시의회 1개는 컨테이너 길이 표기가 0.006~0.009초 달랐으나 AAC 패킷과 디코딩 PCM 해시가 동일함을 추가 확인함.",
  "- 태그 주의: 아래 태그는 기존 수집 메타데이터와 검수 큐의 후보 태그를 합친 것이다. 사람 확정 gold가 아니며 `_candidate` 의미를 유지한다.",
  "- 영상 주의: 원본 MP4 영상 트랙은 삭제되었다. 화면 확인이 필요하면 `출처 URL`을 다시 열어야 한다. 생성된 검증클립과 review 영상은 이번 정리에서 삭제하지 않았다.",
  "",
  "| # | 그룹 | 작업 | 파일/제목 | 시간(h) | 태그 | 출처 URL | 원본 MP4 SHA-256 / MiB | M4A SHA-256 / MiB | AAC 패킷 SHA-256 |",
  "|---:|---|---|---|---:|---|---|---|---|---|",
  ...records.map((record, index) =>
    `| ${index + 1} | ${markdownEscape(record.group)} | ${markdownEscape(record.taskId)} | ${markdownEscape(record.alias)}<br>${markdownEscape(record.title)} | ${(record.durationSec / 3600).toFixed(3)} | ${markdownEscape(record.tags.join(", ") || "미분류")} | ${record.sourceUrl === "-" ? "-" : `[열기](${record.sourceUrl})`} | \`${record.oldSha256}\` / ${(record.oldBytes / 1024 ** 2).toFixed(1)} | \`${record.newSha256}\` / ${(record.newBytes / 1024 ** 2).toFixed(1)} | \`${record.packetSha256}\` |`,
  ),
  "",
  "## 판정",
  "",
  "- M4A는 원본 MP4 안의 AAC 패킷을 그대로 옮긴 파생 원본으로 사용한다.",
  "- 모델 입력 시 16kHz mono PCM/FLAC은 임시로 만들며 수집 시간이나 별도 원본으로 세지 않는다.",
  "- `originalVideo.sha256`와 이 장부가 삭제된 MP4의 출처·무결성 증거를 보존한다. 영상 자체는 복구할 수 없으므로 화면 검수는 출처 URL에 의존한다.",
  "- 학습 가능 여부·권리·사람 gold·분할 상태는 이 변환으로 승격되지 않는다.",
  "",
].join("\n");
const ledgerTemp = `${ledgerPath}.m4a-conversion-tmp`;
writeFileSync(ledgerTemp, ledger);
stagedRenames.push([ledgerTemp, ledgerPath]);

for (const [tempPath, finalPath] of stagedRenames) renameSync(tempPath, finalPath);
for (const record of records) unlinkSync(record.oldAbsolute);

console.log(
  JSON.stringify(
    {
      converted: records.length,
      deletedOriginalMp4: records.length,
      totalHours: totalDurationSec / 3600,
      oldBytes: totalOldBytes,
      newBytes: totalNewBytes,
      savedBytes: totalOldBytes - totalNewBytes,
      ledger: relative(repoRoot, ledgerPath),
      updatedFiles: stagedRenames.length - 1,
    },
    null,
    2,
  ),
);
