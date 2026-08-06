import { UsersAdminPanel } from "@/components/admin/users-admin-panel";
import { AdminPageChrome } from "@/components/admin/admin-page-chrome";
import { countUserStats, listUsersPage, requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireAdmin();
  const [pageResult, stats] = await Promise.all([
    listUsersPage({ page: 1, pageSize: 9 }),
    countUserStats(),
  ]);

  return (
    <AdminPageChrome
      title={
        <div className="min-w-0 text-center">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
            사용자 관리
          </h1>
          <p className="mt-0.5 text-base text-muted">{stats.total}명 등록</p>
        </div>
      }
    >
      <UsersAdminPanel
        currentUserId={session.user.id}
        initialUsers={pageResult.users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          planUntil: u.planUntil ? u.planUntil.toISOString() : null,
          disabledUntil: u.disabledUntil
            ? u.disabledUntil.toISOString()
            : null,
        }))}
        initialTotal={pageResult.total}
        initialStats={stats}
        initialPage={pageResult.page}
        initialPageSize={pageResult.pageSize}
      />
    </AdminPageChrome>
  );
}
