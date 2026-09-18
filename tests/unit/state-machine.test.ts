import type { WorkOrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { assertTransition, availableActions, canTransition, InvalidTransitionError, isTerminal, TRANSITIONS, WORK_ORDER_ACTIONS } from "@/lib/state-machine";

const ALL: WorkOrderStatus[] = Object.keys(TRANSITIONS) as WorkOrderStatus[];

describe("machine d'état des dossiers", () => {
  it("suit le parcours nominal complet", () => {
    const path: WorkOrderStatus[] = [
      "ARRIVED",
      "DIAGNOSIS_IN_PROGRESS",
      "WAITING_CUSTOMER_APPROVAL",
      "PARTIALLY_APPROVED",
      "REPAIR_IN_PROGRESS",
      "QUALITY_CONTROL",
      "READY_FOR_PICKUP",
      "DELIVERED",
      "CLOSED",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1]), `${path[i]} → ${path[i + 1]}`).toBe(true);
    }
  });

  it("refuse les sauts d'étapes", () => {
    expect(canTransition("ARRIVED", "READY_FOR_PICKUP")).toBe(false);
    expect(canTransition("ARRIVED", "DELIVERED")).toBe(false);
    expect(canTransition("WAITING_CUSTOMER_APPROVAL", "REPAIR_IN_PROGRESS")).toBe(false);
    expect(canTransition("REPAIR_IN_PROGRESS", "DELIVERED")).toBe(false);
    expect(canTransition("READY_FOR_PICKUP", "CLOSED")).toBe(false);
    expect(() => assertTransition("ARRIVED", "CLOSED")).toThrow(InvalidTransitionError);
  });

  it("les états terminaux n'ont aucune sortie", () => {
    for (const s of ["CLOSED", "CANCELLED"] as const) {
      expect(isTerminal(s)).toBe(true);
      expect(TRANSITIONS[s]).toHaveLength(0);
      for (const to of ALL) expect(canTransition(s, to)).toBe(false);
    }
  });

  it("un véhicule restitué ne peut plus être annulé", () => {
    expect(canTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransition("READY_FOR_PICKUP", "CANCELLED")).toBe(false);
  });

  it("la réparation ne peut pas repasser en attente client", () => {
    expect(canTransition("REPAIR_IN_PROGRESS", "WAITING_CUSTOMER_APPROVAL")).toBe(false);
  });

  it("toutes les actions déclarées correspondent à des transitions valides", () => {
    for (const a of WORK_ORDER_ACTIONS) {
      for (const from of a.from) expect(canTransition(from, a.to), `${a.key}: ${from} → ${a.to}`).toBe(true);
    }
  });

  it("availableActions ne propose que des actions applicables", () => {
    expect(availableActions("ARRIVED").map((a) => a.key)).toEqual(["QUEUE_DIAGNOSIS", "START_DIAGNOSIS", "CANCEL"]);
    expect(availableActions("CLOSED")).toHaveLength(0);
    expect(availableActions("QUALITY_CONTROL").map((a) => a.key)).toEqual(["BACK_TO_REPAIR", "MARK_READY"]);
    expect(availableActions("DELIVERED").map((a) => a.key)).toEqual(["CLOSE"]);
  });
});
