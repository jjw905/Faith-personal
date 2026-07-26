import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  const settings = await prisma.userPersonalSettings.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id },
    update: {},
  });
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: {
    defaultMicrophoneOn?: boolean;
    preferredInputDeviceId?: string | null;
    notificationSoundEnabled?: boolean;
    displayPrefs?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  const settings = await prisma.userPersonalSettings.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      defaultMicrophoneOn: Boolean(body.defaultMicrophoneOn),
      preferredInputDeviceId: body.preferredInputDeviceId ?? null,
      notificationSoundEnabled:
        body.notificationSoundEnabled === undefined
          ? true
          : Boolean(body.notificationSoundEnabled),
      ...(body.displayPrefs
        ? { displayPrefs: body.displayPrefs as Prisma.InputJsonValue }
        : {}),
    },
    update: {
      ...(typeof body.defaultMicrophoneOn === "boolean"
        ? { defaultMicrophoneOn: body.defaultMicrophoneOn }
        : {}),
      ...(body.preferredInputDeviceId !== undefined
        ? { preferredInputDeviceId: body.preferredInputDeviceId }
        : {}),
      ...(typeof body.notificationSoundEnabled === "boolean"
        ? { notificationSoundEnabled: body.notificationSoundEnabled }
        : {}),
      ...(body.displayPrefs
        ? { displayPrefs: body.displayPrefs as Prisma.InputJsonValue }
        : {}),
    },
  });
  return NextResponse.json({ ok: true, settings });
}
