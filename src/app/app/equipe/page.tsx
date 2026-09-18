import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/rbac";
import { formatDate } from "@/lib/format";
import { assertPermission, requireUser } from "@/server/context";
import { listUsers } from "@/server/services/users";
import { CreateUserForm, UserRowActions } from "./team-forms";

export const metadata: Metadata = { title: "Équipe" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { ctx, user } = await requireUser();
  assertPermission(ctx, "users:manage");
  const users = await listUsers(ctx);
  return (
    <>
      <PageHeader title="Équipe" subtitle="Gérez les accès de votre garage : gérants, réception et techniciens." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Ajouter un membre" className="lg:col-span-1">
          <CreateUserForm />
        </Card>
        <Card title={`Membres (${users.length})`} className="lg:col-span-2">
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-bold">
                    {u.firstName} {u.lastName}
                    {u.id === user.id && <span className="ml-2 text-xs font-semibold text-muted">(vous)</span>}
                    {!u.active && <span className="ml-2 badge bg-danger-soft text-danger">Désactivé</span>}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {u.email} · {ROLE_LABELS[u.role]} · depuis le {formatDate(u.createdAt)}
                  </p>
                </div>
                {u.id !== user.id && <UserRowActions userId={u.id} role={u.role} active={u.active} />}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
