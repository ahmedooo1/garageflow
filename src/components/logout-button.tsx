"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/server/actions/auth";

export function LogoutButton({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <form action={logoutAction} className={className}>
      <button type="submit" className={compact ? "btn btn-ghost btn-sm text-steel-300" : "btn btn-ghost btn-sm w-full text-steel-300"} aria-label="Se déconnecter">
        <LogOut className="h-4 w-4" />
        {!compact && "Déconnexion"}
      </button>
    </form>
  );
}
