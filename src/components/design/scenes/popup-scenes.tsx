"use client";

import { useState } from "react";

import { SortControl } from "@/components/dashboard/recent-meetings-table";
import { PreviewStage } from "@/components/design/preview-stage";
import { UserProfile } from "@/components/layout/user-profile";
import {
  AttachMenuPopup,
  ResetConfirmDialog,
} from "@/components/meetings/new-meeting-session";
import { Button } from "@/components/ui/button";

/** 실시간 기록: 첨부 메뉴 */
export function SceneAttachMenuPopup() {
  const [open, setOpen] = useState(true);
  const [play, setPlay] = useState(0);
  return (
    <div className="relative flex h-full min-h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted">첨부 버튼 메뉴.</p>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setOpen(true);
            setPlay((n) => n + 1);
          }}
        >
          {open ? "재생" : "다시 열기"}
        </Button>
      </div>
      <div className="flex flex-1 items-end justify-center pb-16 pt-24">
        <div className="relative">
          <AttachMenuPopup
            key={play}
            open={open}
            onAttach={() => setOpen(false)}
            onVaultAttach={() => setOpen(false)}
          />
          <div className="h-11 w-11 rounded-full bg-primary shadow-soft" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/** 실시간 기록: 초기화 확인 */
export function SceneResetConfirmDialog() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="세션 초기화할 때."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <ResetConfirmDialog
        open={open}
        contained
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

/** 사이드바: 계정 메뉴 */
export function SceneUserProfileMenu() {
  return (
    <div className="h-full min-h-full overflow-hidden p-6 pr-60">
      <p className="mb-4 text-sm text-muted">사이드바 프로필을 눌렀을 때.</p>
      <div className="max-w-[14rem]">
        <UserProfile forceOpen />
      </div>
    </div>
  );
}

/** 최근 기록: 정렬 목록 */
export function SceneSortControl() {
  const [value, setValue] = useState<"date_desc" | "date_asc" | "title" | "duration">(
    "date_desc",
  );
  return (
    <div className="h-full min-h-full p-6">
      <p className="mb-4 text-sm text-muted">목록 정렬 메뉴.</p>
      <div className="flex justify-end">
        <SortControl value={value} onChange={setValue} forceOpen />
      </div>
    </div>
  );
}
