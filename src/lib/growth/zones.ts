/**
 * Zones de prospection. Les codes postaux servent de filtre exact sur la base
 * SIRENE : un établissement n'est retenu que s'il est situé dans l'un d'eux.
 */
export type ZoneKey = "elbeuf" | "rouen" | "rouen-metropole" | "le-havre";

export type Zone = { key: ZoneKey; label: string; postalCodes: readonly string[] };

export const ZONES: Record<ZoneKey, Zone> = {
  elbeuf: {
    key: "elbeuf",
    label: "Elbeuf et alentours",
    // Elbeuf ; Caudebec et Saint-Pierre-lès-Elbeuf ; Cléon, Saint-Aubin-lès-Elbeuf, Tourville-la-Rivière.
    postalCodes: ["76500", "76320", "76410"],
  },
  rouen: { key: "rouen", label: "Rouen", postalCodes: ["76000", "76100"] },
  "rouen-metropole": {
    key: "rouen-metropole",
    label: "Métropole de Rouen",
    postalCodes: ["76300", "76140", "76120", "76800", "76130", "76230", "76160", "76250"],
  },
  "le-havre": { key: "le-havre", label: "Le Havre", postalCodes: ["76600", "76610", "76620"] },
};

export const ZONE_KEYS = Object.keys(ZONES) as ZoneKey[];

/** Zones parcourues par défaut : celles retenues pour le lancement. */
export const DEFAULT_DISCOVERY_ZONES: readonly ZoneKey[] = ["elbeuf", "rouen", "le-havre"];

export function isZoneKey(value: string): value is ZoneKey {
  return value in ZONES;
}

export function zoneForPostalCode(postalCode: string): ZoneKey | null {
  for (const zone of Object.values(ZONES)) if (zone.postalCodes.includes(postalCode)) return zone.key;
  return null;
}

export function zoneLabel(key: string): string {
  return isZoneKey(key) ? ZONES[key].label : key || "Hors zone";
}

/** Code NAF ciblé : entretien et réparation de véhicules automobiles légers. */
export const TARGET_NAF = "45.20A";
