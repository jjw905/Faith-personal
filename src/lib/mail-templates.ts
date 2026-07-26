function appUrl() {
  return (
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

const brand = {
  bg: "#f5f7fb",
  card: "#ffffff",
  text: "#1e293b",
  muted: "#64748b",
  primary: "#2563eb",
  border: "#e2e8f0",
};

function shell(title: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:0;background:${brand.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${brand.text}">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <p style="margin:0 0 16px;font-size:20px;font-weight:700;letter-spacing:-0.02em">Faith</p>
    <div style="background:${brand.card};border:1px solid ${brand.border};border-radius:16px;padding:28px 24px">
      <h1 style="margin:0 0 12px;font-size:18px;font-weight:700">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:${brand.muted};line-height:1.5">본 메일은 Faith 계정 관련 안내입니다. 요청하지 않았다면 무시해 주세요.</p>
  </div>
</body>
</html>`;
}

export function otpEmailHtml(params: {
  title: string;
  intro: string;
  code: string;
}) {
  return shell(
    params.title,
    `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${brand.muted}">${params.intro}</p>
    <p style="margin:0 0 8px;font-size:28px;font-weight:700;letter-spacing:0.2em;text-align:center">${params.code}</p>
    <p style="margin:16px 0 0;font-size:12px;color:${brand.muted}">인증번호는 10분 동안 유효합니다.</p>
  `,
  );
}

export function resetPasswordEmailHtml(params: { resetUrl: string }) {
  return shell(
    "비밀번호 재설정",
    `
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${brand.muted}">아래 버튼으로 새 비밀번호를 설정해 주세요. 링크는 1시간 동안 유효합니다.</p>
    <p style="margin:0 0 24px">
      <a href="${params.resetUrl}" style="display:inline-block;background:${brand.primary};color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600">비밀번호 재설정</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:${brand.muted};word-break:break-all">${params.resetUrl}</p>
  `,
  );
}

export { appUrl };
