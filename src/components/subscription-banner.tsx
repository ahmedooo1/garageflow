import { AlertTriangle, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Role } from "@prisma/client";
import type { AccessState } from "@/lib/plans";
import { hasPermission } from "@/lib/rbac";

/**
 * Bandeau d'abonnement : rappel discret pendant l'essai, blocage explicite
 * quand l'écriture n'est plus possible.
 */
export function SubscriptionBanner({ access, role }: { access: AccessState; role: Role }) {
  const canManage = hasPermission(role, "garage:settings");

  if (!access.canWrite) {
    return (
      <div className="border-b-2 border-danger bg-danger-soft px-4 py-3 sm:px-6 lg:px-8" role="alert">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-semibold text-danger">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              {access.reason}
              <span className="block font-normal">Vos dossiers restent consultables et exportables.</span>
            </span>
          </p>
          {canManage && (
            <Link href="/app/abonnement" className="btn btn-primary btn-sm shrink-0">
              Choisir un abonnement
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (access.trialing && access.trialDaysLeft <= 7) {
    return (
      <div className="border-b border-warn/40 bg-warn-soft px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-warn">
            <Sparkles className="h-4 w-4 shrink-0" />
            Essai gratuit : {access.trialDaysLeft} jour{access.trialDaysLeft > 1 ? "s" : ""} restant{access.trialDaysLeft > 1 ? "s" : ""}.
          </p>
          {canManage && (
            <Link href="/app/abonnement" className="btn btn-secondary btn-sm shrink-0">
              Voir les abonnements
            </Link>
          )}
        </div>
      </div>
    );
  }

  return null;
}
