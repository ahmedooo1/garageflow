/**
 * Regenere les copies d'ecran du produit utilisees sur la page d'accueil.
 * Ni maquettes ni images d'ambiance : les vrais ecrans, pris sur l'instance
 * locale peuplee par `npm run db:seed`.
 *
 * A relancer des qu'un de ces ecrans change, sinon les legendes
 * « copie d'ecran de l'application » deviennent fausses.
 *
 * Prerequis : `npm run dev` et `npm run db:seed`.
 * Usage     : npm run capture:apercu
 */
import { chromium } from "@playwright/test";
import { exigerEnvironnementLocal } from "./garde-environnement.mjs";

// Volontairement recopies, et non importes de prisma/seed.ts : ce module lance
// le seed au chargement, ce qui reinitialiserait la base a chaque capture.
// Ils doivent rester alignes sur DEMO_OWNER_EMAIL / DEMO_PASSWORD du seed.
const EMAIL = process.env.DEMO_EMAIL ?? "philippe@normandie-auto.fr";
const MOT_DE_PASSE = process.env.DEMO_PASSWORD ?? "Demo1234!Garage";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DOSSIER_DEMO = "GH-123-KL"; // Peugeot 308 : le seul dossier complet du jeu de demonstration.
const DIR = "src/app/(marketing)";

// Ce script se connecte avec le compte de démonstration, dont le mot de passe
// est public : le pointer vers autre chose qu'une instance locale n'a pas de sens.
exigerEnvironnementLocal({ tache: "capture des aperçus", urlBase: BASE });

const navigateur = await chromium.launch();

/** Rogne une capture au bas de l'element le plus bas, plus une marge. */
async function basDe(page, selecteur, marge = 40) {
  return page.evaluate(
    ([s, m]) => {
      const n = [...document.querySelectorAll(s)];
      if (n.length === 0) return null;
      return Math.max(...n.map((x) => x.getBoundingClientRect().bottom)) + m;
    },
    [selecteur, marge],
  );
}

async function ecrire(page, fichier, zone, hauteur) {
  const h = Math.min(Math.round(hauteur), Math.round(zone.height));
  await page.screenshot({ path: `${DIR}/${fichier}`, clip: { x: zone.x, y: zone.y, width: zone.width, height: h } });
  console.log(`  ${fichier}  ${Math.round(zone.width)} x ${h} px CSS`);
}

/* -- Ecrans de l'atelier, sur poste fixe ---------------------------------- */

const bureau = await navigateur.newContext({
  viewport: { width: 1440, height: 1200 },
  deviceScaleFactor: 2,
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
});
const page = await bureau.newPage();

await page.goto(`${BASE}/login`);
await page.getByLabel(/e-?mail/i).fill(EMAIL);
await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE);
await page.getByRole("button", { name: /connexion|se connecter/i }).click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

// 1. Le tableau d'atelier. Les couloirs s'etirent sur toute la hauteur de la
// fenetre : on coupe sous la carte la plus basse pour eviter un grand vide.
await page.goto(`${BASE}/app/atelier`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(800); // laisse les polices se poser
{
  const zone = await page.locator("main").first().boundingBox();
  const bas = await basDe(page, '[data-testid="work-order-card"]', 64);
  await ecrire(page, "apercu-atelier.png", zone, bas - zone.y);
}

// 2. La liste des dossiers : chaque ligne porte son statut courant. C'est la
// meilleure preuve que l'echelle des statuts existe vraiment.
await page.goto(`${BASE}/app/dossiers`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
{
  const zone = await page.locator("main").first().boundingBox();
  const bas = await basDe(page, "main table, main tbody tr", 32);
  await ecrire(page, "apercu-statuts.png", zone, (bas ?? 700) - zone.y);
}

const lien = await page.locator('a[href^="/app/dossiers/"]').filter({ hasText: DOSSIER_DEMO }).first().getAttribute("href");
if (!lien) throw new Error(`dossier ${DOSSIER_DEMO} introuvable : lancer d'abord npm run db:seed`);
const dossier = `${BASE}${lien.split("?")[0]}`;

// 2. La fiche dossier, avec le cadre complet de l'application. C'est le visuel
// d'ouverture : il doit montrer le produit entier, navigation comprise.
await page.goto(`${dossier}?tab=overview`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
{
  const bas = await basDe(page, "main section, main article, main > div > div", 32);
  await ecrire(page, "apercu-dossier.png", { x: 0, y: 0, width: 1440, height: 1200 }, bas ?? 900);
}

// 3. La feuille de controle remplie : dix-sept points, quatre etats.
await page.goto(`${dossier}?tab=diagnosis`);
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
{
  const haut = await page.evaluate(() => {
    const titres = [...document.querySelectorAll("h2, h3")];
    const t = titres.find((n) => /Contr[oô]le v[ée]hicule/i.test(n.textContent ?? ""));
    return t ? t.getBoundingClientRect().top + window.scrollY - 24 : null;
  });
  if (haut !== null) await page.evaluate((y) => window.scrollTo(0, y), haut);
  await page.waitForTimeout(400);
  const zone = await page.locator("main").first().boundingBox();
  await ecrire(page, "apercu-controle.png", { x: zone.x, y: 0, width: zone.width, height: 1200 }, 760);
}

await bureau.close();

/* -- Ecran du client, sur telephone --------------------------------------- */

const mobile = await navigateur.newContext({
  viewport: { width: 390, height: 2000 },
  // Densite 2 et non 3 : l'ecran client est affiche dans une colonne d'environ
  // 330 px, donc 780 px de large suffisent. En densite 3 on transportait
  // 1170 px de large pour rien, sur l'image deja la plus lourde des cinq.
  deviceScaleFactor: 2,
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
  isMobile: true,
  hasTouch: true,
});
const tel = await mobile.newPage();

// Le lien client n'est pas devinable : on le lit dans le dossier, cote atelier.
const url = process.env.LIEN_CLIENT;
if (!url) {
  console.log("  (LIEN_CLIENT absent : ecran client non regenere)");
} else {
  await tel.goto(url);
  await tel.waitForLoadState("networkidle");
  await tel.waitForTimeout(700);
  // On descend jusqu'au bas du recapitulatif des decisions : c'est la reponse
  // du client, et la couper en deux n'aurait aucun sens sur la page d'accueil.
  const finReponse = await tel.evaluate(() => {
    // Exclure les balises non rendues : les donnees de navigation de Next.js
    // contiennent le mot « accepte » et faussent la mesure.
    const cible = [...document.querySelectorAll("body p, body h1, body h2, body h3, body li, body span, body div")]
      .filter((n) => n.children.length === 0 && /Montant accept[ée]/i.test(n.textContent ?? ""))
      .map((n) => n.getBoundingClientRect().bottom)
      .filter((y) => y > 0)
      .pop();
    return cible ? Math.ceil(cible + 28) : null;
  });
  const hauteur = Math.min(finReponse ?? 1100, 2000);
  await tel.screenshot({ path: `${DIR}/apercu-client.png`, clip: { x: 0, y: 0, width: 390, height: hauteur } });
  console.log(`  apercu-client.png  390 x ${hauteur} px CSS`);
}

await mobile.close();
await navigateur.close();
