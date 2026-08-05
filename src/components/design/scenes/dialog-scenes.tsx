"use client";

import { useEffect, useState } from "react";

import { FIXTURE_MEETING_DONE } from "@/components/design/fixtures";
import { PreviewStage } from "@/components/design/preview-stage";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import { CreateTeamFirstDialog } from "@/components/team/create-team-first-dialog";
import { DuplicateVaultNameDialog } from "@/components/vault/duplicate-name-dialog";
import { VaultPickerDialog } from "@/components/vault/vault-picker";
import { useNotificationsUi } from "@/context/notifications-ui-context";
import { Button } from "@/components/ui/button";
import type { MaskStyle } from "@/lib/masking/types";

/** 업로드: 중복 파일명 */
export function SceneDuplicateVaultName() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="보관함에 같은 이름이 있을 때 업로드 확인."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <DuplicateVaultNameDialog
        open={open}
        contained
        originalName="kickoff-recording.m4a"
        nextName="kickoff-recording (1).m4a"
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 기록: 삭제 확인 */
export function SceneRecordsDeleteConfirm() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="목록, 상세에서 삭제할 때."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <MeetingRecordsActionDialog
        open={open}
        contained
        mode="delete"
        meetings={[FIXTURE_MEETING_DONE]}
        busy={false}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 기록: 다운로드 확인 */
export function SceneRecordsDownloadConfirm() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="목록, 상세에서 받을 때."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <MeetingRecordsActionDialog
        open={open}
        contained
        mode="download"
        meetings={[FIXTURE_MEETING_DONE]}
        busy={false}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 기록: 여러 건 내보내기 */
export function SceneRecordsDownloadMany() {
  const [open, setOpen] = useState(true);
  const meetings = [
    {
      ...FIXTURE_MEETING_DONE,
      id: "design-mtg-export-1",
      title: "주간 보안 싱크",
      duration: "20분",
      capture: "live" as const,
      date: "2026-08-03T12:40:00+09:00",
    },
    {
      ...FIXTURE_MEETING_DONE,
      id: "design-mtg-export-2",
      title: "제품 로드맵 리뷰",
      duration: "28분",
      capture: "upload" as const,
      date: "2026-08-02T16:10:00+09:00",
    },
  ];
  return (
    <PreviewStage
      hint="목록에서 여러 기록 선택 후 내보내기."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <MeetingRecordsActionDialog
        open={open}
        contained
        mode="download"
        meetings={meetings}
        busy={false}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 기록: 공유 확인 */
export function SceneRecordsShareConfirm() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="상세·대화기록에서 공유할 때."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <MeetingRecordsActionDialog
        open={open}
        contained
        mode="share"
        meetings={[FIXTURE_MEETING_DONE]}
        busy={false}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 기록: 여러 건 삭제 */
export function SceneRecordsDeleteMany() {
  const [open, setOpen] = useState(true);
  const meetings = [
    FIXTURE_MEETING_DONE,
    { ...FIXTURE_MEETING_DONE, id: "design-mtg-2", title: "주간 보안 싱크" },
    { ...FIXTURE_MEETING_DONE, id: "design-mtg-3", title: "RBAC 개편 회의" },
  ];
  return (
    <PreviewStage
      hint="목록에서 여러 기록 선택 후 삭제."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <MeetingRecordsActionDialog
        open={open}
        contained
        mode="delete"
        meetings={meetings}
        busy={false}
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 보관함에서 선택 */
export function SceneVaultPicker() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="회의록 생성에서 보관함 파일 고를 때."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <VaultPickerDialog
        open={open}
        contained
        audioOnly
        onClose={() => setOpen(false)}
        onPick={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/**
 * 알림 센터 예시 — contained 패널이 아니라 왼쪽 메뉴 「알림」과 같은
 * 사이드바 알림 센터에 예시 데이터를 연다 (회의 UX 미리보기와 통합).
 */
export function SceneNotificationPanel() {
  const { open, openNotifications } = useNotificationsUi();

  useEffect(() => {
    openNotifications();
  }, [openNotifications]);

  return (
    <div className="flex h-full min-h-full flex-col items-start justify-center gap-4 px-6 py-12 sm:px-10">
      <p className="max-w-md text-base leading-relaxed text-muted">
        예시 알림은 왼쪽 메뉴{" "}
        <span className="font-semibold text-foreground">알림</span>에
        열립니다. 안 읽음·기록·유형 라벨·수락/확인은 그 패널에서 확인하세요.
      </p>
      <Button
        type="button"
        className="min-h-12 px-5 text-base font-semibold"
        onClick={openNotifications}
        disabled={open}
      >
        {open ? "알림 센터 열림" : "알림 센터 열기"}
      </Button>
    </div>
  );
}

/** 개인정보 가림 방식 팝업 */
export function SceneMaskStylePopup() {
  const [style, setStyle] = useState<MaskStyle>("partial");
  return (
    <div className="flex h-full min-h-full items-start justify-end pb-40 pr-4 pt-4">
      <MaskStylePopup value={style} onChange={setStyle} forceOpen />
    </div>
  );
}

/** 설정: 팀 없음 → 먼저 만들기 */
export function SceneCreateTeamFirst() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="시스템 설정에서 팀 관리로 갈 때 팀이 없을 때."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <CreateTeamFirstDialog
        open={open}
        contained
        variant="no-team"
        onClose={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 설정: 팀 기능 준비중 */
export function SceneTeamSettingsOff() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="팀 설정은 오픈 준비중이에요"
      open={open}
      onReopen={() => setOpen(true)}
    >
      <CreateTeamFirstDialog
        open={open}
        contained
        variant="feature-off"
        onClose={() => setOpen(false)}
      />
    </PreviewStage>
  );
}
