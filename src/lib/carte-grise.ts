import type { FuelType } from "@prisma/client";
import { mapFuel } from "./fuel";
import { parseFrenchPlate } from "./plate";

/**
 * Extraction des rubriques techniques d'un certificat d'immatriculation à
 * partir des mots reconnus (texte, confiance, position). Fonction pure,
 * utilisée dans le navigateur : ni l'image ni le texte complet ne quittent
 * l'appareil, et seul le résultat ci-dessous est conservé.
 *
 * Garanties :
 * - liste blanche : seules les rubriques de `CARTE_GRISE_FIELDS` sont lues ;
 * - la zone C (titulaire : nom, adresse) et toute rubrique non listée sont
 *   écartées, ainsi que les mots qui ne suivent aucune rubrique reconnue ;
 * - chaque valeur est validée par son format ; une valeur douteuse est
 *   proposée « à vérifier » ou laissée vide, jamais inventée.
 */
export const CARTE_GRISE_FIELDS = ["A", "B", "D.1", "D.2", "D.2.1", "D.3", "E", "P.1", "P.2", "P.3", "P.6"] as const;
export type CarteGriseField = (typeof CARTE_GRISE_FIELDS)[number];

export const CARTE_GRISE_LABELS: Record<CarteGriseField, string> = {
  A: "Immatriculation",
  B: "Date de 1re immatriculation",
  "D.1": "Marque",
  "D.2": "Type mine / TVV",
  "D.2.1": "CNIT",
  "D.3": "Dénomination commerciale",
  E: "VIN",
  "P.1": "Cylindrée (cm³)",
  "P.2": "Puissance nette (kW)",
  "P.3": "Énergie",
  "P.6": "Puissance fiscale (CV)",
};

export type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };

export type ExtractedField = {
  value: string;
  /** Confiance de 0 à 100 : celle du moteur, réduite si la valeur a dû être corrigée ou trouvée hors rubrique. */
  confidence: number;
  /** « rubrique » : lue après son code ; « motif » : reconnue à sa forme (VIN, plaque) ailleurs sur la carte. */
  method: "rubrique" | "motif";
  /** Corrections appliquées (O lu au lieu de 0…), affichées pour vérification. */
  corrected: boolean;
  /** Code alphanumérique contenant O/0 ou I/1 : impossible à trancher par le contexte, toujours à vérifier. */
  ambiguous: boolean;
};

export type CarteGriseExtraction = {
  fields: Partial<Record<CarteGriseField, ExtractedField>>;
  missing: CarteGriseField[];
  /** Nombre de rubriques valides : sert à choisir la bonne orientation. */
  score: number;
};

/**
 * « fiable » seulement si la valeur a été lue après son code, sans correction,
 * sans caractère ambigu, avec une confiance d'au moins 85 % ; sinon « à vérifier ».
 */
export function confidenceLevel(m: ExtractedField | undefined): "fiable" | "a_verifier" | "non_lu" {
  if (!m) return "non_lu";
  return m.confidence >= 85 && !m.corrected && !m.ambiguous && m.method === "rubrique" ? "fiable" : "a_verifier";
}

/** Rubriques connues mais non retenues : elles terminent la valeur précédente et sont ignorées. */
const OTHER_CODES = new Set([
  "C.1", "C.2", "C.3", "C.4", "C.4.1", "C.4.A", "C.5", "F.1", "F.2", "F.3", "G", "G.1", "H", "I", "I.1", "J", "J.1", "J.2", "J.3", "K",
  "P.4", "P.5", "Q", "S.1", "S.2", "U.1", "U.2", "V.7", "V.9", "X.1", "Y.1", "Y.2", "Y.3", "Y.4", "Y.5", "Y.6", "Z.1", "Z.2", "Z.3", "Z.4",
]);
const KEPT = new Set<string>(CARTE_GRISE_FIELDS);
const SINGLE_LETTER_CODES = new Set(["A", "B", "E", "G", "H", "I", "J", "K", "Q"]);

/** Code de rubrique, tolérant aux erreurs de lecture courantes (« D1 », « D:3 », « P2 », « c.41 »). */
export function normalizeCode(raw: string): string | null {
  // Un caractère parasite collé devant un code (« pD.1 ») : le code est en capitales, suivi d'un chiffre.
  const t = raw.trim().replace(/^[a-z|(]([A-Z][.,:;]?\d)/, "$1");
  if (/^[A-Z]$/.test(t)) return SINGLE_LETTER_CODES.has(t) ? t : null;
  const m = /^([A-Za-z])[.,:;]?\s?(\d)(?:[.,:;]?(\d|[aA]))?[.,:;|]?$/.exec(t.replace(/[|()]/g, ""));
  if (!m) return null;
  const letter = m[1].toUpperCase();
  if (!"CDFGIJPSUVXYZ".includes(letter)) return null;
  const code = `${letter}.${m[2]}${m[3] ? `.${m[3].toUpperCase()}` : ""}`;
  return KEPT.has(code) || OTHER_CODES.has(code) ? code : null;
}

type Segment = { code: string; words: OcrWord[] };

/** Regroupe les mots en lignes (même hauteur), puis en segments « code + valeur ». */
function segments(words: OcrWord[]): { segments: Segment[]; all: OcrWord[] } {
  const all = words.filter((w) => w.text.trim() && w.bbox.y1 > w.bbox.y0);
  if (!all.length) return { segments: [], all };
  const heights = all.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const h = heights[Math.floor(heights.length / 2)];
  const rows: OcrWord[][] = [];
  for (const w of [...all].sort((a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2)) {
    const yc = (w.bbox.y0 + w.bbox.y1) / 2;
    const row = rows.find((r) => Math.abs((r[0].bbox.y0 + r[0].bbox.y1) / 2 - yc) < h * 0.55);
    if (row) row.push(w);
    else rows.push([w]);
  }
  const out: Segment[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let current: Segment | null = null;
    let prev: OcrWord | null = null;
    for (const w of row) {
      const code = normalizeCode(w.text);
      if (code) {
        current = { code, words: [] };
        out.push(current);
      } else if (current && prev) {
        const gap = w.bbox.x0 - prev.bbox.x1;
        // Entre le code et sa valeur, l'écart peut être grand ; entre deux mots d'une valeur, il est petit.
        const limit = current.words.length === 0 ? h * 9 : h * 2.2;
        if (gap <= limit) current.words.push(w);
        else current = null; // colonne suivante sans code lisible : mots orphelins, ignorés
      }
      prev = w;
    }
  }
  return { segments: out, all };
}

const mean = (ws: OcrWord[]) => (ws.length ? ws.reduce((a, w) => a + w.confidence, 0) / ws.length : 0);

/** Corrections de lecture dans une zone qui ne contient que des chiffres. */
function digitsOnly(s: string): { v: string; corrected: boolean } {
  const v = s.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
  return { v, corrected: v !== s };
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
function vin(raw: string): { v: string; corrected: boolean } | null {
  const s = raw.toUpperCase().replace(/[\s-]/g, "");
  // Un VIN ne contient jamais I, O ni Q (ISO 3779) : ce sont des 1 et des 0 mal lus.
  const v = s.replace(/[OQ]/g, "0").replace(/I/g, "1");
  return VIN_RE.test(v) ? { v, corrected: v !== s } : null;
}

function date(raw: string, now: Date): { v: string; corrected: boolean } | null {
  const { v: d, corrected } = digitsOnly(raw.replace(/\s/g, ""));
  const m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(d);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCDate() !== day || dt.getUTCMonth() !== month - 1 || year < 1900 || dt.getTime() > now.getTime() + 86_400_000) return null;
  return { v: `${m[1]}/${m[2]}/${m[3]}`, corrected };
}

function integer(raw: string, min: number, max: number): { v: string; corrected: boolean } | null {
  const { v, corrected } = digitsOnly(raw.replace(/\s/g, "").replace(/[,.]0+$/, ""));
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? { v: String(n), corrected } : null;
}

const FUEL_FIXES: Record<string, string> = { G0: "GO", CO: "GO", C0: "GO", "6O": "GO", E5: "ES", EI: "EL", E1: "EL", GF: "GP" };
function fuel(raw: string): { v: string; corrected: boolean } | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9/]/g, "");
  const fixed = FUEL_FIXES[s] ?? s;
  return mapFuel(fixed) ? { v: fixed, corrected: fixed !== s } : null;
}

/** Marques courantes en France : une marque inconnue reste proposée, mais « à vérifier ». */
const MAKES = new Set(
  "ABARTH ALFA ROMEO ALPINE ASTON MARTIN AUDI BENTLEY BMW BYD CADILLAC CHEVROLET CHRYSLER CITROEN CUPRA DACIA DAEWOO DAIHATSU DODGE DS FERRARI FIAT FORD HONDA HYUNDAI INFINITI ISUZU IVECO JAGUAR JEEP KIA LADA LAMBORGHINI LANCIA LAND ROVER LEXUS LIGIER LOTUS LYNK MASERATI MAZDA MERCEDES MERCEDES-BENZ MG MICROCAR MINI MITSUBISHI NISSAN OPEL PEUGEOT POLESTAR PORSCHE RENAULT ROVER SAAB SEAT SKODA SMART SSANGYONG SUBARU SUZUKI TESLA TOYOTA VOLKSWAGEN VW VOLVO AIXAM".split(
    " ",
  ),
);
const MULTI_WORD_MAKES = ["ALFA ROMEO", "ASTON MARTIN", "LAND ROVER"];

function make(raw: string): { v: string; known: boolean } | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9 -]/g, "").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 30 || /\d{3,}/.test(s)) return null;
  const known = MAKES.has(s) || MULTI_WORD_MAKES.includes(s) || MAKES.has(s.split(" ")[0]);
  return { v: s, known };
}

function alnum(raw: string, min: number, max: number): string | null {
  const s = raw.toUpperCase().replace(/[^A-Z0-9*]/g, "");
  return s.length >= min && s.length <= max ? s : null;
}

function commercialName(raw: string): string | null {
  const s = raw.replace(/[^\p{L}\p{N} .+'-]/gu, "").replace(/\s+/g, " ").trim();
  return s.length >= 1 && s.length <= 40 ? s.toUpperCase() : null;
}

export function extractCarteGrise(words: OcrWord[], now = new Date()): CarteGriseExtraction {
  const { segments: segs, all } = segments(words);
  const fields: Partial<Record<CarteGriseField, ExtractedField>> = {};
  const set = (key: CarteGriseField, value: string, ws: OcrWord[], corrected: boolean, method: ExtractedField["method"] = "rubrique", penalty = 0) => {
    if (fields[key]) return;
    const base = mean(ws);
    const confidence = Math.max(0, Math.round(base - (corrected ? 12 : 0) - penalty - (method === "motif" ? 10 : 0)));
    const ambiguous = (key === "D.2" || key === "D.2.1") && /[O0I1]/.test(value);
    fields[key] = { value, confidence, method, corrected, ambiguous };
  };

  for (const seg of segs) {
    // Zone C (titulaire) et rubriques non retenues : jamais lues.
    if (!KEPT.has(seg.code) || seg.words.length === 0) continue;
    const ws = seg.words;
    const raw = ws.map((w) => w.text).join(" ");
    const key = seg.code as CarteGriseField;
    switch (key) {
      case "A": {
        const p = parseFrenchPlate(raw) ?? parseFrenchPlate(raw.replace(/0/g, "O")) ?? parseFrenchPlate(digitsOnly(raw).v);
        if (p) set(key, p.display, ws, p.display.replace(/-/g, "") !== raw.toUpperCase().replace(/[^A-Z0-9]/g, ""));
        break;
      }
      case "B": {
        const d = date(raw, now);
        if (d) set(key, d.v, ws, d.corrected);
        break;
      }
      case "D.1": {
        const m = make(raw);
        if (m) set(key, m.v, ws, false, "rubrique", m.known ? 0 : 25);
        break;
      }
      case "D.2": {
        const v = alnum(raw, 1, 25);
        if (v) set(key, v, ws, false);
        break;
      }
      case "D.2.1": {
        const v = alnum(raw, 8, 20);
        if (v) set(key, v, ws, false);
        break;
      }
      case "D.3": {
        const v = commercialName(raw);
        if (v) set(key, v, ws, false);
        break;
      }
      case "E": {
        const v = vin(raw);
        if (v) set(key, v.v, ws, v.corrected);
        break;
      }
      case "P.1": {
        const v = integer(raw, 50, 10_000);
        if (v) set(key, v.v, ws, v.corrected);
        break;
      }
      case "P.2": {
        const v = integer(raw, 1, 2000);
        if (v) set(key, v.v, ws, v.corrected);
        break;
      }
      case "P.3": {
        const v = fuel(raw);
        if (v) set(key, v.v, ws, v.corrected);
        break;
      }
      case "P.6": {
        const v = integer(raw, 1, 200);
        if (v) set(key, v.v, ws, v.corrected);
        break;
      }
    }
  }

  // Formes reconnaissables sans leur code : VIN (17 caractères) et plaque SIV.
  // Les mots situés après un code de la zone C ne sont jamais pris.
  const ownerWords = new Set(segs.filter((s) => s.code.startsWith("C.")).flatMap((s) => s.words));
  const candidates = all.filter((w) => !ownerWords.has(w));
  if (!fields.E) {
    for (const w of candidates) {
      const v = vin(w.text);
      if (v && /\d/.test(v.v) && /[A-Z]/.test(v.v)) {
        set("E", v.v, [w], v.corrected, "motif");
        break;
      }
    }
  }
  if (!fields.A) {
    for (const w of candidates) {
      const p = /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(w.text.toUpperCase()) ? parseFrenchPlate(w.text) : null;
      if (p) {
        set("A", p.display, [w], false, "motif");
        break;
      }
    }
  }

  const missing = CARTE_GRISE_FIELDS.filter((k) => !fields[k]);
  return { fields, missing, score: CARTE_GRISE_FIELDS.length - missing.length };
}

/** Correspondance rubrique → champ du formulaire véhicule. */
export function carteGriseToForm(fields: Partial<Record<CarteGriseField, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  const fuelType: FuelType | null = fields["P.3"] ? mapFuel(fields["P.3"]) : null;
  if (fields.A) out.plate = fields.A;
  if (fields.B) {
    const [d, m, y] = fields.B.split("/");
    if (d && m && y) {
      out.firstRegistrationDate = `${y}-${m}-${d}`;
      out.year = y;
    }
  }
  if (fields["D.1"]) out.make = makeCase(fields["D.1"]);
  if (fields["D.2"]) out.tvv = fields["D.2"];
  if (fields["D.2.1"]) out.cnit = fields["D.2.1"];
  if (fields["D.3"]) out.model = fields["D.3"];
  if (fields.E) out.vin = fields.E;
  if (fields["P.1"]) out.displacementCc = fields["P.1"];
  if (fields["P.2"]) out.powerKw = fields["P.2"];
  if (fuelType) out.fuel = fuelType;
  if (fields["P.6"]) out.fiscalPower = fields["P.6"];
  return out;
}

/** « PEUGEOT » → « Peugeot », « LAND ROVER » → « Land Rover » ; les sigles courts (BMW, DS, MG) restent en capitales. */
function makeCase(s: string): string {
  if (s.length <= 3) return s;
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}
