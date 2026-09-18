"use client";

import type { Role, WorkOrderStatus } from "@prisma/client";
import { useActionState } from "react";
import { InlineAction } from "@/components/forms";
import { hasPermission } from "@/lib/rbac";
import { availableActions } from "@/lib/state-machine";
import type { ActionState } from "@/server/actions/helpers";
import { assignTechnicianAction, workOrderActionAction } from "@/server/actions/workorders";

type Technician = { id: string; firstName: string; lastName: string };

export function HeaderActions({
  workOrderId,
  status,
  role,
  technicianId,
  technicians,
  hasFinalCheck,
}: {
  workOrderId: string;
  status: WorkOrderStatus;
  role: Role;
  technicianId: string | null;
  technicians: Technician[];
  hasFinalCheck: boolean;
}) {
  const [assignState, assignAction] = useActionState<ActionState, FormData>(assignTechnicianAction, { ok: false });
  const actions = availableActions(status).filter((a) => hasPermission(role, a.permission));
  // Les actions guidées (envoi estimation, contrôle final, restitution) vivent dans leurs onglets.
  const headerActions = actions.filter((a) => !["CLOSE", "MARK_READY"].includes(a.key) || (a.key === "MARK_READY" && hasFinalCheck));
  const canAssign = hasPermission(role, "workorders:assign") && !["CLOSED", "CANCELLED"].includes(status);

  return (
    <div className="flex w-full flex-col gap-2 lg:w-72">
      {canAssign && (
        <form action={assignAction} className="flex flex-col gap-1">
          <input type="hidden" name="workOrderId" value={workOrderId} />
          <label className="field-label" htmlFor="technicianId">
            Technicien
          </label>
          <select id="technicianId" name="technicianId" className="input" defaultValue={technicianId ?? ""} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            <option value="">Non assigné</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
          {!assignState.ok && assignState.error && <span className="text-xs text-danger">{assignState.error}</span>}
        </form>
      )}
      {headerActions.map((a) => (
        <InlineAction
          key={a.key}
          action={workOrderActionAction}
          hidden={{ workOrderId, action: a.key }}
          variant={a.tone === "primary" ? "primary" : a.tone === "danger" ? "danger" : a.tone === "success" ? "success" : "secondary"}
          size="lg"
          className="w-full [&>button]:w-full"
          confirm={a.tone === "danger" ? "Annuler ce dossier ? Cette action est définitive." : undefined}
          pendingText="…"
        >
          {a.label}
        </InlineAction>
      ))}
    </div>
  );
}
