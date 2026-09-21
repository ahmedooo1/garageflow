import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { requirePlatformAdmin } from "@/server/context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="bg-steel-900 text-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2.5 font-extrabold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent text-white">
              <Shield className="h-5 w-5" />
            </span>
            Console GarageFlow
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-steel-300 sm:inline">
              {user.firstName} {user.lastName}
            </span>
            <Link href="/app/atelier" className="btn btn-ghost btn-sm text-steel-300 hover:bg-steel-800 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Mon garage
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
