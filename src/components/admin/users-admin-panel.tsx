"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: "USER" | "ADMIN";
  disabled: boolean;
  emailVerified: string | Date | null;
  image: string | null;
  createdAt: string | Date;
  accounts: { provider: string }[];
};

export function UsersAdminPanel({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function patchUser(
    userId: string,
    body: { role?: "USER" | "ADMIN"; disabled?: boolean },
  ) {
    setError("");
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...body }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      message?: string;
      user?: UserRow;
    };
    if (!data.ok || !data.user) {
      setError(data.message ?? "변경에 실패했습니다.");
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u)),
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl ring-1 ring-border-strong">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-primary-soft/60 text-[12px] font-semibold text-muted">
            <tr>
              <th className="px-4 py-3">사용자</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">인증</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">가입</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              const providers = u.accounts.map((a) => a.provider).join(", ");
              return (
                <tr
                  key={u.id}
                  className="border-t border-border-strong/70 align-middle"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      {u.name || "(이름 없음)"}
                      {isSelf && (
                        <span className="ml-2 text-[11px] text-muted">나</span>
                      )}
                    </div>
                    <div className="text-[12px] text-muted">{u.email || "—"}</div>
                    {providers && (
                      <div className="mt-0.5 text-[11px] text-muted-2">
                        {providers}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="h-9 rounded-lg border border-border-strong bg-white px-2 text-[13px] disabled:opacity-50"
                      disabled={pending || isSelf}
                      value={u.role}
                      onChange={(e) =>
                        void patchUser(u.id, {
                          role: e.target.value as "USER" | "ADMIN",
                        })
                      }
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-[13px]">
                    {u.emailVerified ? (
                      <span className="text-emerald-700">완료</span>
                    ) : (
                      <span className="text-amber-700">미인증</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={pending || isSelf}
                      onClick={() =>
                        void patchUser(u.id, { disabled: !u.disabled })
                      }
                      className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium disabled:opacity-50 ${
                        u.disabled
                          ? "bg-primary-soft text-foreground"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {u.disabled ? "활성화" : "비활성"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-muted">
                    {new Date(u.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-muted"
                >
                  등록된 사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
