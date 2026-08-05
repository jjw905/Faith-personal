import type { AppNotification } from "@/types/notification";

/**
 * 알림 센터·UX 미리보기·디자인 랩 공통 예시.
 * 왼쪽 메뉴(개인·팀·보관함·도움말)로 이어지는 경로를 포함해
 * 미리보기와 실제 패널 내용이 갈라지지 않게 한다.
 */
export function defaultNotificationExamples(
  now = Date.now(),
): AppNotification[] {
  return [
    {
      id: "ux-n-urgent-help",
      type: "urgent",
      title: "서비스 점검 안내",
      body: "오늘 새벽 2시부터 30분간 점검이 있습니다. 점검 중에는 회의 업로드와 실시간 녹음이 잠시 중단될 수 있으며, 진행 중이던 분석은 점검 종료 후 이어서 처리됩니다. 도움말에서 일정을 확인할 수 있습니다.",
      time: "방금",
      unread: true,
      createdAt: new Date(now).toISOString(),
      data: { href: "/help" },
    },
    {
      id: "ux-n-invite-team",
      type: "invite",
      title: "제품기획팀 초대",
      body: "김기획님이 제품기획팀에 초대했습니다. 1시간 안에 수락하거나 거절해 주세요. 거절 시 사유를 남길 수 있습니다.",
      time: "3분 전",
      unread: true,
      createdAt: new Date(now - 3 * 60_000).toISOString(),
      data: { inviteId: "ux-invite-expand" },
    },
    {
      id: "ux-n-masking-personal",
      type: "masking",
      title: "마스킹 검증 필요",
      body: "미확정 개인정보 후보가 있습니다. 개인 회의 기록에서 가림을 확인하고 확정할 수 있습니다.",
      time: "8분 전",
      unread: true,
      createdAt: new Date(now - 8 * 60_000).toISOString(),
      data: { href: "/dashboard", meetingId: "mtg-002" },
    },
    {
      id: "ux-n-meeting-ack",
      type: "meeting",
      title: "회의 참석 확인",
      body: "내일 오전 10시 주간 싱크입니다. 참석을 확인하면 팀 예정에 반영됩니다. 확인은 참석 수락이 아닙니다.",
      time: "20분 전",
      unread: true,
      createdAt: new Date(now - 20 * 60_000).toISOString(),
      data: {
        kind: "meeting_ack",
        meetingId: "ux-mtg-ack-expand",
        href: "/team",
      },
    },
    {
      id: "ux-n-access-settings",
      type: "access",
      title: "로그인 보호 안내",
      body: "다른 기기에서 로그인 시도를 막아 두었습니다. 본인이 아니면 비밀번호를 바꿔 주세요.",
      time: "1시간 전",
      unread: true,
      createdAt: new Date(now - 60 * 60_000).toISOString(),
      data: { href: "/settings" },
    },
    {
      id: "ux-n-team-read",
      type: "team",
      title: "공지가 등록되었습니다",
      body: "제품기획팀에 새 공지가 올라왔습니다. 팀 화면에서 확인할 수 있습니다.",
      time: "어제",
      unread: false,
      createdAt: new Date(now - 26 * 60 * 60_000).toISOString(),
      readAt: new Date(now - 25 * 60 * 60_000).toISOString(),
      data: { href: "/team" },
    },
    {
      id: "ux-n-meeting-read",
      type: "meeting",
      title: "회의 일정이 변경되었습니다",
      body: "주간 싱크가 오전 11시로 미뤄졌습니다. 참석 여부를 다시 확인해 주세요.",
      time: "어제",
      unread: false,
      createdAt: new Date(now - 30 * 60 * 60_000).toISOString(),
      readAt: new Date(now - 28 * 60 * 60_000).toISOString(),
      data: {
        kind: "meeting_changed",
        meetingId: "ux-mtg-changed-expand",
        href: "/team",
      },
    },
    {
      id: "ux-n-storage-vault",
      type: "storage",
      title: "저장 공간 안내",
      body: "개인 보관함 사용량이 80%에 가까워졌습니다. 오래된 파일을 정리해 보세요.",
      time: "3일 전",
      unread: false,
      createdAt: new Date(now - 3 * 24 * 60 * 60_000).toISOString(),
      readAt: new Date(now - 3 * 24 * 60 * 60_000 + 3_600_000).toISOString(),
      data: { href: "/vault" },
    },
    {
      id: "ux-n-system-personal",
      type: "system",
      title: "분석이 완료되었습니다",
      body: "업로드한 회의 기록이 준비되었습니다. 개인 화면에서 요약과 대화기록을 확인할 수 있습니다.",
      time: "3일 전",
      unread: false,
      createdAt: new Date(now - 3 * 24 * 60 * 60_000 - 2 * 60 * 60_000).toISOString(),
      readAt: new Date(now - 3 * 24 * 60 * 60_000).toISOString(),
      data: { meetingId: "mtg-002", href: "/dashboard" },
    },
  ];
}

export function isExampleNotificationId(id: string) {
  return id.startsWith("ux-n-");
}
