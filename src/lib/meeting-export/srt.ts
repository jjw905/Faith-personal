import type { MeetingExportModel } from "./types";

/** SRT: HH:MM:SS,mmm (쉼표). */
export function formatSrtTimestamp(sec: number): string {
  const msTotal = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(msTotal / 3_600_000);
  const m = Math.floor((msTotal % 3_600_000) / 60_000);
  const s = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function serializeMeetingSrt(model: MeetingExportModel): string {
  if (model.cues.length === 0) return "";
  return (
    model.cues
      .map((c) => {
        return [
          String(c.index),
          `${formatSrtTimestamp(c.startSec)} --> ${formatSrtTimestamp(c.endSec)}`,
          c.text,
          "",
        ].join("\n");
      })
      .join("\n") + "\n"
  );
}
