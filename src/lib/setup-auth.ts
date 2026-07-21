/** SETUP_SECRET Bearer 검증. 진단/복구 API 공통. */
export function assertSetupSecret(request: Request):
  | { ok: true }
  | { ok: false; status: 401 | 403; message: string } {
  const setupSecret = process.env.SETUP_SECRET?.trim();
  if (!setupSecret) {
    return {
      ok: false,
      status: 403,
      message: "SETUP_SECRET이 설정되지 않았습니다.",
    };
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== setupSecret) {
    return { ok: false, status: 401, message: "권한이 없습니다." };
  }
  return { ok: true };
}
