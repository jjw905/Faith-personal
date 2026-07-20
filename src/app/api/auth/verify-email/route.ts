import { NextResponse } from "next/server";

import { confirmEmailVerification } from "@/lib/email-verification";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const base =
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    url.origin;

  if (!token) {
    return NextResponse.redirect(`${base}/signup/verify?error=missing`);
  }

  const result = await confirmEmailVerification(token);
  if (!result.ok) {
    return NextResponse.redirect(`${base}/signup/verify?error=invalid`);
  }

  const res = NextResponse.redirect(`${base}/signup/verify?ok=1`);
  res.cookies.set("faith.pending-email", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
