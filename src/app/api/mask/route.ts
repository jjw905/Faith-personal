import { NextResponse } from "next/server";

import { mergeRuleAndNer } from "@/lib/masking/hybrid";
import { detectNerSpans, nerHealth } from "@/lib/masking/ner-client";
import type { MaskStyle } from "@/lib/masking/types";
import { requireUser } from "@/lib/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  const health = await nerHealth();
  return NextResponse.json({
    maskApi: true,
    ner: health,
  });
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      text?: string;
      useNer?: boolean;
      names?: string[];
      style?: MaskStyle;
    };
    const text = body.text ?? "";
    const useNer = body.useNer !== false;

    let nerSpans: Awaited<ReturnType<typeof detectNerSpans>>["spans"] = [];
    let nerOk = false;
    let nerError: string | undefined;

    if (useNer && text.trim()) {
      const ner = await detectNerSpans(text);
      nerSpans = ner.spans;
      nerOk = ner.ok;
      nerError = ner.error;
    }

    const result = mergeRuleAndNer(text, nerSpans, {
      names: body.names,
      style: body.style ?? "partial",
    });

    return NextResponse.json({
      ...result,
      nerOk,
      nerError: nerOk ? undefined : nerError,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "mask failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
