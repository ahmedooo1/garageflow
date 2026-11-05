import { extractCarteGrise, type CarteGriseExtraction, type OcrWord } from "./carte-grise";

/**
 * Lecture d'une carte grise dans le navigateur, sans aucun envoi :
 * - le moteur (Tesseract.js) et le modèle de langue sont servis par
 *   GarageFlow lui-même (/ocr/), jamais par un service tiers ;
 * - l'image est décodée et lue en mémoire, sur l'appareil ; elle n'est ni
 *   envoyée, ni écrite (pas de cache de navigateur, pas d'IndexedDB) ;
 * - seules les rubriques retenues par `extractCarteGrise` sont rendues.
 */
export const OCR_ASSETS = { workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang" } as const;

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 2200;

export type ScanStep = "chargement" | "lecture";
export type ScanResult = { extraction: CarteGriseExtraction; orientation: 0 | 90 | 180 | 270; durationMs: number };

export class ScanError extends Error {
  constructor(readonly code: "type" | "taille" | "image" | "moteur") {
    super(code);
    this.name = "ScanError";
  }
}

/**
 * Image tournée et réduite si besoin. Avec `stretch`, niveaux de gris et
 * contraste étiré (2 % à 98 %) : utile sur une photo terne, mais il crée des
 * artefacts sur une image nette, d'où son usage en dernier essai seulement.
 */
function prepare(bitmap: ImageBitmap, rotation: number, stretch = false): HTMLCanvasElement {
  const quarter = rotation % 180 !== 0;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = quarter ? h : w;
  canvas.height = quarter ? w : h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ScanError("image");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  if (!stretch) return canvas;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = g;
    hist[g | 0]++;
  }
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.02; ) lo++;
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.02; ) hi--;
  if (hi - lo > 20) {
    const k = 255 / (hi - lo);
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, (d[i] - lo) * k));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Lit la carte grise. L'orientation normale est essayée d'abord ; si moins de
 * 6 rubriques sont lues, la photo est retournée (180°, puis 90° et 270°) et
 * le meilleur résultat est gardé.
 */
export async function scanCarteGrise(file: File, onProgress?: (step: ScanStep, ratio: number) => void): Promise<ScanResult> {
  if (!file.type.startsWith("image/")) throw new ScanError("type");
  if (file.size > MAX_IMAGE_BYTES) throw new ScanError("taille");
  const t0 = performance.now();

  let bitmap: ImageBitmap;
  try {
    // Respecte l'orientation enregistrée par l'appareil photo (EXIF).
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ScanError("image");
  }

  onProgress?.("chargement", 0);
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
  try {
    const { createWorker, OEM, PSM } = await import("tesseract.js");
    worker = await createWorker("fra", OEM.LSTM_ONLY, {
      ...OCR_ASSETS,
      workerBlobURL: false,
      cacheMethod: "none",
      logger: (m: { status: string; progress: number }) => {
        if (m.status.startsWith("loading")) onProgress?.("chargement", m.progress);
      },
    });
    // Texte épars : chaque code de rubrique et chaque valeur sont lus séparément, avec leur position.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  } catch {
    bitmap.close();
    throw new ScanError("moteur");
  }

  let best: ScanResult | null = null;
  // Orientation normale, puis retournée, puis quarts de tour ; enfin, contraste renforcé dans la meilleure orientation.
  const attempts: { rotation: 0 | 90 | 180 | 270; stretch: boolean }[] = [0, 180, 90, 270].map((r) => ({ rotation: r as 0 | 90 | 180 | 270, stretch: false }));
  try {
    for (let i = 0; i < attempts.length; i++) {
      onProgress?.("lecture", i / (attempts.length + 1));
      const { rotation, stretch } = attempts[i];
      const canvas = prepare(bitmap, rotation, stretch);
      try {
        const r = await worker.recognize(canvas, {}, { blocks: true, text: false });
        const words: OcrWord[] = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox })))));
        const extraction = extractCarteGrise(words);
        if (!best || extraction.score > best.extraction.score) best = { extraction, orientation: rotation, durationMs: 0 };
      } finally {
        release(canvas);
      }
      if (best && best.extraction.score >= 9) break;
      // Après les quatre orientations sans résultat complet : un dernier essai avec contraste renforcé.
      if (i === 3 && best && best.extraction.score >= 1) attempts.push({ rotation: best.orientation, stretch: true });
    }
  } finally {
    bitmap.close();
    await worker.terminate().catch(() => undefined);
  }
  onProgress?.("lecture", 1);
  const result = best ?? { extraction: extractCarteGrise([]), orientation: 0 as const, durationMs: 0 };
  return { ...result, durationMs: Math.round(performance.now() - t0) };
}
