import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWorker, OEM, PSM } from "tesseract.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractCarteGrise, type CarteGriseExtraction, type OcrWord } from "@/lib/carte-grise";

/*
 * Lecture réelle (moteur Tesseract, modèle français local) des spécimens
 * synthétiques de tests/fixtures/carte-grise. Le même analyseur tourne dans
 * le navigateur ; ici, seuls 0° et 180° sont essayés (sans canevas, une
 * rotation d'un quart de tour rognerait l'image : couverte par l'E2E).
 */
const DIR = join(process.cwd(), "tests", "fixtures", "carte-grise");
const truth = JSON.parse(readFileSync(join(DIR, "attendu.json"), "utf8")) as {
  vehicles: Record<string, Record<string, string> & { owner: string[] }>;
  images: Record<string, { vehicle: string | null }>;
};
let worker: Awaited<ReturnType<typeof createWorker>>;

beforeAll(async () => {
  worker = await createWorker("fra", OEM.LSTM_ONLY, { langPath: join(process.cwd(), "node_modules/@tesseract.js-data/fra/4.0.0_best_int"), cacheMethod: "none" });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
}, 60_000);
afterAll(async () => {
  await worker?.terminate();
});

async function read(file: string): Promise<CarteGriseExtraction> {
  let best: CarteGriseExtraction | null = null;
  for (const deg of [0, 180]) {
    const r = await worker.recognize(readFileSync(join(DIR, file)), { rotateRadians: (deg * Math.PI) / 180 }, { blocks: true });
    const words: OcrWord[] = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
    const ex = extractCarteGrise(words, new Date("2026-11-05"));
    if (!best || ex.score > best.score) best = ex;
    if (ex.score >= 6) break;
  }
  return best!;
}

const values = (ex: CarteGriseExtraction) => Object.fromEntries(Object.entries(ex.fields).map(([k, v]) => [k, v.value]));

describe("lecture réelle des spécimens", () => {
  it("carte nette : les onze rubriques, exactes", async () => {
    const t = truth.vehicles.peugeot;
    const ex = await read("peugeot-nominal.png");
    expect(values(ex)).toEqual({ A: t.A, B: t.B, "D.1": t["D.1"], "D.2": t["D.2"], "D.2.1": t["D.2.1"], "D.3": t["D.3"], E: t.E, "P.1": t["P.1"], "P.2": t["P.2"], "P.3": t["P.3"], "P.6": t["P.6"] });
  }, 60_000);

  it("photo à l'envers : même résultat après retournement", async () => {
    const ex = await read("peugeot-rot180.png");
    expect(ex.score).toBe(11);
    expect(ex.fields.A?.value).toBe("AB-123-CD");
  }, 60_000);

  it("autres véhicules : aucune valeur fausse n'est marquée fiable", async () => {
    for (const file of ["renault-nominal.png", "tesla-nominal.png"]) {
      const t = truth.vehicles[truth.images[file].vehicle!];
      const ex = await read(file);
      expect(ex.score, file).toBeGreaterThanOrEqual(8);
      for (const [k, f] of Object.entries(ex.fields)) {
        const level = f.confidence >= 85 && !f.corrected && !f.ambiguous && f.method === "rubrique";
        if (level) expect(f.value, `${file} ${k}`).toBe(t[k]);
      }
    }
  }, 120_000);

  it("rubriques masquées : VIN et puissance absents, jamais inventés", async () => {
    const ex = await read("peugeot-masque.png");
    expect(ex.fields.E).toBeUndefined();
    expect(ex.fields["P.2"]).toBeUndefined();
    expect(ex.fields.A?.value).toBe("AB-123-CD");
  }, 60_000);

  it("aucune carte grise sur la photo : échec propre", async () => {
    expect((await read("aucun-document.png")).score).toBe(0);
  }, 60_000);

  it("le titulaire n'apparaît dans aucune extraction", async () => {
    for (const file of ["peugeot-nominal.png", "renault-nominal.png", "tesla-nominal.png"]) {
      const json = JSON.stringify(await read(file));
      for (const owner of truth.vehicles[truth.images[file].vehicle!].owner) {
        for (const word of owner.split(" ").filter((w) => w.length > 2)) expect(json, `${file} ${word}`).not.toContain(word);
      }
    }
  }, 120_000);
});
