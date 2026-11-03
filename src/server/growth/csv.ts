import { normalizeEmail, normalizePostalCode, normalizeSiret, normalizeUrl } from "@/lib/growth/normalize";
import { zoneForPostalCode } from "@/lib/growth/zones";

/**
 * Import CSV (séparateur « ; » ou « , », guillemets doubles). Chaque ligne doit
 * indiquer d'où vient l'information (`source_url`) : une ligne sans source est
 * refusée, on n'importe jamais une coordonnée dont on ne peut pas dire l'origine.
 */

export const CSV_COLUMNS = ["nom", "adresse", "code_postal", "ville", "siret", "site_web", "email", "telephone", "source_url"] as const;
export const MAX_IMPORT_ROWS = 500;

export type CsvLead = {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  zone: string;
  siret: string;
  website: string;
  email: string;
  phone: string;
  sourceUrl: string;
};

export type CsvResult = { rows: CsvLead[]; errors: { line: number; message: string }[] };

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

function phoneOf(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return /^(\+33|0)\d{9}$/.test(digits) ? digits : "";
}

export function parseLeadCsv(text: string): CsvResult {
  const table = parseCsv(text);
  const errors: CsvResult["errors"] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "Fichier vide" }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const idx = Object.fromEntries(CSV_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof CSV_COLUMNS)[number], number>;
  if (idx.nom < 0 || idx.source_url < 0) {
    return { rows: [], errors: [{ line: 1, message: "Colonnes obligatoires : nom, source_url" }] };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 1, message: `${MAX_IMPORT_ROWS} lignes maximum par import` }] };
  }
  const get = (r: string[], col: (typeof CSV_COLUMNS)[number]) => (idx[col] >= 0 ? (r[idx[col]] ?? "").trim() : "");

  const rows: CsvLead[] = [];
  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = get(r, "nom").slice(0, 160);
    const sourceUrl = normalizeUrl(get(r, "source_url"));
    if (!name) return errors.push({ line, message: "Nom manquant" });
    if (!sourceUrl) return errors.push({ line, message: "source_url manquante ou invalide" });
    const rawEmail = get(r, "email");
    const email = normalizeEmail(rawEmail);
    if (rawEmail && !email) return errors.push({ line, message: `Email invalide : ${rawEmail.slice(0, 60)}` });
    const rawSiret = get(r, "siret");
    const siret = normalizeSiret(rawSiret);
    if (rawSiret && !siret) return errors.push({ line, message: "SIRET invalide (14 chiffres)" });
    const postalCode = normalizePostalCode(get(r, "code_postal"));
    rows.push({
      name,
      address: get(r, "adresse").slice(0, 200),
      postalCode,
      city: get(r, "ville").slice(0, 80),
      zone: zoneForPostalCode(postalCode) ?? "",
      siret,
      website: normalizeUrl(get(r, "site_web")),
      email,
      phone: phoneOf(get(r, "telephone")),
      sourceUrl,
    });
  });
  return { rows, errors };
}
