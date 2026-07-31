import type { MeetingExportModel } from "./types";

export type MeetingExportJson = {
  title: string;
  date: string;
  duration: string;
  summary: string;
  decisions: string[];
  actions: Array<{ owner: string; task: string; due?: string }>;
  segments: Array<{
    start: string;
    end: string;
    title: string;
    summary: string;
  }>;
  lines: Array<{
    time: string;
    speaker: string;
    text: string;
    startSec?: number;
  }>;
};

export function toMeetingExportJson(model: MeetingExportModel): MeetingExportJson {
  return {
    title: model.title,
    date: model.date,
    duration: model.duration,
    summary: model.summary,
    decisions: model.decisions,
    actions: model.actions,
    segments: model.segments,
    lines: model.lines.map((l) => ({
      time: l.time,
      speaker: l.speaker,
      text: l.text,
      startSec: l.startSec,
    })),
  };
}

export function serializeMeetingJson(model: MeetingExportModel): string {
  return `${JSON.stringify(toMeetingExportJson(model), null, 2)}\n`;
}

export function serializeMeetingsListJson(
  models: MeetingExportModel[],
): string {
  return `${JSON.stringify(models.map(toMeetingExportJson), null, 2)}\n`;
}
