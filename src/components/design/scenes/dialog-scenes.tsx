"use client";

import { useState } from "react";

import { FIXTURE_MEETING_DONE } from "@/components/design/fixtures";
import { PreviewStage } from "@/components/design/preview-stage";
import { NotificationPanel } from "@/components/layout/notification-panel";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import { DuplicateVaultNameDialog } from "@/components/vault/duplicate-name-dialog";
import { VaultPickerDialog } from "@/components/vault/vault-picker";
import { fixtureNotificationsExpand } from "@/lib/page-ux-fixtures";
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
      hint="업로드, 첨부에서 보관함 파일 고를 때."
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

/** 알림 센터, 클릭 펼침 확인용 */
export function SceneNotificationPanel() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="행 클릭으로 본문 확인. 확인, 수락, 바로가기."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <div className="relative h-full min-h-full">
        <NotificationPanel
          open={open}
          contained
          previewItems={fixtureNotificationsExpand()}
          onClose={() => setOpen(false)}
        />
      </div>
    </PreviewStage>
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
