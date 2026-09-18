import { AppNav, MobileNav } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { ROLE_LABELS } from "@/lib/rbac";
import { requireUser } from "@/server/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col bg-steel-900 px-4 py-5 text-white lg:flex">
        <div className="px-2">
          <Logo light />
        </div>
        <p className="mt-6 mb-2 truncate px-3 text-xs font-bold uppercase tracking-wider text-steel-300">{user.garageName}</p>
        <AppNav role={user.role} />
        <div className="mt-auto rounded-[10px] bg-steel-800 p-3">
          <p className="truncate text-sm font-bold">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-steel-300">{ROLE_LABELS[user.role]}</p>
          <LogoutButton className="mt-2 w-full" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-steel-700 bg-steel-900 px-4 text-white lg:hidden">
          <Logo light />
          <div className="flex items-center gap-2">
            <span className="hidden truncate text-sm text-steel-300 sm:inline">{user.garageName}</span>
            <LogoutButton compact />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
        <MobileNav role={user.role} />
      </div>
    </div>
  );
}
