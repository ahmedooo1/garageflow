/**
 * Génère des spécimens SYNTHÉTIQUES de certificat d'immatriculation pour les
 * tests de lecture : données fictives, mention « SPÉCIMEN » sur chaque image,
 * aucune reproduction de l'emblème ni du fond de sécurité officiels. La
 * disposition reprend seulement les rubriques (A, B, C.1, D.1…).
 *
 * Variantes : orientation, flou, basse résolution, contraste et bruit,
 * compression JPEG, reflet, rubriques masquées, légère inclinaison, et une
 * image sans document (échec attendu).
 *
 *   node scripts/generer-specimens-carte-grise.mjs
 * Sortie : tests/fixtures/carte-grise/*.png|jpg et attendu.json (valeurs de référence).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const OUT = join(process.cwd(), "tests", "fixtures", "carte-grise");
mkdirSync(OUT, { recursive: true });

// Titulaires fictifs : ces valeurs ne doivent jamais apparaître dans une extraction.
const VEHICLES = {
  peugeot: {
    A: "AB-123-CD", B: "12/03/2021", I: "05/06/2023", D1: "PEUGEOT", D2: "MLBYHZR", D21: "M10PGTVP0025671", D3: "308",
    E: "VF3LBYHZPMS000001", F1: "1860", F2: "1860", J1: "VP", K: "e2*2007/46*0534*12", P1: "1499", P2: "96", P3: "GO", P6: "7", V7: "108",
    C1: "MARTIN JEANNE", C3: "12 RUE DES ESSAIS 76000 ROUEN",
  },
  renault: {
    A: "FG-456-HJ", B: "01/07/2016", I: "20/01/2022", D1: "RENAULT", D2: "BH0FB", D21: "M10RENVP382E567", D3: "CLIO",
    E: "VF1RJA00068000002", F1: "1588", F2: "1588", J1: "VP", K: "e2*2007/46*0592*05", P1: "898", P2: "66", P3: "ES", P6: "5", V7: "105",
    C1: "DURAND PAUL", C3: "4 AVENUE DU SPECIMEN 76500 ELBEUF",
  },
  tesla: {
    A: "KL-789-MN", B: "15/09/2022", I: "15/09/2022", D1: "TESLA", D2: "3", D21: "M10TSLVP0001E01", D3: "MODEL 3",
    E: "LRW3E7EK0NC000003", F1: "2232", F2: "2232", J1: "VP", K: "e4*2007/46*1293*14", P1: "", P2: "208", P3: "EL", P6: "10", V7: "0",
    C1: "PETIT CLAIRE", C3: "7 IMPASSE DES TESTS 76600 LE HAVRE",
  },
};

function html(v) {
  const row = (code, value) => `<div class="r"><span class="c">${code}</span><span class="v">${value}</span></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff}
    .doc{width:1600px;height:1000px;box-sizing:border-box;padding:40px 50px;background:#eef3ec;font-family:Arial,Helvetica,sans-serif;color:#111;position:relative}
    .t{font-size:30px;font-weight:bold;letter-spacing:2px;margin-bottom:6px}
    .s{font-size:22px;color:#a00;font-weight:bold;margin-bottom:26px}
    .cols{display:flex;gap:70px}
    .col{flex:1}
    .r{display:flex;gap:22px;font-size:29px;line-height:46px}
    .c{min-width:92px;font-weight:bold}
    .owner{border:2px solid #789;padding:6px 12px;margin:6px 0}
    .wm{position:absolute;right:60px;bottom:30px;font-size:40px;color:#c33;font-weight:bold;opacity:.55}
  </style></head><body><div class="doc">
    <div class="t">CERTIFICAT D'IMMATRICULATION</div>
    <div class="s">SPÉCIMEN - DOCUMENT FICTIF POUR TESTS</div>
    <div class="cols">
      <div class="col">
        ${row("A", v.A)}${row("B", v.B)}
        <div class="owner">${row("C.1", v.C1)}${row("C.3", v.C3)}${row("C.4.1", "1")}</div>
        ${row("I", v.I)}${row("J.1", v.J1)}${row("K", v.K)}${row("F.1", v.F1)}${row("F.2", v.F2)}
      </div>
      <div class="col">
        ${row("D.1", v.D1)}${row("D.2", v.D2)}${row("D.2.1", v.D21)}${row("D.3", v.D3)}${row("E", v.E)}
        ${row("P.1", v.P1)}${row("P.2", v.P2)}${row("P.3", v.P3)}${row("P.6", v.P6)}${row("V.7", v.V7)}
      </div>
    </div>
    <div class="wm">SPÉCIMEN</div>
  </div></body></html>`;
}

/** Transformations appliquées dans le navigateur sur l'image de base. */
const VARIANTS = {
  nominal: { type: "png" },
  rot90: { type: "png", rotate: 90 },
  rot180: { type: "png", rotate: 180 },
  rot270: { type: "png", rotate: 270 },
  incline: { type: "png", rotate: 4 },
  basse_resolution: { type: "png", scale: 0.42 },
  flou: { type: "png", filter: "blur(1.6px)" },
  contraste_bruit: { type: "jpeg", quality: 0.85, filter: "contrast(0.5) brightness(1.2)", noise: 38 },
  jpeg_q30: { type: "jpeg", quality: 0.3 },
  reflet: { type: "png", glare: true },
  masque: { type: "png", mask: true },
};

const TRANSFORM = `async ({ src, o, seed }) => {
  const img = new Image(); img.src = src; await img.decode();
  let w = img.width, h = img.height;
  const s = o.scale || 1;
  const rad = (o.rotate || 0) * Math.PI / 180;
  const quarter = Math.abs(o.rotate || 0) % 180 === 90;
  const cw = Math.round((quarter ? h : w) * s + (o.rotate && !quarter && o.rotate % 180 ? 120 : 0));
  const ch = Math.round((quarter ? w : h) * s + (o.rotate && !quarter && o.rotate % 180 ? 120 : 0));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch);
  x.filter = o.filter || 'none';
  x.translate(cw / 2, ch / 2); x.rotate(rad); x.scale(s, s);
  x.drawImage(img, -w / 2, -h / 2);
  x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none';
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  if (o.noise) {
    const d = x.getImageData(0, 0, cw, ch);
    for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() - 0.5) * o.noise; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
    x.putImageData(d, 0, 0);
  }
  if (o.glare) {
    const g = x.createRadialGradient(cw * 0.72, ch * 0.32, 10, cw * 0.72, ch * 0.32, ch * 0.33);
    g.addColorStop(0, 'rgba(255,255,255,0.97)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, cw, ch);
  }
  if (o.mask) {
    // Doigt ou étiquette sur le VIN (E) et la puissance (P.2).
    x.fillStyle = '#2a2420';
    x.fillRect(940, 316, 560, 46);
    x.fillRect(940, 408, 200, 46);
  }
  return c.toDataURL(o.type === 'jpeg' ? 'image/jpeg' : 'image/png', o.quality || 0.92);
}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const truth = {};
let seed = 7;
for (const [name, v] of Object.entries(VEHICLES)) {
  await page.setContent(html(v));
  const base = await page.locator(".doc").screenshot({ type: "png" });
  const src = `data:image/png;base64,${base.toString("base64")}`;
  const variants = name === "peugeot" ? Object.entries(VARIANTS) : [["nominal", VARIANTS.nominal], ["rot180", VARIANTS.rot180], ["flou", VARIANTS.flou]];
  for (const [variant, o] of variants) {
    const url = await page.evaluate(`(${TRANSFORM})(${JSON.stringify({ src, o, seed: seed++ })})`);
    const ext = o.type === "jpeg" ? "jpg" : "png";
    const file = `${name}-${variant}.${ext}`;
    writeFileSync(join(OUT, file), Buffer.from(url.split(",")[1], "base64"));
    truth[file] = { vehicle: name, variant, masked: variant === "masque" ? ["E", "P.2"] : [] };
  }
}
// Aucune carte grise : un papier quelconque, pour vérifier l'échec propre.
await page.setContent(`<div style="width:1200px;height:800px;background:#d8cfc0;font:34px Georgia;padding:60px;box-sizing:border-box">Liste de courses<br>pain, lait, café<br>rendez-vous mardi</div>`);
writeFileSync(join(OUT, "aucun-document.png"), await page.locator("div").screenshot({ type: "png" }));
truth["aucun-document.png"] = { vehicle: null, variant: "aucun_document", masked: [] };
await browser.close();

const expected = Object.fromEntries(
  Object.entries(VEHICLES).map(([k, v]) => [k, { A: v.A, B: v.B, "D.1": v.D1, "D.2": v.D2, "D.2.1": v.D21, "D.3": v.D3, E: v.E, "P.1": v.P1, "P.2": v.P2, "P.3": v.P3, "P.6": v.P6, owner: [v.C1, v.C3] }]),
);
writeFileSync(join(OUT, "attendu.json"), JSON.stringify({ vehicles: expected, images: truth }, null, 2) + "\n");
console.log(`${Object.keys(truth).length} images générées dans ${OUT}`);
