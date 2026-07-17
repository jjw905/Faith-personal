import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/marketing/container";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "로그인 · Faith",
  description: "Faith 계정으로 로그인하고 안전한 회의록 관리를 이어가세요.",
};

const FIELDS = [
  {
    id: "email",
    label: "이메일",
    type: "email",
    placeholder: "you@company.com",
    autoComplete: "email",
  },
  {
    id: "password",
    label: "비밀번호",
    type: "password",
    placeholder: "비밀번호를 입력하세요",
    autoComplete: "current-password",
  },
];

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/40">
        <Container className="flex h-16 items-center sm:h-[4.5rem]">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
        </Container>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              로그인
            </h1>
            <p className="mt-2 text-sm text-muted">
              계정에 로그인하고 회의록을 이어서 관리하세요.
            </p>
          </div>

          <form className="mt-8 space-y-5 rounded-3xl bg-card p-7 shadow-soft ring-1 ring-border">
            {FIELDS.map((f) => (
              <div key={f.id}>
                <label
                  htmlFor={f.id}
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  {f.label}
                </label>
                <Input
                  id={f.id}
                  name={f.id}
                  type={f.type}
                  placeholder={f.placeholder}
                  autoComplete={f.autoComplete}
                />
              </div>
            ))}

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-muted">
                <input
                  type="checkbox"
                  name="remember"
                  className="h-4 w-4 rounded border-border text-primary"
                />
                로그인 상태 유지
              </label>
              <span className="font-medium text-muted">
                비밀번호를 잊으셨나요?
              </span>
            </div>

            <button
              type="submit"
              className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              로그인
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            아직 계정이 없으신가요?{" "}
            <Link
              href="/signup"
              className="font-semibold text-foreground hover:underline"
            >
              회원가입
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
