import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/marketing/container";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "회원가입 · Faith",
  description: "Faith 계정을 만들어 안전한 회의록 관리를 시작하세요.",
};

const FIELDS = [
  { id: "name", label: "이름", type: "text", placeholder: "홍길동" },
  { id: "email", label: "이메일", type: "email", placeholder: "you@company.com" },
  { id: "password", label: "비밀번호", type: "password", placeholder: "8자 이상" },
];

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/40">
        <Container className="flex h-16 items-center sm:h-[4.5rem]">
          <Link
            href="/welcome"
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
              회원가입
            </h1>
            <p className="mt-2 text-sm text-muted">
              몇 초면 계정을 만들 수 있어요.
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
                  autoComplete="off"
                />
              </div>
            ))}

            <button
              type="submit"
              className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              가입하기
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            이미 계정이 있으신가요?{" "}
            <Link
              href="/"
              className="font-semibold text-foreground hover:underline"
            >
              로그인
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
