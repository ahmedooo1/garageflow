"use server";

import { getClientIp, getUserAgent } from "@/server/lib/request";
import { submitDecision } from "@/server/services/approvals";
import { runAction, str, type ActionState } from "./helpers";

export type DecisionResult = { acceptedCount: number; refusedCount: number; acceptedTotal: string };

export async function submitDecisionAction(_prev: ActionState<DecisionResult>, form: FormData): Promise<ActionState<DecisionResult>> {
  const token = str(form, "token");
  const decisions: Record<string, "ACCEPTED" | "REFUSED"> = {};
  for (const [key, value] of form.entries()) {
    if (key.startsWith("line:") && (value === "ACCEPTED" || value === "REFUSED")) {
      decisions[key.slice(5)] = value;
    }
  }
  return runAction(async () => {
    const res = await submitDecision(
      token,
      { decisions, customerName: str(form, "customerName"), comment: str(form, "comment") },
      { ip: await getClientIp(), userAgent: await getUserAgent() },
    );
    return { acceptedCount: res.acceptedCount, refusedCount: res.refusedCount, acceptedTotal: res.acceptedTotal.toString() };
  });
}
