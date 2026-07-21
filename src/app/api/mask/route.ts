import { NextResponse } from "next/server";

import { mergeRuleAndNer } from "@/lib/masking/hybrid";
import { detectNerSpans, nerHealth } from "@/lib/masking/ner-client";
import type { MaskStyle } from "@/lib/masking/types";
import { requireUser } from "@/lib/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 마스킹 요청 본문 상한 (DoS 완화). */
const MASK_TEXT_MAX_CHARS = 50_000;

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
    if (text.length > MASK_TEXT_MAX_CHARS) {
      return NextResponse.json(
        {
          ok: false,
          error: `텍스트는 ${MASK_TEXT_MAX_CHARS.toLocaleString("ko-KR")}자 이하만 처리할 수 있습니다.`,
        },
        { status: 413 },
      );
    }
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
