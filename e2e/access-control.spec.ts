import { PrismaClient } from "@prisma/client";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/*
 * Contrôle d'accès vu de l'extérieur, sur le corps brut des réponses HTTP :
 * aucune redirection n'est suivie, et chaque page est demandée en document
 * HTML puis en flux RSC (navigation côté client). Les données du garage B
 * portent un marqueur unique qui ne doit apparaître nulle part ailleurs que
 * chez B lui-même.
 */

const PASSWORD = "E2E-Acces-Password-1!";
const RUN = Date.now().toString(36);
const MARKER = `MarqueurB${RUN}`;
const GARAGE_B = `Garage Cloison ${RUN}`;
const emails = { a: `gerant-a-${RUN}@acces-e2e.test`, b: `gerant-b-${RUN}@acces-e2e.test`, ops: `ops-${RUN}@acces-e2e.test` };

async function register(browser: Browser, garageName: string, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/register");
  await page.getByLabel("Nom du garage").fill(garageName);
  await page.getByLabel("Prénom").fill("Camille");
  await page.locator("#lastName").fill("Acces");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le garage" }).click();
  await expect(page).toHaveURL(/\/app\/atelier/);
  return page;
}

type Ids = { customer: string; vehicle: string; workOrder: string };

/** Données de B créées directement en base (le parcours d'interface est couvert ailleurs). */
async function seedGarageB(): Promise<Ids> {
  const prisma = new PrismaClient();
  try {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: emails.b } });
    const customer = await prisma.customer.create({ data: { garageId: owner.garageId, firstName: "Client", lastName: MARKER, phone: "0600000000", notes: MARKER } });
    const vehicle = await prisma.vehicle.create({ data: { garageId: owner.garageId, customerId: customer.id, plate: `AC${RUN.slice(-5).toUpperCase()}`, make: "Peugeot", model: MARKER, mileage: 1000 } });
    const workOrder = await prisma.workOrder.create({
      data: { garageId: owner.garageId, number: `E2E-${RUN}`, customerId: customer.id, vehicleId: vehicle.id, createdById: owner.id, mileageIn: 1000, reason: MARKER },
    });
    await prisma.user.update({ where: { email: emails.ops }, data: { platformAdmin: true } });
    return { customer: customer.id, vehicle: vehicle.id, workOrder: workOrder.id };
  } finally {
    await prisma.$disconnect();
  }
}

const pathsOfB = (ids: Ids) => [
  `/app/clients/${ids.customer}`,
  `/app/clients/${ids.customer}/edit`,
  `/app/vehicules/${ids.vehicle}`,
  `/app/vehicules/${ids.vehicle}/edit`,
  `/app/dossiers/${ids.workOrder}`,
  `/app/dossiers/${ids.workOrder}?tab=timeline`,
  `/app/clients?q=${MARKER}`,
  `/app/vehicules?q=${MARKER}`,
  `/app/dossiers?q=${MARKER}&status=ALL`,
  `/app/atelier`,
  `/app/dossiers/new?customerId=${ids.customer}`,
  `/api/export`,
];
const adminPaths = ["/admin", `/admin?q=${encodeURIComponent(GARAGE_B)}`];

/**
 * Corps brut en document et en flux RSC, sans suivre les redirections
 * d'authentification. Seul le rebond technique de Next vers « ?_rsc=… »
 * (même chemin, anti-cache) est suivi, pour lire la vraie charge RSC.
 */
async function bodies(request: APIRequestContext, path: string): Promise<{ variant: string; status: number; body: string; reachedRsc: boolean }[]> {
  const out = [];
  for (const [variant, headers] of [["document", {}], ["rsc", { RSC: "1" }]] as const) {
    let url = path;
    let res = await request.get(url, { maxRedirects: 0, headers });
    let hops = 0;
    for (;;) {
      const location = res.headers()["location"] ?? "";
      const target = location ? new URL(location, "http://x") : null;
      if (res.status() !== 307 || !target || target.pathname !== new URL(url, "http://x").pathname || !target.searchParams.has("_rsc") || hops++ > 2) break;
      url = `${target.pathname}${target.search}`;
      res = await request.get(url, { maxRedirects: 0, headers });
    }
    out.push({ variant, status: res.status(), body: await res.text(), reachedRsc: hops > 0 || variant === "document" });
  }
  return out;
}

/**
 * Une donnée de B est-elle dans la réponse ? Une valeur déjà présente dans
 * l'URL demandée (terme de recherche, identifiant) n'est pas comptée : la page
 * peut légitimement la renvoyer (champ de recherche, chemin de la route).
 */
function leaksB(body: string, path: string, ids: Ids): boolean {
  const secrets = [MARKER, GARAGE_B, emails.b, ids.customer, ids.vehicle, ids.workOrder].filter((v) => !decodeURIComponent(path).includes(v));
  return secrets.some((v) => body.includes(v));
}

test.describe.serial("contrôle d'accès sur les réponses brutes", () => {
  let ids: Ids;
  let a: Page;
  let b: Page;
  let ops: Page;

  test.beforeAll(async ({ browser }) => {
    b = await register(browser, GARAGE_B, emails.b);
    a = await register(browser, `Garage Voisin ${RUN}`, emails.a);
    ops = await register(browser, `Garage Ops ${RUN}`, emails.ops);
    ids = await seedGarageB();
  });

  test("contrôle : le garage B voit ses propres données, en document comme en flux RSC", async () => {
    for (const r of await bodies(b.request, `/app/clients/${ids.customer}`)) {
      expect(r.status, r.variant).toBe(200);
      expect(r.body, r.variant).toContain(MARKER);
    }
  });

  test("contrôle : la recherche de B renvoie bien sa fiche (la détection par identifiant fonctionne)", async () => {
    for (const r of await bodies(b.request, `/app/clients?q=${MARKER}`)) expect(r.body, r.variant).toContain(ids.customer);
  });

  test("anonyme : redirigé vers la connexion, aucun octet de donnée", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    for (const path of [...pathsOfB(ids), ...adminPaths]) {
      for (const r of await bodies(anon, path)) {
        if (path === "/api/export") expect(r.status, `${path} ${r.variant}`).toBe(401);
        else expect(r.status, `${path} ${r.variant}`).toBe(307);
        expect(leaksB(r.body, path, ids), `${path} ${r.variant} anonyme`).toBe(false);
        expect(r.body, `${path} ${r.variant} anonyme`).not.toContain("Revenu mensuel");
      }
    }
    await anon.dispose();
  });

  test("autre garage : aucune donnée de B, ni dans les pages, ni dans l'export, ni dans /admin", async () => {
    for (const path of [...pathsOfB(ids), ...adminPaths]) {
      for (const r of await bodies(a.request, path)) {
        expect(leaksB(r.body, path, ids), `${path} ${r.variant} garage A`).toBe(false);
        expect(r.body, `${path} ${r.variant} garage A`).not.toContain("Revenu mensuel");
      }
    }
  });

  test("administrateur plateforme : la console liste B, sans accéder à ses données métier", async () => {
    const admin = await ops.request.get(`/admin?q=${encodeURIComponent(GARAGE_B)}`, { maxRedirects: 0 });
    expect(admin.status()).toBe(200);
    const html = await admin.text();
    expect(html).toContain(GARAGE_B);
    expect(html).not.toContain(MARKER);
    for (const path of pathsOfB(ids)) {
      for (const r of await bodies(ops.request, path)) {
        expect(leaksB(r.body.replaceAll(GARAGE_B, "").replaceAll(emails.b, ""), path, ids), `${path} ${r.variant} administrateur`).toBe(false);
      }
    }
  });
});
