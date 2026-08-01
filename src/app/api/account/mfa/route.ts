import QRCode from "qrcode";
import { NextResponse } from "next/server";

import {
  confirmMfaSetup,
  disableMfa,
  getMfaStatus,
  startMfaSetup,
} from "@/lib/mfa";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const status = await getMfaStatus(session.user.id);
  return NextResponse.json({ ok: true, status });
}

export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "mfa-settings", 12, 60_000);
  if (limited) return limited;

  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const data =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const action = typeof data.action === "string" ? data.action : "";

  try {
    if (action === "setup") {
      const label = session.user.email?.trim() || session.user.id;
      const setup = await startMfaSetup(session.user.id, label);
      const qrCodeDataUrl = await QRCode.toDataURL(setup.otpauthUri, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      });
      return NextResponse.json({
        ok: true,
        setup: { ...setup, qrCodeDataUrl },
      });
    }

    const code = typeof data.code === "string" ? data.code : "";
    if (!code.trim()) {
      return NextResponse.json(
        { ok: false, message: "인증 코드를 입력해 주세요." },
        { status: 400 },
      );
    }

    if (action === "confirm") {
      const recoveryCodes = await confirmMfaSetup(session.user.id, code);
      return NextResponse.json({ ok: true, recoveryCodes });
    }

    if (action === "disable") {
      await disableMfa(session.user.id, code);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, message: "지원하지 않는 MFA 요청입니다." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MFA 설정을 처리하지 못했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
