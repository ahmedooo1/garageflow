/**
 * Copie le moteur de reconnaissance de texte (Tesseract.js, licence Apache 2.0)
 * et le modèle de langue française dans public/ocr, pour qu'ils soient servis
 * par GarageFlow lui-même : le navigateur ne contacte aucun service tiers
 * (pas de CDN), et les photos de carte grise ne quittent jamais l'appareil.
 *
 * Lancé avant `next dev` et `next build`. Les fichiers copiés ne sont pas versionnés.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const OUT = join(process.cwd(), "public", "ocr");
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(createRequire(join(tesseract, "package.json")).resolve("tesseract.js-core/package.json"));
const lang = dirname(require.resolve("@tesseract.js-data/fra/package.json"));

const files = [
  [join(tesseract, "dist", "worker.min.js"), join(OUT, "worker.min.js")],
  // Variantes LSTM seules (moteur utilisé) ; le worker choisit selon le support SIMD du navigateur.
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((f) => [join(core, f), join(OUT, "core", f)]),
  // Modèle « best_int » : 0,7 Mo, précision LSTM complète en entiers.
  [join(lang, "4.0.0_best_int", "fra.traineddata.gz"), join(OUT, "lang", "fra.traineddata.gz")],
];

for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`Fichier OCR introuvable : ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
console.log(`OCR local : ${files.length} fichiers copiés dans public/ocr`);
