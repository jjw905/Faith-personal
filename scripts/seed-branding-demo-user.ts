/**
 * 브랜딩·홍보 캡처용 로컬 일반 계정 + 완료 회의 시드.
 *
 *   bash scripts/with-local-secrets.sh -- \\
 *     env NODE_OPTIONS=--conditions=react-server \\
 *     npx tsx --tsconfig tsconfig.json scripts/seed-branding-demo-user.ts
 *
 * 비밀번호는 로그에 출력하지 않습니다. (로컬 공통 시드 비밀번호와 동일)
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Plan, Prisma, Role } from "@prisma/client";

import { LOCAL_DEV_ADMIN_PASSWORD } from "../src/lib/ensure-admin";
import { faithDataPath } from "../src/lib/faith-data-root";
import { resolveDateFromDaysAgo } from "../src/lib/meeting-date";
import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";
import { DEFAULT_STT_MODEL } from "../src/lib/stt/models";
import type { Meeting } from "../src/types/meeting";
import type { MeetingTimeline } from "../src/types/timeline";
import type { MeetingTranscript } from "../src/types/transcript";

config({ path: ".env.local" });
config();

export const BRANDING_DEMO_EMAIL = "faith-brand@faith.local";
export const BRANDING_DEMO_NAME = "정하은";
export const BRANDING_DEMO_HANDLE = "faith-brand";

const ROOT = process.cwd();

type MeetingMock = Omit<Meeting, "date"> & {
  date?: string;
  daysAgo?: number;
  time?: string;
};

type SeedSpec = {
  id: string;
  sourceMeetingId: string;
  daysAgo: number;
  time: string;
  title?: string;
};

/** 목록 상단에 오도록 최근 일자. 목업 카탈로그와 id가 겹치지 않게 brand- 접두. */
const SEEDS: SeedSpec[] = [
  {
    id: "brand-mtg-campaign",
    sourceMeetingId: "mtg-001",
    daysAgo: 0,
    time: "14:30:00",
    title: "3분기 마케팅 캠페인 킥오프",
  },
  {
    id: "brand-mtg-launch",
    sourceMeetingId: "mtg-002",
    daysAgo: 1,
    time: "10:00:00",
    title: "신제품 출시 D-60 일정 조율",
  },
  {
    id: "brand-mtg-support",
    sourceMeetingId: "mtg-003",
    daysAgo: 2,
    time: "16:00:00",
    title: "고객지원 프로세스 개선 회의",
  },
  {
    id: "brand-mtg-standup",
    sourceMeetingId: "mtg-004",
    daysAgo: 3,
    time: "09:30:00",
    title: "주간 팀 스탠드업",
  },
];

function brandingPassword() {
  // 홍보용 로컬 계정은 항상 공개된 로컬 기본 비밀번호로 맞춤.
  // TEAM/ADMIN_SEED_PASSWORD와 섞이면 안내한 비밀번호로 로그인이 안 된다.
  return LOCAL_DEV_ADMIN_PASSWORD;
}

function loadJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(ROOT, relative), "utf8")) as T;
}

function resolveMeeting(
  raw: MeetingMock,
  overrides: { id: string; title?: string; daysAgo: number; time: string },
): Meeting {
  const { daysAgo: _d, time: _t, date: _date, ...rest } = raw;
  return {
    ...rest,
    id: overrides.id,
    title: overrides.title ?? raw.title,
    tags: raw.tags ?? [],
    summaryTags: raw.summaryTags ?? [],
    workspace: "personal",
    status: "completed",
    date: resolveDateFromDaysAgo(overrides.daysAgo, overrides.time),
  };
}

async function ensureBrandingUser() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("production에서는 브랜딩 데모 계정을 만들지 않습니다.");
  }

  const passwordHash = await hashPassword(brandingPassword());
  const user = await prisma.user.upsert({
    where: { email: BRANDING_DEMO_EMAIL },
    create: {
      email: BRANDING_DEMO_EMAIL,
      name: BRANDING_DEMO_NAME,
      handle: BRANDING_DEMO_HANDLE,
      inviteCode: "BRANDDEMO",
      role: Role.USER,
      plan: Plan.PRO,
      emailVerified: new Date(),
      passwordHash,
      signupProvider: "credentials",
      disabled: false,
    },
    update: {
      name: BRANDING_DEMO_NAME,
      handle: BRANDING_DEMO_HANDLE,
      role: Role.USER,
      plan: Plan.PRO,
      emailVerified: new Date(),
      passwordHash,
      disabled: false,
    },
    select: { id: true, email: true, name: true, role: true, plan: true },
  });
  return user;
}

async function seedMeetings(userId: string) {
  const meetingsFile = loadJson<{ meetings: MeetingMock[] }>(
    "src/mocks/meetings.json",
  );
  const transcriptsFile = loadJson<{
    transcripts: Record<string, MeetingTranscript>;
  }>("src/mocks/meeting-transcripts.json");
  const timelinesFile = loadJson<{
    timelines: Record<string, MeetingTimeline>;
  }>("src/mocks/meeting-timelines.json");

  const byId = new Map(meetingsFile.meetings.map((m) => [m.id, m]));
  const now = new Date().toISOString();
  let saved = 0;

  for (const spec of SEEDS) {
    const source = byId.get(spec.sourceMeetingId);
    if (!source) {
      console.warn(`[seed] skip — mock meeting 없음: ${spec.sourceMeetingId}`);
      continue;
    }
    const transcript =
      transcriptsFile.transcripts[spec.sourceMeetingId] ??
      transcriptsFile.transcripts.default;
    const timeline =
      timelinesFile.timelines[spec.sourceMeetingId] ??
      timelinesFile.timelines.default;
    if (!transcript?.lines?.length) {
      console.warn(`[seed] skip — transcript 없음: ${spec.sourceMeetingId}`);
      continue;
    }

    const meeting = resolveMeeting(source, spec);
    const record = {
      id: spec.id,
      userId,
      model: DEFAULT_STT_MODEL,
      analysisMode: "precision",
      phase: "done",
      progressPercent: 100,
      createdAt: meeting.date,
      updatedAt: now,
      workspace: "personal",
      meeting,
      transcript: {
        ...transcript,
        meetingId: spec.id,
        lines: transcript.lines.map((line, index) => ({
          ...line,
          id: `${spec.id}-l${index + 1}`,
        })),
      },
      timeline: {
        ...timeline,
        meetingId: spec.id,
      },
    };

    // 개인 워크스페이스는 암호화 envelope 없이 payload만 저장 (server-only 우회).
    const createdAt = new Date(meeting.date);
    const updatedAt = new Date(now);
    await prisma.userMeetingRecord.upsert({
      where: { id: spec.id },
      create: {
        id: spec.id,
        userId,
        workspace: "personal",
        phase: "done",
        progressPercent: 100,
        payload: record as unknown as Prisma.InputJsonValue,
        createdAt: Number.isFinite(createdAt.getTime()) ? createdAt : new Date(),
        updatedAt,
      },
      update: {
        userId,
        workspace: "personal",
        phase: "done",
        progressPercent: 100,
        payload: record as unknown as Prisma.InputJsonValue,
        updatedAt,
      },
    });

    // 파일 백엔드(DURABLE_STATE_BACKEND≠database)도 대비.
    const fileRoot = faithDataPath("user-meetings");
    mkdirSync(fileRoot, { recursive: true });
    writeFileSync(
      join(fileRoot, `${spec.id}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );

    saved += 1;
    console.log(`[seed] 회의: ${spec.id} — ${meeting.title}`);
  }
  return saved;
}

async function main() {
  const user = await ensureBrandingUser();
  console.log(
    `[seed] 계정: ${user.email} (${user.name}, role=${user.role}, plan=${user.plan})`,
  );
  console.warn("[seed] 비밀번호는 로그에 출력하지 않습니다.");

  // 예전 브랜딩 시드 id도 정리해 목록에 메타성 제목이 남지 않게 한다.
  const obsoleteIds = [
    "brand-mtg-security",
    "brand-mtg-masking",
    "brand-mtg-rbac",
  ];
  for (const id of obsoleteIds) {
    await prisma.userMeetingRecord.deleteMany({ where: { id } });
    try {
      unlinkSync(join(faithDataPath("user-meetings"), `${id}.json`));
    } catch {
      // 파일 없으면 무시
    }
  }

  const count = await seedMeetings(user.id);
  console.log(`[seed] 완료 회의 ${count}건`);
  console.log(`[seed] 로그인: ${BRANDING_DEMO_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
