import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { devices, expect, test, type Browser, type BrowserContext, type BrowserContextOptions, type Page, type Request } from "@playwright/test";

/*
 * Lecture de la carte grise dans le navigateur, sur des spécimens SYNTHÉTIQUES
 * (tests/fixtures/carte-grise, générés par scripts/generer-specimens-carte-grise.mjs).
 */
const DIR = join(process.cwd(), "tests", "fixtures", "carte-grise");
const truth = JSON.parse(readFileSync(join(DIR, "attendu.json"), "utf8")) as {
  vehicles: Record<string, Record<string, string> & { owner: string[] }>;
  images: Record<string, { vehicle: string | null; variant: string; masked: string[] }>;
};
const FIELDS = ["A", "B", "D.1", "D.2", "D.2.1", "D.3", "E", "P.1", "P.2", "P.3", "P.6"] as const;
const OWNER_WORDS = Object.values(truth.vehicles).flatMap((v) => v.owner.flatMap((o) => o.split(" ").filter((w) => w.length > 3)));
const RUN = Date.now().toString(36);

let customerId = "";
let session: Awaited<ReturnType<BrowserContext["storageState"]>> | undefined;

/** Un seul garage pour tout le fichier : la limite d'inscriptions par adresse IP (10 par heure) vaut pour toute la suite. */
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/register");
  await page.getByLabel("Nom du garage").fill(`Garage Carte Grise ${RUN}`);
  await page.getByLabel("Prénom").fill("Camille");
  await page.locator("#lastName").fill("Lecture");
  await page.getByLabel("Email").fill(`cg-${RUN}@cg-e2e.test`);
  await page.getByLabel("Mot de passe").fill("E2E-CarteGrise-Password-1!");
  await page.getByRole("button", { name: "Créer le garage" }).click();
  await expect(page).toHaveURL(/\/app\/atelier/);
  await page.goto("/app/clients/new");
  await page.getByLabel("Prénom").fill("Jean");
  await page.locator("#lastName").fill("Carte");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByRole("heading", { name: "Jean Carte" })).toBeVisible();
  customerId = page.url().split("/").pop() ?? "";
  session = await context.storageState();
  await context.close();
});

/** Page connectée au garage du fichier, avec un gabarit d'appareil facultatif. */
async function openPage(browser: Browser, device: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({ ...device, storageState: session });
  return context.newPage();
}

async function scan(page: Page, file: string) {
  await page.getByLabel("Importer une image de carte grise").setInputFiles(join(DIR, file));
  const region = page.getByRole("region", { name: "Lecture de la carte grise" });
  const failure = page.getByText(/n'a pas pu être lue/);
  await expect(region.or(failure)).toBeVisible({ timeout: 60_000 });
  return (await region.isVisible()) ? region : null;
}

const IMAGE_MAGIC = [Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from([0xff, 0xd8, 0xff])];
function carriesImage(req: Request): boolean {
  const body = req.postDataBuffer();
  if (!body) return false;
  return body.length > 150_000 || IMAGE_MAGIC.some((m) => body.includes(m)) || /multipart\/form-data[\s\S]*filename=/i.test(body.toString("latin1"));
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((n, f) => (statSync(join(dir, f)).isDirectory() ? n + countFiles(join(dir, f)) : n + 1), 0);
}

test.describe.configure({ mode: "serial" });

test("lecture, correction et confirmation, puis enregistrement : aucune image envoyée ni conservée", async ({ browser }) => {
  const page = await openPage(browser);
  await page.goto(`/app/vehicules/new?customerId=${customerId}`);
  const storageDir = join(process.cwd(), process.env.STORAGE_LOCAL_DIR ?? "storage");
  const filesBefore = countFiles(storageDir);

  const requests: Request[] = [];
  page.on("request", (r) => requests.push(r));

  const region = await scan(page, "peugeot-nominal.png");
  expect(region).not.toBeNull();
  await expect(page.getByLabel("D.1 Marque")).toHaveValue("PEUGEOT");
  await expect(page.getByTestId("cg-niveau-D.1")).toContainText("Fiable");
  await expect(page.getByLabel("E VIN")).toHaveValue("VF3LBYHZPMS000001");
  // Rien n'est repris avant confirmation.
  await expect(page.locator("#make")).toHaveValue("");
  // Correction par l'utilisateur, puis confirmation explicite.
  await page.getByLabel("D.3 Dénomination commerciale").fill("308 SW");
  await page.getByRole("button", { name: "Reporter dans le formulaire" }).click();
  await expect(page.getByText(/reprises dans le formulaire/)).toBeVisible();
  await expect(page.locator("#plate")).toHaveValue("AB-123-CD");
  await expect(page.locator("#make")).toHaveValue("Peugeot");
  await expect(page.locator("#model")).toHaveValue("308 SW");
  await expect(page.locator("#fuel")).toHaveValue("DIESEL");
  await expect(page.locator("#firstRegistrationDate")).toHaveValue("2021-03-12");
  await expect(page.locator("#cnit")).toHaveValue("M10PGTVP0025671");
  await page.getByLabel("Kilométrage").fill("45200");
  await page.getByRole("button", { name: "Créer le véhicule" }).click();
  await expect(page.getByRole("heading", { name: /Peugeot 308 SW/ })).toBeVisible();
  await expect(page.getByText(/Caractéristiques : Carte grise \(lecture locale, vérifiée par l'utilisateur\)/)).toBeVisible();
  await expect(page.getByText("M10PGTVP0025671")).toBeVisible();
  await expect(page.getByText("1499 cm³")).toBeVisible();

  // 1. Réseau : uniquement l'application elle-même, et aucune image dans aucune requête.
  const hosts = new Set(requests.map((r) => new URL(r.url()).hostname));
  expect([...hosts]).toEqual(["localhost"]);
  expect(requests.filter(carriesImage).map((r) => r.url())).toEqual([]);
  for (const r of requests) {
    const body = r.postDataBuffer()?.toString("utf8") ?? "";
    for (const w of OWNER_WORDS) expect(body, `requête ${r.url()} : ${w}`).not.toContain(w);
  }
  expect(requests.some((r) => r.url().includes("/ocr/lang/fra.traineddata.gz"))).toBe(true);

  // 2. Serveur : aucun fichier écrit, aucune photo, rien du titulaire en base.
  expect(countFiles(storageDir)).toBe(filesBefore);
  const prisma = new PrismaClient();
  try {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { customerId, plate: "AB123CD" }, include: { garage: { include: { photos: true } } } });
    expect(vehicle.garage.photos).toHaveLength(0);
    const stored = JSON.stringify(vehicle);
    for (const w of OWNER_WORDS) expect(stored).not.toContain(w);
  } finally {
    await prisma.$disconnect();
  }

  // 3. Navigateur : ni stockage local, ni base IndexedDB, ni cache.
  const browserState = await page.evaluate(async () => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    idb: (await indexedDB.databases()).map((d) => d.name),
    caches: await caches.keys(),
  }));
  // Seule base tolérée : celle du serveur de développement de Next (absente en production).
  expect(browserState.idb.filter((n) => n !== "__next_debug_channel")).toEqual([]);
  expect(browserState.caches).toEqual([]);
  for (const w of OWNER_WORDS) expect(browserState.local + browserState.session).not.toContain(w);
});

test("orientations, qualité d'image, rubriques masquées et échec : mesure sur tous les spécimens", async ({ browser }) => {
  test.setTimeout(600_000);
  const page = await openPage(browser);
  await page.goto(`/app/vehicules/new?customerId=${customerId}`);
  const report: Record<string, unknown>[] = [];
  const wrongButReliable: string[] = [];

  for (const [file, meta] of Object.entries(truth.images)) {
    const t0 = Date.now();
    const region = await scan(page, file);
    const ms = Date.now() - t0;
    if (!meta.vehicle) {
      expect(region, `${file} : échec attendu`).toBeNull();
      report.push({ file, variant: meta.variant, failed: true, ms });
      continue;
    }
    const expected = truth.vehicles[meta.vehicle];
    const row: Record<string, unknown> = { file, variant: meta.variant, ms, exact: 0, wrong: 0, missing: 0, expected: 0, fields: {} };
    if (!region) {
      report.push({ ...row, failed: true });
      continue;
    }
    for (const k of FIELDS) {
      const want = expected[k] ?? "";
      if (want === "") continue; // rubrique vide sur la carte (P.1 d'un véhicule électrique)
      row.expected = (row.expected as number) + 1;
      const got = (await page.locator(`[id="cg-${k}"]`).inputValue()).trim();
      const level = await page.getByTestId(`cg-niveau-${k}`).innerText();
      (row.fields as Record<string, string>)[k] = got === want ? "exact" : got === "" ? "absent" : `faux (${got})`;
      if (got === want) row.exact = (row.exact as number) + 1;
      else if (got === "") row.missing = (row.missing as number) + 1;
      else {
        row.wrong = (row.wrong as number) + 1;
        if (level.startsWith("Fiable")) wrongButReliable.push(`${file} ${k} : ${got} au lieu de ${want}`);
      }
      if (meta.masked.includes(k)) expect(got, `${file} ${k} masqué`).toBe("");
    }
    report.push(row);
    await page.getByRole("button", { name: "Annuler" }).click();
  }

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/precision-carte-grise.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.map((r) => [r.file, r.failed ? "échec" : `${r.exact}/${r.expected} exactes, ${r.wrong} fausses, ${r.missing} absentes`, `${r.ms} ms`])));

  // Garanties : aucune valeur fausse présentée comme fiable ; les cartes nettes sont lues presque entièrement.
  expect(wrongButReliable).toEqual([]);
  for (const r of report.filter((x) => x.variant === "nominal" || String(x.variant).startsWith("rot"))) {
    expect(r.failed, `${r.file}`).toBeFalsy();
    expect((r.exact as number) / (r.expected as number), `${r.file}`).toBeGreaterThanOrEqual(0.8);
  }
});

test("fichier qui n'est pas une image, puis saisie manuelle", async ({ browser }) => {
  const page = await openPage(browser);
  await page.goto(`/app/vehicules/new?customerId=${customerId}`);
  await page.getByLabel("Importer une image de carte grise").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("pas une image") });
  await expect(page.getByText("Ce fichier n'est pas une image.", { exact: false })).toBeVisible();
  await page.locator("#plate").fill("MN-987-PQ");
  await page.locator("#make").fill("Fiat");
  await page.locator("#model").fill("Panda");
  await page.getByRole("button", { name: "Créer le véhicule" }).click();
  await expect(page.getByRole("heading", { name: /Fiat Panda/ })).toBeVisible();
  await expect(page.getByText(/Caractéristiques : saisie manuelle/)).toBeVisible();
});

test("sur téléphone : appareil photo proposé, écran de vérification lisible sans défilement horizontal", async ({ browser }) => {
  // Gabarit iPhone 13 (taille, tactile, densité), avec le moteur Chromium du projet.
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  void _ignored;
  const page = await openPage(browser, iphone);
  await page.goto(`/app/vehicules/new?customerId=${customerId}`);
  await expect(page.getByLabel("Photographier la carte grise")).toHaveAttribute("capture", "environment");
  await expect(page.getByText("Photographier la carte grise", { exact: true })).toBeVisible();
  await scan(page, "peugeot-rot90.png");
  await expect(page.getByLabel("A Immatriculation")).toHaveValue("AB-123-CD");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
