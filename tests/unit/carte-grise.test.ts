import { describe, expect, it } from "vitest";
import { carteGriseToForm, confidenceLevel, extractCarteGrise, normalizeCode, type OcrWord } from "@/lib/carte-grise";

/** Construit des mots positionnés : une ligne par tableau, colonnes à x donné. */
function page(rows: [number, string][][], conf = 92): OcrWord[] {
  const words: OcrWord[] = [];
  rows.forEach((row, i) => {
    const y = 100 + i * 46;
    for (const [x, text] of row) {
      let cx = x;
      for (const t of text.split(" ")) {
        words.push({ text: t, confidence: conf, bbox: { x0: cx, y0: y, x1: cx + t.length * 15, y1: y + 28 } });
        cx += t.length * 15 + 10;
      }
    }
  });
  return words;
}

const FULL = page([
  [[50, "A"], [160, "AB-123-CD"], [830, "D.1"], [950, "PEUGEOT"]],
  [[50, "B"], [160, "12/03/2021"], [830, "D.2"], [950, "MLBYHZR"]],
  [[50, "C.1"], [180, "MARTIN JEANNE"], [830, "D.2.1"], [950, "M10PGTVP0025671"]],
  [[50, "C.3"], [180, "12 RUE DES ESSAIS 76000 ROUEN"], [830, "D.3"], [950, "308"]],
  [[50, "I"], [160, "05/06/2023"], [830, "E"], [950, "VF3LBYHZPMS000001"]],
  [[50, "K"], [160, "e2*2007/46*0534*12"], [830, "P.1"], [950, "1499"]],
  [[50, "F.1"], [160, "1860"], [830, "P.2"], [950, "96"]],
  [[830, "P.3"], [950, "GO"]],
  [[830, "P.6"], [950, "7"]],
]);

describe("codes de rubrique", () => {
  it("tolère les lectures approximatives", () => {
    expect(["D1", "D.1", "D,1", "D:1", "d.1"].map(normalizeCode)).toEqual(["D.1", "D.1", "D.1", "D.1", "D.1"]);
    expect(["pD.1", "|P.2", "(D.3"].map(normalizeCode)).toEqual(["D.1", "P.2", "D.3"]);
    expect(["D21", "D.21", "D.2.1", "P2", "P.6", "c.41", "C.4.1", "c1"].map(normalizeCode)).toEqual(["D.2.1", "D.2.1", "D.2.1", "P.2", "P.6", "C.4.1", "C.4.1", "C.1"]);
    expect(["A", "E", "B", "Z", "AB", "308", "D.9", "PEUGEOT"].map(normalizeCode)).toEqual(["A", "E", "B", null, null, null, null, null]);
  });
});

describe("extraction", () => {
  it("lit les onze rubriques d'une carte nette, malgré deux colonnes sur la même ligne", () => {
    const r = extractCarteGrise(FULL, new Date("2026-11-05"));
    expect(r.score).toBe(11);
    expect(Object.fromEntries(Object.entries(r.fields).map(([k, v]) => [k, v.value]))).toEqual({
      A: "AB-123-CD", B: "12/03/2021", "D.1": "PEUGEOT", "D.2": "MLBYHZR", "D.2.1": "M10PGTVP0025671", "D.3": "308",
      E: "VF3LBYHZPMS000001", "P.1": "1499", "P.2": "96", "P.3": "GO", "P.6": "7",
    });
    expect(confidenceLevel(r.fields.A)).toBe("fiable");
  });

  it("n'extrait jamais la zone C : ni le nom, ni l'adresse du titulaire", () => {
    const json = JSON.stringify(extractCarteGrise(FULL));
    for (const secret of ["MARTIN", "JEANNE", "RUE", "ESSAIS", "76000", "ROUEN"]) expect(json).not.toContain(secret);
  });

  it("des mots sans code lisible (code C mal lu) ne sont rattachés à aucune rubrique", () => {
    const words = page([
      [[50, "c1i"], [180, "MARTIN JEANNE"], [830, "D.1"], [950, "RENAULT"]],
      [[50, "A"], [160, "FG-456-HJ"]],
    ]);
    const r = extractCarteGrise(words);
    expect(r.fields["D.1"]?.value).toBe("RENAULT");
    expect(JSON.stringify(r)).not.toContain("MARTIN");
  });

  it("une plaque ou un VIN écrit dans la zone C n'est jamais repris par la recherche de motif", () => {
    const r = extractCarteGrise(page([[[50, "C.3"], [180, "AB-123-CD VF3LBYHZPMS000001"]]]));
    expect(r.fields.A).toBeUndefined();
    expect(r.fields.E).toBeUndefined();
  });

  it("corrige les confusions connues et le signale (VIN sans I, O ni Q ; GO lu « co »)", () => {
    const r = extractCarteGrise(page([[[50, "E"], [160, "VF3LBYHZPMSOOOOO1"]], [[50, "P.3"], [160, "co"]], [[50, "P.2"], [160, "96,00"]]]));
    expect(r.fields.E).toMatchObject({ value: "VF3LBYHZPMS000001", corrected: true });
    expect(r.fields["P.3"]).toMatchObject({ value: "GO", corrected: true });
    expect(r.fields["P.2"]?.value).toBe("96");
    expect(confidenceLevel(r.fields.E)).toBe("a_verifier");
  });

  it("refuse les valeurs incohérentes plutôt que de les proposer", () => {
    const r = extractCarteGrise(
      page([[[50, "A"], [160, "AB-12-C"]], [[50, "B"], [160, "31/02/2020"]], [[50, "E"], [160, "VF3LBY"]], [[50, "P.6"], [160, "900"]], [[50, "P.3"], [160, "ZZ"]]]),
      new Date("2026-11-05"),
    );
    expect(r.score).toBe(0);
    expect(r.missing).toHaveLength(11);
  });

  it("une date future est refusée", () => {
    expect(extractCarteGrise(page([[[50, "B"], [160, "01/01/2030"]]]), new Date("2026-11-05")).fields.B).toBeUndefined();
  });

  it("une marque inconnue reste proposée, mais à vérifier ; un code avec O/0 aussi", () => {
    const r = extractCarteGrise(page([[[50, "D.1"], [160, "MARQUEX"]], [[50, "D.2"], [160, "BHOFB"]]]));
    expect(confidenceLevel(r.fields["D.1"])).toBe("a_verifier");
    expect(r.fields["D.2"]).toMatchObject({ value: "BHOFB", ambiguous: true });
    expect(confidenceLevel(r.fields["D.2"])).toBe("a_verifier");
  });

  it("VIN et plaque reconnus à leur forme quand leur code n'a pas été lu", () => {
    const r = extractCarteGrise(page([[[160, "AB-123-CD"]], [[950, "VF3LBYHZPMS000001"]]]));
    expect(r.fields.A).toMatchObject({ value: "AB-123-CD", method: "motif" });
    expect(r.fields.E).toMatchObject({ method: "motif" });
    expect(confidenceLevel(r.fields.E)).toBe("a_verifier");
  });

  it("rubriques masquées : absentes, jamais devinées", () => {
    const masked = FULL.filter((w) => w.text !== "VF3LBYHZPMS000001" && w.text !== "96");
    const r = extractCarteGrise(masked);
    expect(r.missing).toEqual(["E", "P.2"]);
  });

  it("aucun texte : échec propre", () => {
    expect(extractCarteGrise([])).toMatchObject({ score: 0, fields: {} });
  });
});

describe("report dans le formulaire", () => {
  it("convertit les rubriques en champs du véhicule", () => {
    expect(
      carteGriseToForm({ A: "AB-123-CD", B: "12/03/2021", "D.1": "LAND ROVER", "D.2": "MLBYHZR", "D.2.1": "M10PGTVP0025671", "D.3": "308", E: "VF3LBYHZPMS000001", "P.1": "1499", "P.2": "96", "P.3": "GO", "P.6": "7" }),
    ).toEqual({
      plate: "AB-123-CD", firstRegistrationDate: "2021-03-12", year: "2021", make: "Land Rover", tvv: "MLBYHZR", cnit: "M10PGTVP0025671",
      model: "308", vin: "VF3LBYHZPMS000001", displacementCc: "1499", powerKw: "96", fuel: "DIESEL", fiscalPower: "7",
    });
    expect(carteGriseToForm({ "D.1": "BMW", "P.3": "EH" })).toEqual({ make: "BMW", fuel: "HYBRID" });
  });
});
