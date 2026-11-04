import type { FuelType } from "@prisma/client";

/**
 * Immatriculations françaises, utilisables côté client comme côté serveur.
 *
 * - SIV (depuis 2009) : AA-123-AA. Les lettres I, O et U ne sont jamais
 *   attribuées, le bloc « SS » non plus, et le bloc chiffré va de 001 à 999.
 * - FNI (avant 2009, encore en circulation) : 123 ABC 75, 1 à 4 chiffres,
 *   1 à 3 lettres, puis le département (2A, 2B et 971 à 976 compris).
 */
export type PlateFormat = "SIV" | "FNI";
export type ParsedPlate = { normalized: string; display: string; format: PlateFormat };

const SIV_LETTER = "[A-HJ-NP-TV-Z]";
const SIV = new RegExp(`^(${SIV_LETTER}{2})(\\d{3})(${SIV_LETTER}{2})$`);
const FNI = /^(\d{1,4})([A-Z]{1,3})(\d{2}|2A|2B|97[1-6])$/;

export function normalizeFrenchPlate(raw: string): string {
  return raw
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function parseFrenchPlate(raw: string): ParsedPlate | null {
  if (typeof raw !== "string" || raw.length > 20) return null;
  const n = normalizeFrenchPlate(raw);
  const siv = SIV.exec(n);
  if (siv) {
    const [, left, digits, right] = siv;
    if (digits === "000" || left === "SS" || right === "SS") return null;
    return { normalized: n, display: `${left}-${digits}-${right}`, format: "SIV" };
  }
  const fni = FNI.exec(n);
  if (fni) {
    const [, digits, letters, dept] = fni;
    if (/^0+$/.test(digits)) return null;
    return { normalized: n, display: `${digits} ${letters} ${dept}`, format: "FNI" };
  }
  return null;
}

/**
 * Caractéristiques techniques retenues, et seulement celles-ci : la liste
 * blanche est la frontière qui garantit qu'aucune donnée sur le titulaire
 * (nom, adresse, date de naissance…) n'entre dans GarageFlow.
 */
export type VehicleTechnicalData = {
  make: string;
  model: string;
  version: string;
  vin: string;
  /** Date de première immatriculation, AAAA-MM-JJ. */
  firstRegistrationDate: string | null;
  year: number | null;
  fuel: FuelType | null;
  /** Libellé d'énergie du fournisseur, affiché pour vérification. */
  fuelLabel: string;
  engine: string;
  powerKw: number | null;
  fiscalPower: number | null;
  gearbox: string;
};

export const TECHNICAL_FIELD_LABELS: Record<Exclude<keyof VehicleTechnicalData, "fuelLabel">, string> = {
  make: "Marque",
  model: "Modèle",
  version: "Version",
  vin: "VIN",
  firstRegistrationDate: "Mise en circulation",
  year: "Année",
  fuel: "Carburant",
  engine: "Motorisation",
  powerKw: "Puissance",
  fiscalPower: "Puissance fiscale",
  gearbox: "Boîte de vitesses",
};

/** Champs renseignés et champs absents, pour signaler une réponse incomplète. */
export function technicalCoverage(data: VehicleTechnicalData): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];
  for (const key of Object.keys(TECHNICAL_FIELD_LABELS) as (keyof typeof TECHNICAL_FIELD_LABELS)[]) {
    const v = data[key];
    (v === null || v === "" ? missing : found).push(key);
  }
  return { found, missing };
}

/** 1 kW = 1,36 ch (cheval-vapeur métrique). */
export function kwToHp(kw: number): number {
  return Math.round(kw * 1.35962);
}
