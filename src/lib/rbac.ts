import type { Role } from "@prisma/client";

export const PERMISSIONS = {
  "customers:write": ["OWNER", "RECEPTION"],
  "vehicles:write": ["OWNER", "RECEPTION"],
  "workorders:create": ["OWNER", "RECEPTION"],
  "workorders:assign": ["OWNER", "RECEPTION"],
  "workorders:cancel": ["OWNER", "RECEPTION"],
  "workorders:deliver": ["OWNER", "RECEPTION"],
  "workorders:close": ["OWNER", "RECEPTION"],
  "diagnosis:write": ["OWNER", "RECEPTION", "TECHNICIAN"],
  "repair:transition": ["OWNER", "RECEPTION", "TECHNICIAN"],
  "estimate:write": ["OWNER", "RECEPTION", "TECHNICIAN"],
  "estimate:send": ["OWNER", "RECEPTION"],
  "users:manage": ["OWNER"],
  "garage:settings": ["OWNER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Gérant",
  RECEPTION: "Réception",
  TECHNICIAN: "Technicien",
};
