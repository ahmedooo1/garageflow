"use client";

import type { Role } from "@prisma/client";
import { Car, ClipboardList, CreditCard, LayoutGrid, Plus, Settings, Shield, Users, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasPermission } from "@/lib/rbac";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

function items(role: Role, platformAdmin: boolean): Item[] {
  const list: Item[] = [
    { href: "/app/atelier", label: "Atelier", icon: LayoutGrid },
    { href: "/app/dossiers", label: "Dossiers", icon: ClipboardList },
    { href: "/app/clients", label: "Clients", icon: Users },
    { href: "/app/vehicules", label: "Véhicules", icon: Car },
  ];
  if (hasPermission(role, "users:manage")) list.push({ href: "/app/equipe", label: "Équipe", icon: UsersRound });
  if (hasPermission(role, "garage:settings")) {
    list.push({ href: "/app/abonnement", label: "Abonnement", icon: CreditCard });
    list.push({ href: "/app/parametres", label: "Paramètres", icon: Settings });
  }
  if (platformAdmin) list.push({ href: "/admin", label: "Console GarageFlow", icon: Shield });
  return list;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNav({ role, platformAdmin, canWrite }: { role: Role; platformAdmin: boolean; canWrite: boolean }) {
  const pathname = usePathname();
  const canCreate = hasPermission(role, "workorders:create") && canWrite;
  return (
    <nav className="flex flex-col gap-1">
      {canCreate && (
        <Link href="/app/dossiers/new" className="btn btn-primary btn-lg mb-3">
          <Plus className="h-5 w-5" /> Nouvelle réception
        </Link>
      )}
      {items(role, platformAdmin).map((it) => (
        <Link key={it.href} href={it.href} className="nav-link" aria-current={isActive(pathname, it.href) ? "page" : undefined}>
          <it.icon className="h-5 w-5" />
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ role, canWrite }: { role: Role; canWrite: boolean }) {
  const pathname = usePathname();
  const canCreate = hasPermission(role, "workorders:create") && canWrite;
  const list = items(role, false).slice(0, 4);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-steel-700 bg-steel-900 pb-[env(safe-area-inset-bottom)] text-white lg:hidden">
      {list.slice(0, 2).map((it) => (
        <MobileLink key={it.href} item={it} active={isActive(pathname, it.href)} />
      ))}
      {canCreate ? (
        <Link href="/app/dossiers/new" className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold text-accent">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white">
            <Plus className="h-6 w-6" />
          </span>
          Réception
        </Link>
      ) : (
        <span />
      )}
      {list.slice(2, 4).map((it) => (
        <MobileLink key={it.href} item={it} active={isActive(pathname, it.href)} />
      ))}
    </nav>
  );
}

function MobileLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-accent" : "text-steel-300"}`}
    >
      <item.icon className="h-6 w-6" />
      {item.label}
    </Link>
  );
}
