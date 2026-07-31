import type { MeetingExportModel } from "./types";

/** WebVTT: HH:MM:SS.mmm (점), ms 3자리. */
export function formatVttTimestamp(sec: number): string {
  const msTotal = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(msTotal / 3_600_000);
  const m = Math.floor((msTotal % 3_600_000) / 60_000);
  const s = Math.floor((msTotal % 60_000) / 1000);
  const ms = msTotal % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function serializeMeetingVtt(model: MeetingExportModel): string {
  const blocks = ["WEBVTT", ""];
  for (const c of model.cues) {
    blocks.push(
      `${formatVttTimestamp(c.startSec)} --> ${formatVttTimestamp(c.endSec)}`,
      c.text,
      "",
    );
  }
  return blocks.join("\n");
}
