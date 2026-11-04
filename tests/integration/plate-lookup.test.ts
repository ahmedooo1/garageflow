import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";

/*
 * Recherche par immatriculation, avec la vraie base et un fournisseur HTTP
 * simulé dont la réponse contient aussi l'identité et l'adresse du titulaire,
 * comme le ferait une API trop bavarde.
 */
const session = vi.hoisted(() => ({ current: null as null | { user: SessionUser } }));
vi.mock("@/server/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.20" }) }));

const { prisma } = await import("@/server/db");
const { resetRateLimits } = await import("@/server/lib/rate-limit");
const { fetchProviderJson } = await import("@/server/plate-lookup/provider");
const { lookupPlate, plateHash } = await import("@/server/plate-lookup/service");
const { createVehicle, updateVehicle } = await import("@/server/services/vehicles");
const { createCustomer } = await import("@/server/services/customers");
const actions = await import("@/server/actions/vehicles");
const { cleanupGarage, createTestGarage } = await import("./helpers");
type PlateProvider = import("@/server/plate-lookup/provider").PlateProvider;
type PlateLookupConfig = import("@/server/plate-lookup/config").PlateLookupConfig;

type G = Awaited<ReturnType<typeof createTestGarage>>;
let A: G;
let B: G;
const OWNER_NAME = "TITULAIRE-SECRET";
const OWNER_ADDRESS = "12 rue Confidentielle";

/** Forme d'une API réelle : champs techniques et données du titulaire mélangés. */
function apiBody(plate: string) {
  return {
    immat: plate,
    marque: "PEUGEOT",
    modele: "308",
    version: "1.5 BlueHDi 130 Allure",
    vin: "VF3LBYHZPMS000001",
    date1erCir: "2021-03-12",
    energie: "GO",
    puissanceKw: "96",
    puissFisc: 7,
    boite: "M",
    titulaire: { nom: OWNER_NAME, prenom: "Jeanne", adresse: OWNER_ADDRESS, dateNaissance: "1970-01-01" },
    proprietaire_adresse: OWNER_ADDRESS,
  };
}

const calls: { url: string; init: RequestInit }[] = [];
let behaviour: "ok" | "not_found" | "down" | "hang" = "ok";
const fakeFetch = (async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  if (behaviour === "hang") return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  if (behaviour === "down") return new Response("erreur", { status: 503 });
  if (behaviour === "not_found") return new Response("", { status: 404 });
  const plate = decodeURIComponent(url.split("/").pop() ?? "");
  return new Response(JSON.stringify(apiBody(plate)), { status: 200, headers: { "content-type": "application/json" } });
}) as unknown as typeof fetch;

/** Adaptateur d'exemple : seuls les champs techniques sont recopiés. */
const testProvider: PlateProvider = {
  id: "test-api",
  label: "API de test",
  billsNotFound: true,
  cacheAllowed: true,
  async lookup(plate, { apiKey, signal, fetchImpl }) {
    const res = await fetchProviderJson(`https://api.example.test/v1/plaque/${encodeURIComponent(plate.normalized)}`, { signal, headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }, fetchImpl);
    if (res.notFound) return { found: false };
    const j = res.json as Record<string, unknown>;
    return { found: true, raw: { make: j.marque, model: j.modele, version: j.version, vin: j.vin, firstRegistrationDate: j.date1erCir, fuel: j.energie, powerKw: j.puissanceKw, fiscalPower: j.puissFisc, gearbox: j.boite } };
  },
};

const config = (over: Partial<PlateLookupConfig> = {}): PlateLookupConfig => ({ provider: testProvider, apiKey: "cle-secrete-de-test", timeoutMs: 1000, cacheDays: 30, globalMonthlyCap: 1000, ...over });
const opts = (over: Partial<PlateLookupConfig> = {}) => ({ config: config(over), fetchImpl: fakeFetch });

beforeAll(async () => {
  A = await createTestGarage("PlaqueA");
  B = await createTestGarage("PlaqueB");
  // Garages abonnés : quota du plan Atelier (100), sauf mention contraire.
  await prisma.garage.updateMany({ where: { id: { in: [A.garageId, B.garageId] } }, data: { subscriptionStatus: "ACTIVE", plan: "ATELIER", currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000) } });
});

afterAll(async () => {
  for (const g of [A, B]) if (g) await cleanupGarage(g.garageId);
});

beforeEach(async () => {
  resetRateLimits();
  calls.length = 0;
  behaviour = "ok";
  await prisma.plateLookup.deleteMany({ where: { garageId: { in: [A.garageId, B.garageId] } } });
});

describe("recherche par immatriculation", () => {
  it("renvoie les caractéristiques, sans aucune donnée du titulaire, nulle part", async () => {
    const r = await lookupPlate(A.reception, "ab-123-cd", opts());
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.data).toMatchObject({ make: "Peugeot", model: "308", vin: "VF3LBYHZPMS000001", firstRegistrationDate: "2021-03-12", year: 2021, fuel: "DIESEL", powerKw: 96, fiscalPower: 7, gearbox: "Manuelle" });
    expect(r.missing).toEqual(["engine"]);
    expect(r.quota).toEqual({ used: 1, limit: 100 });

    // Requête : la plaque seule ; la clé dans un en-tête, jamais dans l'URL.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.example.test/v1/plaque/AB123CD");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer cle-secrete-de-test");

    const rows = await prisma.plateLookup.findMany({ where: { garageId: A.garageId } });
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain(OWNER_NAME);
    expect(stored).not.toContain(OWNER_ADDRESS);
    expect(stored).not.toContain("AB123CD"); // empreinte seulement
    expect(rows[0].plateHash).toBe(plateHash(A.garageId, "AB123CD"));
    expect(JSON.stringify(r)).not.toContain(OWNER_NAME);
  });

  it("sert le résultat depuis le cache du garage, sans nouvel appel ni décompte", async () => {
    await lookupPlate(A.reception, "AB-123-CD", opts());
    const again = await lookupPlate(A.owner, "AB 123 CD", opts());
    expect(again).toMatchObject({ status: "found", fromCache: true, quota: { used: 1 } });
    expect(calls).toHaveLength(1);
    // Cache désactivé : nouvel appel.
    await lookupPlate(A.owner, "AB-123-CD", opts({ cacheDays: 0 }));
    expect(calls).toHaveLength(2);
  });

  it("aucun partage entre garages : ni cache commun, ni empreinte commune", async () => {
    await lookupPlate(A.reception, "AB-123-CD", opts());
    const b = await lookupPlate(B.reception, "AB-123-CD", opts());
    expect(b).toMatchObject({ status: "found", fromCache: false });
    expect(calls).toHaveLength(2);
    expect(plateHash(A.garageId, "AB123CD")).not.toBe(plateHash(B.garageId, "AB123CD"));
  });

  it("deux recherches simultanées de la même plaque : un seul appel", async () => {
    const [x, y] = await Promise.all([lookupPlate(A.reception, "AB-123-CD", opts({ cacheDays: 0 })), lookupPlate(A.owner, "AB-123-CD", opts({ cacheDays: 0 }))]);
    expect(x).toEqual(y);
    expect(calls).toHaveLength(1);
  });

  it("immatriculation inconnue : réponse claire, décomptée si le fournisseur la facture", async () => {
    behaviour = "not_found";
    const r = await lookupPlate(A.reception, "EF-456-GH", opts());
    expect(r).toMatchObject({ status: "not_found", plate: "EF-456-GH", quota: { used: 1 } });
    const r2 = await lookupPlate(A.reception, "GH-456-EF", opts({ provider: { ...testProvider, billsNotFound: false } }));
    expect(r2).toMatchObject({ status: "not_found", quota: { used: 1 } });
  });

  it("véhicule déjà enregistré : aucun appel, lien vers la fiche", async () => {
    const c = await createCustomer(A.reception, { firstName: "Déjà", lastName: "Connu", phone: "0600000000", email: "", address: "", notes: "" });
    const v = await createVehicle(A.reception, { customerId: c.id, plate: "KL-789-MN", make: "Fiat", model: "500", fuel: "PETROL", mileage: 1 });
    expect(await lookupPlate(A.reception, "kl789mn", opts())).toEqual({ status: "exists", plate: "KL-789-MN", vehicleId: v.id });
    expect(calls).toHaveLength(0);
  });

  it("format non reconnu, recherche désactivée, technicien : refus explicites, aucun appel", async () => {
    await expect(lookupPlate(A.reception, "AB-12-CD", opts())).rejects.toThrow(/non reconnue.*manuellement/);
    await expect(lookupPlate(A.reception, "AB-123-CD", { config: null, fetchImpl: fakeFetch })).rejects.toMatchObject({ code: "PLATE_LOOKUP_DISABLED" });
    await expect(lookupPlate(A.technician, "AB-123-CD", opts())).rejects.toThrow();
    expect(calls).toHaveLength(0);
    expect(await prisma.plateLookup.count({ where: { garageId: A.garageId } })).toBe(0);
  });

  it("fournisseur indisponible ou trop lent : message clair, saisie manuelle proposée, erreur journalisée", async () => {
    behaviour = "down";
    await expect(lookupPlate(A.reception, "AB-123-CD", opts())).rejects.toThrow(/indisponible.*Saisissez les informations manuellement/);
    behaviour = "hang";
    const t0 = Date.now();
    await expect(lookupPlate(A.reception, "CD-123-AB", opts({ timeoutMs: 1000 }))).rejects.toThrow(/n'a pas répondu à temps/);
    expect(Date.now() - t0).toBeLessThan(5000);
    const errors = await prisma.plateLookup.findMany({ where: { garageId: A.garageId, status: "ERROR" }, orderBy: { createdAt: "asc" } });
    expect(errors.map((e) => [e.errorCode, e.billable])).toEqual([["unavailable", true], ["timeout", true]]);
  });

  it("quota mensuel du garage : essai limité à 20, au-delà aucun appel", async () => {
    await prisma.garage.update({ where: { id: B.garageId }, data: { subscriptionStatus: "TRIALING", trialEndsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000) } });
    await prisma.plateLookup.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ garageId: B.garageId, userId: B.owner.userId, plateHash: `h${i}`, provider: "test-api", status: "FOUND" as const })) });
    await expect(lookupPlate(B.reception, "AB-123-CD", opts())).rejects.toMatchObject({ code: "PLATE_LOOKUP_QUOTA", message: expect.stringMatching(/Quota mensuel de recherches atteint \(20\)/) });
    expect(calls).toHaveLength(0);
    // Les recherches du mois précédent ne comptent pas.
    await prisma.plateLookup.updateMany({ where: { garageId: B.garageId }, data: { createdAt: new Date(Date.UTC(2020, 0, 15)) } });
    expect((await lookupPlate(B.reception, "AB-123-CD", opts())).status).toBe("found");
    await prisma.garage.update({ where: { id: B.garageId }, data: { subscriptionStatus: "ACTIVE" } });
  });

  it("plafond mensuel de la plateforme : la recherche est suspendue pour tous", async () => {
    await expect(lookupPlate(A.reception, "AB-123-CD", opts({ globalMonthlyCap: 0 }))).rejects.toMatchObject({ code: "PLATE_LOOKUP_CAP" });
    expect(calls).toHaveLength(0);
  });

  it("limite de débit par utilisateur", async () => {
    for (let i = 0; i < 20; i++) await lookupPlate(A.reception, "AB-123-CD", opts());
    await expect(lookupPlate(A.reception, "AB-123-CD", opts())).rejects.toThrow(/Trop de/i);
  });
});

describe("confirmation avant enregistrement", () => {
  async function customer(g: G) {
    return createCustomer(g.reception, { firstName: "Client", lastName: "Plaque", phone: "0600000000", email: "", address: "", notes: "" });
  }

  it("la source n'est retenue que pour une recherche de ce garage et de cette immatriculation", async () => {
    const r = await lookupPlate(A.reception, "PQ-321-RS", opts());
    if (r.status !== "found") throw new Error("attendu : found");
    const c = await customer(A);
    const base = { customerId: c.id, make: r.data.make, model: r.data.model, fuel: "DIESEL" as const, mileage: 1000, powerKw: "96", firstRegistrationDate: "2021-03-12", plateLookupId: r.lookupId };

    const ok = await createVehicle(A.reception, { ...base, plate: "PQ-321-RS" });
    expect(ok.technicalSource).toBe("Recherche par immatriculation (test-api)");
    expect(ok.powerKw).toBe(96);
    expect(ok.firstRegistrationDate?.toISOString().slice(0, 10)).toBe("2021-03-12");

    // Même identifiant, autre plaque : saisie manuelle.
    const other = await createVehicle(A.reception, { ...base, plate: "TU-654-VW" });
    expect(other.technicalSource).toBe("Saisie manuelle");
    // Identifiant d'un autre garage : saisie manuelle.
    const cb = await customer(B);
    const foreign = await createVehicle(B.reception, { ...base, customerId: cb.id, plate: "PQ-321-RS" });
    expect(foreign.technicalSource).toBe("Saisie manuelle");

    // Modification des caractéristiques : elles deviennent une saisie manuelle.
    const edited = await updateVehicle(A.reception, ok.id, { ...base, plate: "PQ-321-RS", powerKw: "110" });
    expect(edited.technicalSource).toBe("Saisie manuelle");
  });

  it("la saisie manuelle reste complète sans aucune recherche", async () => {
    const c = await customer(A);
    const v = await createVehicle(A.reception, { customerId: c.id, plate: "XY-987-ZA", make: "Dacia", model: "Sandero", fuel: "LPG", mileage: 5, version: "TCe 100 ECO-G", gearbox: "Manuelle", fiscalPower: "5" });
    expect(v).toMatchObject({ technicalSource: "Saisie manuelle", version: "TCe 100 ECO-G", fiscalPower: 5 });
    await expect(createVehicle(A.reception, { customerId: c.id, plate: "XY-987-ZB", make: "Dacia", model: "Sandero", firstRegistrationDate: "2099-01-01" })).rejects.toThrow();
  });
});

describe("action serveur", () => {
  it("fournisseur de démonstration : données fictives, champs du titulaire écartés", async () => {
    process.env.PLATE_LOOKUP_PROVIDER = "demo";
    try {
      session.current = { user: { id: A.reception.userId, garageId: A.garageId, email: "r@test.local", firstName: "R", lastName: "A", role: "RECEPTION", platformAdmin: false, garageName: "A" } as SessionUser };
      const res = await actions.lookupPlateAction("AB-123-CD");
      expect(res.ok).toBe(true);
      expect(res.data).toMatchObject({ status: "found", source: "Démonstration (données fictives)", data: { make: "Peugeot", powerKw: 96 } });
      expect(JSON.stringify(res)).not.toMatch(/DUPONT|Exemple/);
      const partial = await actions.lookupPlateAction("EF-456-GH");
      expect(partial.data).toMatchObject({ status: "found", missing: expect.arrayContaining(["powerKw", "vin", "gearbox"]) });
      expect(JSON.stringify(partial)).not.toContain("EXEMPLE");
      const down = await actions.lookupPlateAction("EE-111-EE");
      expect(down).toMatchObject({ ok: false, error: expect.stringMatching(/manuellement/) });
      session.current = null;
      expect((await actions.lookupPlateAction("AB-123-CD")).ok).toBe(false);
    } finally {
      delete process.env.PLATE_LOOKUP_PROVIDER;
      session.current = null;
    }
  });
});
