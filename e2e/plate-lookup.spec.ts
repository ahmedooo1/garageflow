import { expect, test, type Page } from "@playwright/test";

/*
 * Identification par immatriculation, dans le navigateur.
 * - Saisie manuelle : toujours, y compris en CI où la recherche est désactivée.
 * - Recherche, confirmation et cas incomplets : avec le fournisseur de
 *   démonstration (PLATE_LOOKUP_PROVIDER=demo, serveur de développement).
 */
const RUN = Date.now().toString(36);
const demo = process.env.PLATE_LOOKUP_PROVIDER === "demo";

async function garageWithCustomer(page: Page): Promise<string> {
  await page.goto("/register");
  await page.getByLabel("Nom du garage").fill(`Garage Plaque ${RUN}`);
  await page.getByLabel("Prénom").fill("Camille");
  await page.locator("#lastName").fill("Plaque");
  await page.getByLabel("Email").fill(`plaque-${RUN}-${Math.random().toString(36).slice(2, 6)}@plaque-e2e.test`);
  await page.getByLabel("Mot de passe").fill("E2E-Plaque-Password-1!");
  await page.getByRole("button", { name: "Créer le garage" }).click();
  await expect(page).toHaveURL(/\/app\/atelier/);
  await page.goto("/app/clients/new");
  await page.getByLabel("Prénom").fill("Jean");
  await page.locator("#lastName").fill("Immat");
  await page.getByLabel("Téléphone").fill("06 12 34 56 78");
  await page.getByRole("button", { name: "Créer le client" }).click();
  await expect(page.getByRole("heading", { name: "Jean Immat" })).toBeVisible();
  return page.url().split("/").pop() ?? "";
}

test("saisie manuelle complète, caractéristiques techniques comprises", async ({ page }) => {
  const customerId = await garageWithCustomer(page);
  await page.goto(`/app/vehicules/new?customerId=${customerId}`);
  if (!demo) await expect(page.getByRole("button", { name: "Rechercher les caractéristiques" })).toHaveCount(0);
  await page.getByLabel("Immatriculation").fill("GH-321-JK");
  await page.getByLabel("Marque").fill("Dacia");
  await page.getByLabel("Modèle").fill("Sandero");
  await page.getByLabel("Version").fill("TCe 100 ECO-G");
  await page.getByLabel("Mise en circulation").fill("2022-05-10");
  await page.getByLabel("Puissance (kW)").fill("74");
  await page.getByLabel("Puissance fiscale (CV)").fill("5");
  await page.getByRole("button", { name: "Créer le véhicule" }).click();
  await expect(page.getByRole("heading", { name: /Dacia Sandero/ })).toBeVisible();
  await expect(page.getByText("74 kW (101 ch)")).toBeVisible();
  await expect(page.getByText("10/05/2022")).toBeVisible();
  await expect(page.getByText(/Caractéristiques : saisie manuelle/)).toBeVisible();
});

test.describe("avec le fournisseur de démonstration", () => {
  test.skip(!demo, "PLATE_LOOKUP_PROVIDER=demo requis (serveur de développement)");

  test("recherche, vérification, puis enregistrement des données confirmées", async ({ page }) => {
    const customerId = await garageWithCustomer(page);
    await page.goto(`/app/vehicules/new?customerId=${customerId}`);
    await page.getByLabel("Immatriculation").fill("ab 123 cd");
    await page.getByRole("button", { name: "Rechercher les caractéristiques" }).click();
    const panel = page.getByRole("region", { name: "Véhicule identifié" });
    await expect(panel).toContainText("Peugeot 308");
    await expect(panel).toContainText("96 kW (131 ch)");
    await expect(panel).toContainText("12/03/2021");
    await expect(panel).not.toContainText("DUPONT");
    // Rien n'est repris sans confirmation.
    await expect(page.getByLabel("Marque")).toHaveValue("");
    await page.getByRole("button", { name: "Utiliser ces informations" }).click();
    await expect(page.getByLabel("Marque")).toHaveValue("Peugeot");
    await expect(page.getByLabel("Carburant")).toHaveValue("DIESEL");
    // Les champs restent modifiables.
    await page.getByLabel("Kilométrage").fill("45200");
    await page.getByLabel("Couleur").fill("Gris");
    await page.getByRole("button", { name: "Créer le véhicule" }).click();
    await expect(page.getByRole("heading", { name: /Peugeot 308/ })).toBeVisible();
    await expect(page.getByText(/Caractéristiques : Recherche par immatriculation \(Démonstration/)).toBeVisible();
    await expect(page.getByText("VF3LBYHZPMS000001")).toBeVisible();
  });

  test("données incomplètes, plaque inconnue, service indisponible : la saisie manuelle reste possible", async ({ page }) => {
    const customerId = await garageWithCustomer(page);
    await page.goto(`/app/vehicules/new?customerId=${customerId}`);
    const search = page.getByRole("button", { name: "Rechercher les caractéristiques" });

    await page.getByLabel("Immatriculation").fill("EF-456-GH");
    await search.click();
    await expect(page.getByRole("region", { name: "Véhicule identifié" })).toContainText("Non fournis");

    await page.getByLabel("Immatriculation").fill("ZZ-999-ZZ");
    await search.click();
    await expect(page.getByText("Aucune donnée trouvée pour ZZ-999-ZZ. Saisissez les informations manuellement.")).toBeVisible();

    await page.getByLabel("Immatriculation").fill("EE-111-EE");
    await search.click();
    await expect(page.getByText(/indisponible.*Saisissez les informations manuellement/)).toBeVisible();

    await page.getByLabel("Immatriculation").fill("AB-12-CD");
    await search.click();
    await expect(page.getByText(/non reconnue/)).toBeVisible();

    await page.getByLabel("Immatriculation").fill("EE-111-EE");
    await page.getByLabel("Marque").fill("Citroën");
    await page.getByLabel("Modèle").fill("C3");
    await page.getByRole("button", { name: "Créer le véhicule" }).click();
    await expect(page.getByRole("heading", { name: /Citroën C3/ })).toBeVisible();
  });
});
