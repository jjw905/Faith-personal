"use client";

import { Mic, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRecording } from "@/hooks/use-recording";
import { cn } from "@/lib/utils";

export function RecordingButton() {
  const { status, isRecording, toggleRecording, resetRecording } =
    useRecording();

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={toggleRecording}
        className={cn(
          "h-12 w-full text-base font-semibold",
          isRecording &&
            "bg-primary-hover ring-4 ring-primary-soft hover:bg-primary",
        )}
      >
        {isRecording ? (
          <>
            <Square className="h-4 w-4 fill-current" />
            녹음 중지
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            새 회의 시작
          </>
        )}
      </Button>

      {status !== "idle" && (
        <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-2.5 text-sm">
          <span className="text-muted">
            상태:{" "}
            <span className="font-medium text-foreground">
              {status === "recording"
                ? "녹음 중"
                : status === "stopped"
                  ? "녹음 완료"
                  : "대기"}
            </span>
          </span>
          {status === "stopped" && (
            <button
              type="button"
              onClick={resetRecording}
              className="cursor-pointer text-xs font-medium text-primary hover:underline"
            >
              초기화
            </button>
          )}
          {isRecording && (
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              REC
            </span>
          )}
        </div>
      )}
    </div>
  );
}
