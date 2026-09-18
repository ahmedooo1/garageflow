import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * Scénario de bout en bout : création du garage → Jean Martin → Peugeot 308 →
 * réception → photos → diagnostic → plaquettes 175 € / vidange 110 € → lien →
 * client accepte plaquettes, refuse vidange → réparation → prêt → restitution →
 * clôture → historique.
 */

const suffix = randomUUID().slice(0, 8);
const OWNER_EMAIL = `e2e-${suffix}@garageflow.test`;
const PASSWORD = "E2E-Password-2026!";
const PLATE = `E2${suffix.slice(0, 5).toUpperCase()}`;

async function jpeg(label: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#2b3542"/><text x="400" y="320" font-size="64" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

/** Change d'onglet et attend que la navigation soit effective (évite de remplir l'ancien formulaire). */
async function goTab(page: Page, key: string) {
  await page.getByTestId(`tab-${key}`).click();
  await expect(page).toHaveURL(new RegExp(`tab=${key}`));
  await expect(page.getByTestId(`tab-${key}`)).toHaveAttribute("aria-current", "page");
}

async function addLine(page: Page, title: string, parts: string, labor: string) {
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Pièces HT (€)").fill(parts);
  await page.getByLabel("Main-d'œuvre HT (€)").fill(labor);
  await page.getByTestId("add-line").click();
  await expect(page.getByTestId("estimate-lines")).toContainText(title);
}

test("parcours complet garage → client → restitution → historique", async ({ page, context }) => {
  // 1. Créer le garage
  await page.goto("/register");
  await page.getByLabel("Nom du garage").fill("Garage E2E Normandie");
  await page.getByLabel("Prénom").fill("Philippe");
  await page.locator("#lastName").fill("Lemaire");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le garage" }).click();
  await expect(page).toHaveURL(/\/app\/atelier/);
  await expect(page.getByRole("heading", { name: "Atelier" })).toBeVisible();

  // 2. Créer Jean Martin
  await page.goto("/app/clients/new");
  await page.getByLabel("Prénom").fill("Jean");
  await page.locator("#lastName").fill("Martin");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByRole("heading", { name: "Jean Martin" })).toBeVisible();
  const customerId = page.url().split("/clients/")[1];

  // 3. Créer la Peugeot 308
  await page.goto(`/app/vehicules/new?customerId=${customerId}`);
  await page.getByLabel("Immatriculation").fill(PLATE);
  await page.getByLabel("Marque").fill("Peugeot");
  await page.getByLabel("Modèle").fill("308");
  await page.getByLabel("Année").fill("2019");
  await page.getByLabel("Kilométrage").fill("87400");
  await page.getByRole("button", { name: "Créer le véhicule" }).click();
  await expect(page.getByRole("heading", { name: /Peugeot 308/ })).toBeVisible();
  const vehicleId = page.url().split("/vehicules/")[1];

  // 4. Réceptionner le véhicule
  await page.goto(`/app/dossiers/new?customerId=${customerId}&vehicleId=${vehicleId}`);
  await expect(page.getByLabel("Kilométrage à l'entrée")).toHaveValue("87400");
  await page.getByLabel("Kilométrage à l'entrée").fill("87650");
  await page.getByLabel("Raison de la visite").fill("Bruit au freinage + révision");
  await page.getByLabel("Symptômes décrits par le client").fill("Grincement au freinage à froid");
  await page.getByRole("button", { name: /Réceptionner le véhicule/ }).click();
  await expect(page).toHaveURL(/\/app\/dossiers\/[a-z0-9]+\?tab=photos/);
  await expect(page.getByText("Réceptionné", { exact: true })).toBeVisible();
  const workOrderUrl = page.url().split("?")[0];

  // 5. Ajouter des photos
  await page.getByTestId("photo-input-main").setInputFiles([
    { name: "avant.jpg", mimeType: "image/jpeg", buffer: await jpeg("AVANT") },
    { name: "arriere.jpg", mimeType: "image/jpeg", buffer: await jpeg("ARRIERE") },
  ]);
  await expect(page.getByTestId("photo-gallery").locator("li")).toHaveCount(2);

  // 6. Diagnostic
  await page.getByRole("button", { name: "Commencer le diagnostic" }).click();
  await expect(page.getByText("Diagnostic en cours", { exact: true })).toBeVisible();
  await goTab(page, "diagnosis");
  await page.getByLabel("Titre").fill("Plaquettes avant usées");
  await page.getByLabel("Description").fill("Épaisseur 2 mm");
  await page.getByLabel("Urgence").selectOption("URGENT");
  await page.getByRole("button", { name: "Ajouter le constat" }).click();
  await expect(page.getByTestId("findings-list")).toContainText("Plaquettes avant usées");
  await page.getByTestId("check-BRAKE_PADS_FRONT-URGENT").click();
  await expect(page.getByTestId("check-BRAKE_PADS_FRONT-URGENT")).toHaveAttribute("aria-pressed", "true");

  // 7-8. Proposer plaquettes 175 € et vidange 110 €
  await goTab(page, "estimate");
  await addLine(page, "Remplacement plaquettes avant", "62,50", "83,33");
  await addLine(page, "Vidange huile + filtre", "48", "43,67");
  await expect(page.getByTestId("estimate-lines")).toContainText("175,00");
  await expect(page.getByTestId("estimate-lines")).toContainText("110,00");
  await expect(page.getByTestId("estimate-lines")).toContainText("285,00");

  // 9. Envoyer le lien
  await page.getByTestId("send-estimate").click();
  const link = await page.getByTestId("approval-link").inputValue();
  expect(link).toMatch(/\/validation\/[A-Za-z0-9_-]{40,}$/);
  await expect(page.getByText("Attente client", { exact: true }).first()).toBeVisible();

  // 10-11. Le client (sans compte, autre contexte) accepte les plaquettes et refuse la vidange
  const customerContext = await context.browser()!.newContext({ locale: "fr-FR" });
  const customerPage = await customerContext.newPage();
  await customerPage.goto(link);
  await expect(customerPage.getByRole("heading", { name: /Bonjour Jean Martin/ })).toBeVisible();
  await expect(customerPage.getByText("Plaquettes avant usées")).toBeVisible();
  const lines = customerPage.getByTestId("portal-lines").locator("li");
  await expect(lines).toHaveCount(2);
  await lines.nth(0).getByRole("button", { name: "Autoriser" }).click();
  await lines.nth(1).getByRole("button", { name: "Refuser" }).click();
  await expect(customerPage.getByTestId("accepted-total")).toContainText("175,00");
  await customerPage.getByLabel("Votre nom (signature)").fill("Jean Martin");
  await customerPage.getByRole("button", { name: "Confirmer ma décision" }).click();
  await expect(customerPage.getByTestId("portal-decided")).toContainText("175,00");
  await expect(customerPage.getByTestId("portal-decided")).toContainText("Remplacement plaquettes avant");
  // Le lien reste en lecture seule : plus de boutons de décision.
  await customerPage.reload();
  await expect(customerPage.getByRole("button", { name: "Autoriser" })).toHaveCount(0);
  await customerContext.close();

  // 12. Le garage voit la décision
  await page.goto(`${workOrderUrl}?tab=estimate`);
  await expect(page.getByTestId("decision-banner")).toContainText("1 accepté, 1 refusé");
  await expect(page.getByTestId("decision-banner")).toContainText("175,00");
  await expect(page.getByText("Partiellement accepté", { exact: true }).first()).toBeVisible();

  // 13. Réparation commence
  await page.getByRole("button", { name: "Commencer la réparation" }).click();
  await expect(page.getByText("En réparation", { exact: true }).first()).toBeVisible();
  await goTab(page, "estimate");
  await page.getByRole("button", { name: "Réalisé" }).click();
  await expect(page.getByTestId("estimate-lines")).toContainText("Réalisé");

  // 14. Réparation terminée → contrôle final
  await page.getByRole("button", { name: /Réparation terminée/ }).click();
  await expect(page.getByText("Contrôle final", { exact: true }).first()).toBeVisible();
  await goTab(page, "delivery");
  for (const key of ["roadTest", "fluids", "warningLights", "toolsRemoved", "cleaned"]) await page.getByTestId(`final-${key}`).check();
  await page.getByTestId("save-final-check").click();
  await expect(page.getByText("Contrôle final enregistré.")).toBeVisible();

  // 15. Véhicule prêt
  await page.getByRole("button", { name: "Marquer véhicule prêt" }).first().click();
  await expect(page.getByText("Véhicule prêt", { exact: true }).first()).toBeVisible();

  // 16. Restitution
  await goTab(page, "delivery");
  await expect(page.getByTestId("works-done")).toContainText("Remplacement plaquettes avant");
  await expect(page.getByTestId("works-refused")).toContainText("Vidange huile + filtre");
  await expect(page.getByTestId("final-amount")).toContainText("175,00");
  await page.getByLabel("Kilométrage à la sortie").fill("87662");
  await page.getByTestId("deliver").click();
  await expect(page.getByText("Restitué", { exact: true }).first()).toBeVisible();

  // 17. Clôture
  await page.getByRole("button", { name: "Clôturer le dossier" }).click();
  await expect(page.getByText("Clôturé", { exact: true }).first()).toBeVisible();
  await goTab(page, "timeline");
  const timeline = page.getByTestId("timeline");
  await expect(timeline).toContainText("Véhicule réceptionné");
  await expect(timeline).toContainText("Validation envoyée au client");
  await expect(timeline).toContainText("Décision du client");
  await expect(timeline).toContainText("Véhicule restitué");
  await expect(timeline).toContainText("Dossier clôturé");

  // 18. Historique visible sur le véhicule et le client
  await page.goto(`/app/vehicules/${vehicleId}`);
  const history = page.getByTestId("vehicle-history");
  await expect(history).toContainText("Bruit au freinage + révision");
  await expect(history).toContainText("Clôturé");
  await expect(history).toContainText("Remplacement plaquettes avant");
  await expect(history).toContainText("Vidange huile + filtre");
  await expect(history).toContainText("Montant accepté : 175,00");
  await expect(page.getByText("87 662 km")).toBeVisible();
  await page.goto(`/app/clients/${customerId}`);
  await expect(page.getByText("Historique des interventions (1)")).toBeVisible();
  await expect(page.getByText("Clôturé", { exact: true })).toBeVisible();
});

test("un garage ne voit pas les dossiers d'un autre garage (isolation)", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Nom du garage").fill("Garage Isolé");
  await page.getByLabel("Prénom").fill("Autre");
  await page.locator("#lastName").fill("Gérant");
  await page.getByLabel("Email").fill(`iso-${suffix}@garageflow.test`);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Créer le garage" }).click();
  await expect(page).toHaveURL(/\/app\/atelier/);
  await expect(page.getByTestId("work-order-card")).toHaveCount(0);
  await page.goto(`/app/vehicules?q=${PLATE}`);
  await expect(page.getByText("Aucun véhicule")).toBeVisible();
  await page.goto("/app/clients?q=Martin");
  await expect(page.getByText("Aucun client")).toBeVisible();
});

test("les pages protégées redirigent vers la connexion", async ({ page }) => {
  await page.goto("/app/atelier");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/validation/jeton-invalide-0123456789012345678901234567890");
  await expect(page.getByText("Lien invalide ou expiré")).toBeVisible();
});
