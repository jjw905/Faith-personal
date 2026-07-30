"use client";

import { useMemo, useState } from "react";

import { MeetingMidPanel } from "@/components/dashboard/meeting-mid-panel";
import { UpcomingDetailPanel } from "@/components/dashboard/upcoming-detail-panel";
import { getUpcomingByWorkspace } from "@/lib/workspace-data";

/** 로컬 렌더 검수: 기본은 목록, ?sheet=1 이면 상세 시트 강제 오픈. */
export function UpcomingPreviewClient({
  forceSheet = false,
}: {
  forceSheet?: boolean;
}) {
  const item = useMemo(() => getUpcomingByWorkspace("personal")[0] ?? null, []);
  const [open, setOpen] = useState(forceSheet);

  if (forceSheet && item) {
    return (
      <UpcomingDetailPanel
        item={item}
        open={open}
        mode="view"
        onClose={() => setOpen(false)}
        onSave={() => setOpen(false)}
        onDelete={() => setOpen(false)}
      />
    );
  }

  return <MeetingMidPanel />;
}
