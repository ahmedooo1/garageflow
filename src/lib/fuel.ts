import type { FuelType } from "@prisma/client";

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
