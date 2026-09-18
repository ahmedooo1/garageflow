import type { CheckStatus, LineDecision, Urgency, WorkOrderStatus } from "@prisma/client";
import { CHECK_STATUS_LABELS, DECISION_LABELS, STATUS_LABELS, STATUS_TONES, URGENCY_LABELS } from "@/lib/labels";
import { Pill } from "./ui";

export function StatusBadge({ status, size }: { status: WorkOrderStatus; size?: "lg" }) {
  return (
    <Pill tone={STATUS_TONES[status]} size={size}>
      {STATUS_LABELS[status]}
    </Pill>
  );
}

const URGENCY_TONES: Record<Urgency, "slate" | "amber" | "orange" | "red" | "purple"> = {
  INFO: "slate",
  WATCH: "amber",
  RECOMMENDED: "orange",
  URGENT: "red",
  CRITICAL: "purple",
};

export function UrgencyBadge({ urgency, size }: { urgency: Urgency; size?: "lg" }) {
  return (
    <Pill tone={URGENCY_TONES[urgency]} size={size}>
      {URGENCY_LABELS[urgency]}
    </Pill>
  );
}

const CHECK_TONES: Record<CheckStatus, "slate" | "green" | "amber" | "orange" | "red"> = {
  NOT_CHECKED: "slate",
  OK: "green",
  WATCH: "amber",
  RECOMMENDED: "orange",
  URGENT: "red",
};

export function CheckBadge({ status }: { status: CheckStatus }) {
  return <Pill tone={CHECK_TONES[status]}>{CHECK_STATUS_LABELS[status]}</Pill>;
}

const DECISION_TONES: Record<LineDecision, "slate" | "green" | "red"> = { PENDING: "slate", ACCEPTED: "green", REFUSED: "red" };

export function DecisionBadge({ decision, size }: { decision: LineDecision; size?: "lg" }) {
  return (
    <Pill tone={DECISION_TONES[decision]} size={size}>
      {DECISION_LABELS[decision]}
    </Pill>
  );
}
