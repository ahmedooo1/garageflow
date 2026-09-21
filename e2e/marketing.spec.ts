import { expect, test } from "@playwright/test";

test("la page d'accueil présente le produit, le parcours et les tarifs", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/GarageFlow/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("la clé rendue");

  // Le sommaire annonce les chapitres du dossier.
  const sommaire = page.getByRole("navigation", { name: "Sommaire" });
  await expect(sommaire.getByRole("link", { name: /Le parcours/ })).toBeVisible();
  await expect(sommaire.getByRole("link", { name: /Les conditions/ })).toBeVisible();

  // Le parcours en huit étapes est décrit.
  await expect(page.getByRole("heading", { name: "Réception", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Validation client", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Restitution", exact: true })).toBeVisible();

  // La feuille de contrôle reprend les points réels du produit.
  const controle = page.locator("#controle").locator("..");
  await expect(controle).toContainText("Plaquettes avant");
  await expect(controle).toContainText("Essuie-glaces");

  // Les formules sont présentées dans un tableau de tarifs.
  const tarifs = page.getByRole("table", { name: "Tarifs GarageFlow" });
  await expect(tarifs).toContainText("Atelier");
  await expect(tarifs).toContainText("Réseau");
  await expect(tarifs).toContainText("59 €");
  await expect(tarifs).toContainText("129 €");

  // Les questions sont lisibles directement, sans dépliage.
  await expect(page.getByRole("heading", { name: "Mes clients doivent-ils créer un compte ?" })).toBeVisible();
  await expect(page.getByText(/Ils reçoivent un lien personnel/)).toBeVisible();
});

test("les appels à l'action mènent à la création de garage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Ouvrir un dossier d'essai" }).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByRole("heading", { name: "Créer votre garage" })).toBeVisible();
});

test("les pages légales sont accessibles depuis le pied de page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Conditions d'utilisation" }).click();
  await expect(page).toHaveURL(/\/cgu/);
  await expect(page.getByRole("heading", { name: "Conditions générales d'utilisation" })).toBeVisible();
  await expect(page.getByText(/essai gratuite de 14 jours/)).toBeVisible();

  await page.goto("/confidentialite");
  await expect(page.getByRole("heading", { name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByText(/responsable de traitement/).first()).toBeVisible();
});
