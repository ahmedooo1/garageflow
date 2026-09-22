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

test("l'action principale porte le même libellé partout et mène à l'inscription", async ({ page }) => {
  await page.goto("/");

  // Un seul libellé d'action principale sur toute la page.
  const principal = page.getByRole("link", { name: "Essayer 14 jours gratuitement" });
  expect(await principal.count()).toBeGreaterThanOrEqual(3);
  for (const lien of await principal.all()) {
    await expect(lien).toHaveAttribute("href", "/register");
  }

  // L'action secondaire reste une exploration, pas une inscription.
  await expect(page.getByRole("link", { name: /Voir le parcours complet/ })).toHaveAttribute("href", "#parcours");

  await principal.nth(1).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByRole("heading", { name: "Créer votre garage" })).toBeVisible();
});

test("le tableau de tarifs reste lisible sur mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tarifs = page.getByRole("table", { name: "Tarifs GarageFlow" });
  await tarifs.scrollIntoViewIfNeeded();

  // Chaque ligne reste associée à ses intitulés, empilée plutôt que compressée.
  const ligneAtelier = tarifs.getByRole("row").filter({ hasText: "Atelier" });
  await expect(ligneAtelier).toContainText("59 €");
  await expect(ligneAtelier).toContainText("Engagement");

  // Aucun débordement horizontal de la page.
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(debordement).toBe(0);
});

test("les copies d'écran du produit sont réellement chargées", async ({ page }) => {
  await page.goto("/");

  // Elles sont en chargement différé : sans parcourir la page, on testerait
  // des images simplement pas encore demandées.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  const captures = page.getByRole("img", { name: /GarageFlow|dossiers d'intervention|Feuille de contrôle|Écran de validation/ });
  const total = await captures.count();
  expect(total, "les cinq aperçus produit doivent être présents").toBe(5);

  // Une image cassée resterait invisible dans les autres assertions, qui ne
  // portent que sur du texte : on vérifie le décodage, pas la seule présence.
  for (const capture of await captures.all()) {
    const etat = await capture.evaluate((n: HTMLImageElement) => ({ ok: n.complete && n.naturalWidth > 0, alt: n.alt.slice(0, 40) }));
    expect(etat.ok, `image non chargée : ${etat.alt}`).toBe(true);
  }

  // Les légendes ne doivent pas promettre plus que ce que les images montrent.
  await expect(page.locator("#dossier").locator("..")).toContainText("Copie d'écran de l'application");
});

test("la décision affichée correspond à celle du jeu de démonstration", async ({ page }) => {
  // La page reproduit une décision client réelle. Si le seed change, la
  // reproduction ment : ce test rend l'écart visible au lieu de le laisser passer.
  await page.goto("/");
  const chapitre = page.locator("#validation").locator("..");
  await expect(chapitre).toContainText("285,00 € TTC");
  await expect(chapitre).toContainText("Remplacement plaquettes de frein avant");
  await expect(chapitre).toContainText("Balais d'essuie-glace avant");
  await expect(chapitre).toContainText("Les essuie-glaces, je les ferai moi-même.");
});

test("aucun cadratin dans le texte affiché", async ({ page }) => {
  // Règle de rédaction du projet : trait d'union simple, jamais de tiret long.
  for (const url of ["/", "/cgu", "/confidentialite"]) {
    await page.goto(url);
    const texte = await page.evaluate(() => document.body.innerText);
    expect(texte, `cadratin trouvé sur ${url}`).not.toContain("—");
  }
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
