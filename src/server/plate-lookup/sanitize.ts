import type { FuelType } from "@prisma/client";
import type { VehicleTechnicalData } from "@/lib/plate";
import type { RawTechnical } from "./provider";

/**
 * Reconstruit les caractéristiques à partir de la seule liste blanche, en
 * validant chaque valeur. Tout ce qui n'est pas listé ici est ignoré, quel
 * que soit le fournisseur : c'est ce qui garantit qu'aucune donnée sur le
 * titulaire n'entre dans l'application.
 */
export function sanitizeTechnical(raw: RawTechnical, now = new Date()): VehicleTechnicalData {
  const firstRegistrationDate = isoDate(raw.firstRegistrationDate, now);
  const modelYear = int(raw.modelYear, 1900, now.getUTCFullYear() + 1);
  const powerKw = int(raw.powerKw, 1, 2000) ?? hpToKw(int(raw.powerHp, 1, 2700));
  const fuelLabel = text(raw.fuel, 40);
  const displacement = int(raw.displacementCc, 50, 10_000);
  return {
    make: titleCase(text(raw.make, 60)),
    model: text(raw.model, 60),
    version: text(raw.version, 80),
    vin: vin(raw.vin),
    firstRegistrationDate,
    year: modelYear ?? (firstRegistrationDate ? Number(firstRegistrationDate.slice(0, 4)) : null),
    fuel: mapFuel(fuelLabel),
    fuelLabel,
    engine: text(raw.engine, 80) || (displacement ? `${(displacement / 1000).toFixed(1).replace(".", ",")} L` : ""),
    powerKw,
    fiscalPower: int(raw.fiscalPower, 1, 200),
    gearbox: gearbox(text(raw.gearbox, 40)),
  };
}

function text(v: unknown, max: number): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v)
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function int(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*\d+([.,]\d+)?\s*$/.test(v) ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

function hpToKw(hp: number | null): number | null {
  return hp === null ? null : Math.round(hp / 1.35962);
}

function vin(v: unknown): string {
  const s = text(v, 20).toUpperCase().replace(/\s/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s) ? s : "";
}

function isoDate(v: unknown, now: Date): string | null {
  const s = text(v, 30);
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > now.getTime() + 24 * 3600 * 1000) return null;
  return date.toISOString().slice(0, 10);
}

function titleCase(s: string): string {
  if (!s || s !== s.toUpperCase() || s.length <= 3) return s;
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

function gearbox(s: string): string {
  const k = deaccent(s).toUpperCase();
  if (k === "M" || k.startsWith("MANU") || k === "MECANIQUE") return "Manuelle";
  if (k === "A" || k.startsWith("AUTO")) return "Automatique";
  return s;
}

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Codes d'énergie du certificat d'immatriculation (rubrique P.3) et libellés
 * courants. Un code inconnu donne `null` : l'utilisateur choisit lui-même.
 */
const FUEL_CODES: Record<string, FuelType> = {
  ES: "PETROL",
  ESSENCE: "PETROL",
  GO: "DIESEL",
  GAZOLE: "DIESEL",
  GASOIL: "DIESEL",
  DIESEL: "DIESEL",
  EL: "ELECTRIC",
  ELECTRIQUE: "ELECTRIC",
  ELECTRIC: "ELECTRIC",
  EH: "HYBRID",
  EE: "HYBRID",
  GH: "HYBRID",
  GL: "HYBRID",
  HYBRIDE: "HYBRID",
  GP: "LPG",
  GPL: "LPG",
  EG: "LPG",
  GN: "OTHER",
  GNV: "OTHER",
  FE: "OTHER",
  H2: "OTHER",
};

export function mapFuel(label: string): FuelType | null {
  const k = deaccent(label).toUpperCase().trim();
  if (!k) return null;
  if (FUEL_CODES[k]) return FUEL_CODES[k];
  if (/HYBRID/.test(k)) return "HYBRID";
  if (/GAZOLE|DIESEL|GASOIL/.test(k)) return "DIESEL";
  if (/ESSENCE/.test(k)) return "PETROL";
  if (/ELECTRI/.test(k)) return "ELECTRIC";
  if (/GPL/.test(k)) return "LPG";
  return null;
}
