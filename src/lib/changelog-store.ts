import { prisma } from "@/lib/prisma";
import {
  DEV_AGENDA,
  DEV_CHANGELOG,
  type ChangelogEntry,
  type ChangelogSection,
  type DevAgendaItem,
} from "@/lib/changelog";

export type DevChangelogState = {
  agenda: { date: string; items: DevAgendaItem[] };
  entries: ChangelogEntry[];
};

const KEY = "dev";

function defaults(): DevChangelogState {
  return {
    agenda: { date: DEV_AGENDA.date, items: DEV_AGENDA.items.map((i) => ({ ...i })) },
    entries: DEV_CHANGELOG.map((e) => ({
      ...e,
      sections: e.sections.map((s) => ({ ...s, items: s.items ? [...s.items] : undefined })),
    })),
  };
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** 들어온 JSON을 안전한 형태로 정규화(어드민 입력 신뢰하지 않음). */
export function normalizeDevState(raw: unknown): DevChangelogState {
  const base = defaults();
  if (typeof raw !== "object" || raw === null) return base;
  const obj = raw as Record<string, unknown>;

  const agendaRaw = obj.agenda as Record<string, unknown> | undefined;
  const agendaItems = Array.isArray(agendaRaw?.items) ? agendaRaw!.items : [];
  const agenda = {
    date: str(agendaRaw?.date, base.agenda.date),
    items: agendaItems
      .map((it) => {
        const i = it as Record<string, unknown>;
        return { label: str(i.label), done: Boolean(i.done) };
      })
      .filter((i) => i.label.trim().length > 0),
  };

  const entriesRaw = Array.isArray(obj.entries) ? obj.entries : [];
  const entries: ChangelogEntry[] = entriesRaw.map((e) => {
    const en = e as Record<string, unknown>;
    const sectionsRaw = Array.isArray(en.sections) ? en.sections : [];
    const sections: ChangelogSection[] = sectionsRaw.map((s) => {
      const sc = s as Record<string, unknown>;
      const itemsRaw = Array.isArray(sc.items) ? sc.items : [];
      const items = itemsRaw
        .map((x) => str(x))
        .filter((x) => x.trim().length > 0);
      const body = str(sc.body).trim();
      return {
        title: str(sc.title),
        ...(body ? { body } : {}),
        ...(items.length ? { items } : {}),
      };
    });
    return {
      version: str(en.version),
      date: str(en.date),
      title: str(en.title),
      summary: str(en.summary),
      sections,
    };
  });

  return { agenda, entries };
}

/** DB에서 dev changelog 상태 조회. 없거나 오류면 정적 기본값. */
export async function getDevChangelogState(): Promise<DevChangelogState> {
  try {
    const row = await prisma.changelogState.findUnique({ where: { key: KEY } });
    if (!row) return defaults();
    return normalizeDevState(row.data);
  } catch {
    return defaults();
  }
}

export async function saveDevChangelogState(
  state: DevChangelogState,
): Promise<DevChangelogState> {
  const normalized = normalizeDevState(state);
  await prisma.changelogState.upsert({
    where: { key: KEY },
    create: { key: KEY, data: normalized },
    update: { data: normalized },
  });
  return normalized;
}
