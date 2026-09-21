import { expect, test } from "@playwright/test";

test("la page d'accueil présente le produit, le parcours et les tarifs", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/GarageFlow/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("du client à la clé rendue");

  // Le parcours en huit étapes est décrit.
  await expect(page.getByRole("heading", { name: "Réception", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Validation client", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Restitution", exact: true })).toBeVisible();

  // Les deux plans sont annoncés avec leur prix.
  const pricing = page.locator("#tarifs");
  await expect(pricing.getByRole("heading", { name: "Atelier", exact: true })).toBeVisible();
  await expect(pricing.getByRole("heading", { name: "Réseau", exact: true })).toBeVisible();
  await expect(pricing).toContainText("59 €");
  await expect(pricing).toContainText("129 €");

  // La FAQ s'ouvre sans JavaScript applicatif.
  const faq = page.getByText("Mes clients doivent-ils créer un compte ?");
  await faq.click();
  await expect(page.getByText(/Ils reçoivent un lien personnel/)).toBeVisible();
});

test("les appels à l'action mènent à la création de garage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Essayer 14 jours gratuitement/ }).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByRole("heading", { name: "Créer votre garage" })).toBeVisible();
});

test("les pages légales sont accessibles depuis le pied de page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Conditions d'utilisation" }).click();
  await expect(page).toHaveURL(/\/cgu/);
  await expect(page.getByRole("heading", { name: "Conditions générales d'utilisation" })).toBeVisible();
  await expect(page.getByText(/essai gratuite de 14 jours/)).toBeVisible();

  await page.goto("/confidentialite");
  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByText(/responsable de traitement/).first()).toBeVisible();
});
