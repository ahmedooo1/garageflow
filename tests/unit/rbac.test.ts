import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS, type Permission } from "@/lib/rbac";

describe("RBAC", () => {
  it("le gérant a toutes les permissions", () => {
    for (const p of Object.keys(PERMISSIONS) as Permission[]) expect(hasPermission("OWNER", p)).toBe(true);
  });

  it("la réception gère clients, véhicules, dossiers et envois mais pas l'équipe", () => {
    expect(hasPermission("RECEPTION", "customers:write")).toBe(true);
    expect(hasPermission("RECEPTION", "workorders:create")).toBe(true);
    expect(hasPermission("RECEPTION", "estimate:send")).toBe(true);
    expect(hasPermission("RECEPTION", "workorders:deliver")).toBe(true);
    expect(hasPermission("RECEPTION", "users:manage")).toBe(false);
    expect(hasPermission("RECEPTION", "garage:settings")).toBe(false);
  });

  it("le technicien diagnostique et répare mais ne gère ni clients ni envois", () => {
    expect(hasPermission("TECHNICIAN", "diagnosis:write")).toBe(true);
    expect(hasPermission("TECHNICIAN", "repair:transition")).toBe(true);
    expect(hasPermission("TECHNICIAN", "estimate:write")).toBe(true);
    expect(hasPermission("TECHNICIAN", "estimate:send")).toBe(false);
    expect(hasPermission("TECHNICIAN", "customers:write")).toBe(false);
    expect(hasPermission("TECHNICIAN", "workorders:create")).toBe(false);
    expect(hasPermission("TECHNICIAN", "workorders:deliver")).toBe(false);
    expect(hasPermission("TECHNICIAN", "workorders:cancel")).toBe(false);
    expect(hasPermission("TECHNICIAN", "users:manage")).toBe(false);
  });
});
