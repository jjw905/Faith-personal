/**
 * 제품기획팀용 테스트 계정과 예시 일정·공지를 upsert합니다.
 * 팀 대표는 로컬 어드민(faith-admin@faith.local)입니다.
 *
 *   npm run seed:team-roles
 *   npx tsx scripts/seed-team-role-users.ts
 */
import { config } from "dotenv";
import {
  TeamMeetingMode,
  TeamMeetingState,
} from "@prisma/client";

import {
  LOCAL_DEV_ADMIN_EMAIL,
} from "../src/lib/ensure-admin";
import { ensureLocalDevProductTeam } from "../src/lib/ensure-local-team";
import { prisma } from "../src/lib/prisma";

config({ path: ".env.local" });
config();

const DEMO_MEETING_TITLES = [
  "주간 제품 싱크",
  "스프린트 킥오프",
  "고객 피드백 리뷰",
] as const;

const DEMO_ANNOUNCEMENTS = [
  {
    title: "이번 주 온라인 회의 안내",
    body: "예정 회의는 시작 10분 전부터 입장할 수 있습니다. 입장 전 마이크와 입력 장치를 확인해 주세요.",
    pinned: true,
  },
  {
    title: "기록 열람 권한",
    body: "회의 기록은 초대받거나 열람 권한이 있는 멤버만 볼 수 있습니다. 권한이 필요하면 팀장에게 요청하세요.",
    pinned: false,
  },
  {
    title: "공지 확인 부탁",
    body: "중요한 공지는 상단에 고정됩니다. 확인 버튼을 누르면 읽음으로 표시됩니다.",
    pinned: false,
  },
] as const;

function atLocalDay(dayOffset: number, hour: number, minute = 0) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function seedDemoContent(params: {
  teamId: string;
  ownerId: string;
  leaderId: string;
  memberIds: string[];
}) {
  const { teamId, ownerId, leaderId, memberIds } = params;
  const allParticipantIds = Array.from(
    new Set([ownerId, leaderId, ...memberIds]),
  );

  await prisma.teamMeeting.deleteMany({
    where: {
      teamId,
      title: { in: [...DEMO_MEETING_TITLES] },
    },
  });
  await prisma.teamAnnouncement.deleteMany({
    where: {
      teamId,
      title: { in: DEMO_ANNOUNCEMENTS.map((row) => row.title) },
    },
  });

  const meetingSpecs = [
    {
      title: DEMO_MEETING_TITLES[0],
      start: atLocalDay(0, 14, 0),
      durationMinutes: 60,
      organizerId: ownerId,
    },
    {
      title: DEMO_MEETING_TITLES[1],
      start: atLocalDay(1, 10, 0),
      durationMinutes: 60,
      organizerId: leaderId,
    },
    {
      title: DEMO_MEETING_TITLES[2],
      start: atLocalDay(2, 16, 0),
      durationMinutes: 60,
      organizerId: leaderId,
    },
  ] as const;

  for (const spec of meetingSpecs) {
    await prisma.teamMeeting.create({
      data: {
        teamId,
        title: spec.title,
        mode: TeamMeetingMode.ONLINE,
        state: TeamMeetingState.SCHEDULED,
        scheduledStartAt: spec.start,
        durationMinutes: spec.durationMinutes,
        organizerId: spec.organizerId,
        createdById: spec.organizerId,
        access: {
          create: allParticipantIds.map((userId) => ({
            userId,
            isParticipant: true,
            canReadMasked: true,
          })),
        },
      },
    });
  }

  for (const row of DEMO_ANNOUNCEMENTS) {
    await prisma.teamAnnouncement.create({
      data: {
        teamId,
        authorId: ownerId,
        title: row.title,
        body: row.body,
        pinned: row.pinned,
      },
    });
  }

  console.log(
    `[seed] 예시 일정 ${meetingSpecs.length}건, 공지 ${DEMO_ANNOUNCEMENTS.length}건`,
  );
}

async function main() {
  const team = await ensureLocalDevProductTeam();
  if (!team.ok) {
    throw new Error(team.message);
  }

  console.log(
    `[seed] ${team.teamName} 준비 (대표 ${team.ownerEmail}, 멤버 ${team.memberCount}명)`,
  );
  console.warn("[seed] 로그인 비밀번호는 로그에 출력하지 않습니다.");

  for (const row of team.seeded) {
    const label =
      row.teamRole === "OWNER"
        ? "팀 대표"
        : row.teamRole === "ADMIN"
          ? "팀장"
          : "팀원";
    console.log(`[seed] ${label}: ${row.email}`);
  }

  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: LOCAL_DEV_ADMIN_EMAIL },
    select: { id: true },
  });
  const leader = await prisma.user.findUniqueOrThrow({
    where: { email: "faith-team-leader@faith.local" },
    select: { id: true },
  });
  const members = await prisma.user.findMany({
    where: {
      email: {
        in: [
          "faith-team-member1@faith.local",
          "faith-team-member2@faith.local",
        ],
      },
    },
    select: { id: true },
  });

  await seedDemoContent({
    teamId: team.teamId,
    ownerId: owner.id,
    leaderId: leader.id,
    memberIds: members.map((row) => row.id),
  });

  console.log(`[seed] 어드민 로그인 계정: ${LOCAL_DEV_ADMIN_EMAIL}`);
  console.log("[seed] 비밀번호는 로그에 출력하지 않습니다.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
