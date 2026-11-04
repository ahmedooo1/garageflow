import type { PlateProvider } from "../provider";
import { PlateProviderError } from "../provider";

/**
 * Fournisseur de démonstration : données fictives, aucun appel réseau.
 * Refusé en production (voir `plateLookupConfig`). Les réponses imitent la
 * forme d'une API réelle, y compris des champs sur le titulaire, pour montrer
 * qu'ils ne franchissent jamais l'adaptateur.
 *
 *   AB-123-CD  Peugeot 308 complète
 *   EF-456-GH  Renault Clio incomplète (ni puissance, ni VIN, ni boîte)
 *   EE-111-EE  service indisponible
 *   autre      immatriculation inconnue
 */
const RESPONSES: Record<string, Record<string, unknown>> = {
  AB123CD: {
    marque: "PEUGEOT",
    modele: "308",
    version: "1.5 BlueHDi 130 S&S Allure",
    vin: "VF3LBYHZPMS000001",
    date1erCir: "12/03/2021",
    energie: "GO",
    moteur: "1.5 BlueHDi 130",
    puissanceKw: 96,
    puissanceFiscale: "7",
    boiteVitesse: "M",
    titulaire: { nom: "DUPONT", prenom: "Jeanne", adresse: "1 rue Exemple 76000 Rouen" },
  },
  EF456GH: {
    marque: "RENAULT",
    modele: "Clio",
    date1erCir: "2016-07-01",
    energie: "ESSENCE",
    proprietaire: "M. EXEMPLE",
  },
};

export const demoProvider: PlateProvider = {
  id: "demo",
  label: "Démonstration (données fictives)",
  billsNotFound: false,
  cacheAllowed: true,
  async lookup(plate) {
    if (plate.normalized === "EE111EE") throw new PlateProviderError("unavailable", false, "démonstration");
    const r = RESPONSES[plate.normalized];
    if (!r) return { found: false };
    // Correspondance champ à champ : seuls les champs techniques sont recopiés.
    return {
      found: true,
      raw: {
        make: r.marque,
        model: r.modele,
        version: r.version,
        vin: r.vin,
        firstRegistrationDate: r.date1erCir,
        fuel: r.energie,
        engine: r.moteur,
        powerKw: r.puissanceKw,
        fiscalPower: r.puissanceFiscale,
        gearbox: r.boiteVitesse,
      },
    };
  },
};
