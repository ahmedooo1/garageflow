import { PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

/* Données fictives, réservées à ce test. Le test crée ses propres garages et
   n'accorde le rôle plateforme qu'à son propre compte. */
const PASSWORD = "E2E-Growth-Password-1!";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Nom du garage").fill(`Garage ${email}`);
  await page.getByLabel("Prénom").fill("Camille");
  await page.locator("#lastName").fill("E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le garage" }).click();
  await expect(page).toHaveURL(/\/app\/atelier/);
}

async function grantPlatformAdmin(email: string) {
  const prisma = new PrismaClient();
  try {
    await prisma.user.update({ where: { email }, data: { platformAdmin: true } });
  } finally {
    await prisma.$disconnect();
  }
}

test("une demande de démo arrive dans la console des prospects", async ({ page, browser }) => {
  const suffix = Date.now().toString(36);
  const garageName = `Garage E2E ${suffix}`;

  await page.goto("/#demo");
  const demo = page.locator("#demo");
  await demo.getByLabel("Votre nom").fill("Alex E2E");
  await demo.getByLabel("Nom du garage").fill(garageName);
  await demo.getByLabel("Email").fill(`alex-${suffix}@garage-e2e.test`);
  await demo.getByLabel("Code postal du garage").fill("76500");
  await demo.getByRole("button", { name: "Demander une démonstration" }).click();
  await expect(demo.getByText("Merci, c'est noté.")).toBeVisible();

  const admin = await browser.newPage();
  const adminEmail = `admin-${suffix}@garageflow-e2e.test`;
  await register(admin, adminEmail);
  await grantPlatformAdmin(adminEmail);

  await admin.goto("/admin/prospects?demo=1");
  await admin.getByRole("link", { name: garageName }).click();
  await expect(admin.getByText("Démonstration demandée le")).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Qualification" })).toBeVisible();
  await expect(admin.getByText("Hypothèse à vérifier", { exact: false })).toBeVisible();

  // Un modèle de message est préparé, jamais envoyé sans approbation.
  await admin.getByRole("button", { name: "Préparer" }).click();
  await expect(admin.getByText("Brouillon", { exact: true })).toBeVisible();
  await expect(admin.getByRole("textbox", { name: "Corps" })).toHaveValue(/desinscription/);
  await admin.close();
});

test("la console de prospection est fermée aux garages", async ({ page }) => {
  await register(page, `gerant-${Date.now().toString(36)}@garage-e2e.test`);
  await page.goto("/admin/prospects");
  await expect(page).toHaveURL(/\/app\/atelier/);
  const res = await page.request.get("/api/admin/prospects/export");
  expect(res.status()).toBe(403);
});

test("robots.txt exclut la console et pointe vers le plan du site", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin/");
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
});

test("la redirection de /admin ne transporte aucune donnée (anonyme ou garage)", async ({ page, request }) => {
  // Régression : la vérification du layout seul laissait la page se rendre dans le corps de la redirection.
  const marker = `Garage Fuite ${Date.now().toString(36)}`;
  await page.goto("/#demo");
  const demo = page.locator("#demo");
  await demo.getByLabel("Votre nom").fill("Test Fuite");
  await demo.getByLabel("Nom du garage").fill(marker);
  await demo.getByLabel("Email").fill(`fuite-${Date.now().toString(36)}@garage-e2e.test`);
  await demo.getByLabel("Code postal du garage").fill("76000");
  await demo.getByRole("button", { name: "Demander une démonstration" }).click();
  await expect(demo.getByText("Merci, c'est noté.")).toBeVisible();

  const paths = ["/admin", "/admin/prospects", "/admin/croissance", "/admin/prospects/new"];
  for (const path of paths) {
    const anon = await request.get(path, { maxRedirects: 0 });
    expect(anon.status(), path).toBe(307);
    expect(await anon.text(), `${path} anonyme`).not.toMatch(new RegExp(`${marker}|Revenu mensuel|@garage-e2e\\.test`));
  }

  const garage = await page.context().browser()!.newPage();
  await register(garage, `curieux-${Date.now().toString(36)}@garage-e2e.test`);
  for (const path of paths) {
    const res = await garage.request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(await res.text(), `${path} gérant de garage`).not.toMatch(new RegExp(`${marker}|Revenu mensuel|garageflow-e2e\\.test`));
  }
  await garage.close();
});
