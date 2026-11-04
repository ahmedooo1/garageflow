import { describe, expect, it } from "vitest";
import { kwToHp, parseFrenchPlate, technicalCoverage } from "@/lib/plate";
import { plateLookupConfig } from "@/server/plate-lookup/config";
import { fetchProviderJson, PlateProviderError } from "@/server/plate-lookup/provider";
import { mapFuel, sanitizeTechnical } from "@/server/plate-lookup/sanitize";

describe("immatriculation française", () => {
  it("normalise le format SIV, quelle que soit la saisie", () => {
    for (const raw of ["ab-123-cd", "AB 123 CD", " ab123cd ", "AB–123–CD"]) {
      expect(parseFrenchPlate(raw), raw).toEqual({ normalized: "AB123CD", display: "AB-123-CD", format: "SIV" });
    }
  });

  it("refuse ce que le SIV n'attribue jamais", () => {
    for (const raw of ["AI-123-CD", "AB-123-CO", "UB-123-CD", "AB-000-CD", "SS-123-CD", "AB-123-SS", "AB-12-CD", "AB-1234-CD", "", "X".repeat(30), "DE-AB-1234"]) {
      expect(parseFrenchPlate(raw), raw).toBeNull();
    }
  });

  it("accepte l'ancien format FNI, Corse et outre-mer compris", () => {
    expect(parseFrenchPlate("123 ABC 75")).toEqual({ normalized: "123ABC75", display: "123 ABC 75", format: "FNI" });
    expect(parseFrenchPlate("1234-AB-2A")?.display).toBe("1234 AB 2A");
    expect(parseFrenchPlate("45 A 971")?.format).toBe("FNI");
    expect(parseFrenchPlate("0 AB 75")).toBeNull();
    expect(parseFrenchPlate("123 ABC 977")).toBeNull();
  });
});

describe("liste blanche des caractéristiques", () => {
  const now = new Date("2026-11-04T12:00:00Z");

  it("ne garde que les champs techniques : l'identité et l'adresse du titulaire sont ignorées", () => {
    const raw = {
      make: "PEUGEOT",
      model: "308",
      titulaire: { nom: "DUPONT", adresse: "1 rue Exemple" },
      nom: "DUPONT",
      adresse: "1 rue Exemple 76000 Rouen",
      dateNaissance: "1970-01-01",
    } as Record<string, unknown>;
    const data = sanitizeTechnical(raw, now);
    expect(Object.keys(data).sort()).toEqual(["engine", "firstRegistrationDate", "fiscalPower", "fuel", "fuelLabel", "gearbox", "make", "model", "powerKw", "version", "vin", "year"]);
    expect(JSON.stringify(data)).not.toMatch(/DUPONT|Exemple|1970/);
  });

  it("valide et normalise chaque valeur", () => {
    const data = sanitizeTechnical(
      {
        make: "RENAULT",
        model: " Clio\u0000 V ",
        vin: "vf1 rja00068000001",
        firstRegistrationDate: "01/07/2016",
        fuel: "Gazole",
        powerHp: "90",
        fiscalPower: "5",
        gearbox: "AUTOMATIQUE",
        displacementCc: 1461,
      },
      now,
    );
    expect(data).toMatchObject({ make: "Renault", model: "Clio V", vin: "VF1RJA00068000001", firstRegistrationDate: "2016-07-01", year: 2016, fuel: "DIESEL", powerKw: 66, fiscalPower: 5, gearbox: "Automatique", engine: "1,5 L" });
  });

  it("écarte les valeurs incohérentes plutôt que de les inventer", () => {
    const data = sanitizeTechnical({ vin: "VF3-TROP-COURT", firstRegistrationDate: "2030-01-01", powerKw: 99999, fiscalPower: -3, modelYear: "1850", fuel: "PLUTONIUM" }, now);
    expect(data).toMatchObject({ vin: "", firstRegistrationDate: null, powerKw: null, fiscalPower: null, year: null, fuel: null, fuelLabel: "PLUTONIUM" });
    expect(sanitizeTechnical({ firstRegistrationDate: "31/02/2020" }, now).firstRegistrationDate).toBeNull();
    expect(technicalCoverage(data).found).toEqual([]);
  });

  it("traduit les codes d'énergie de la carte grise", () => {
    expect([mapFuel("ES"), mapFuel("GO"), mapFuel("EL"), mapFuel("EE"), mapFuel("GL"), mapFuel("GP"), mapFuel("EG"), mapFuel("Électrique"), mapFuel("hybride essence"), mapFuel("")]).toEqual([
      "PETROL", "DIESEL", "ELECTRIC", "HYBRID", "HYBRID", "LPG", "LPG", "ELECTRIC", "HYBRID", null,
    ]);
    expect(kwToHp(96)).toBe(131);
  });
});

describe("configuration", () => {
  it("désactivée par défaut, et pour un fournisseur inconnu", () => {
    expect(plateLookupConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(plateLookupConfig({ PLATE_LOOKUP_PROVIDER: "inconnu" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });
  it("le fournisseur de démonstration est refusé en production", () => {
    expect(plateLookupConfig({ PLATE_LOOKUP_PROVIDER: "demo", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(plateLookupConfig({ PLATE_LOOKUP_PROVIDER: "demo", NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)?.provider.id).toBe("demo");
  });
  it("borne le délai, la durée du cache et le plafond", () => {
    const c = plateLookupConfig({ PLATE_LOOKUP_PROVIDER: "demo", NODE_ENV: "test", PLATE_LOOKUP_TIMEOUT_MS: "999999", PLATE_LOOKUP_CACHE_DAYS: "-4", PLATE_LOOKUP_GLOBAL_MONTHLY_CAP: "abc" } as unknown as NodeJS.ProcessEnv);
    expect(c).toMatchObject({ timeoutMs: 20_000, cacheDays: 0, globalMonthlyCap: 1000 });
  });
});

describe("appel HTTP au fournisseur", () => {
  const signal = () => AbortSignal.timeout(2000);
  const respond = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch;

  it("404 = immatriculation inconnue ; JSON lu sinon", async () => {
    expect(await fetchProviderJson("https://x.test", { signal: signal() }, respond(404, ""))).toEqual({ notFound: true });
    expect(await fetchProviderJson("https://x.test", { signal: signal() }, respond(200, '{"a":1}'))).toEqual({ notFound: false, json: { a: 1 } });
  });

  it("traduit les erreurs en codes, et indique si l'appel a pu être facturé", async () => {
    const code = async (f: typeof fetch) => fetchProviderJson("https://x.test", { signal: signal() }, f).catch((e: PlateProviderError) => [e.code, e.billable]);
    expect(await code(respond(401, ""))).toEqual(["auth", false]);
    expect(await code(respond(429, ""))).toEqual(["provider_rate_limit", false]);
    expect(await code(respond(503, ""))).toEqual(["unavailable", true]);
    expect(await code(respond(200, "pas du json"))).toEqual(["invalid_response", true]);
    expect(await code(respond(200, "x".repeat(300 * 1024)))).toEqual(["invalid_response", true]);
    expect(await code((async () => { throw new TypeError("ECONNREFUSED"); }) as unknown as typeof fetch)).toEqual(["unavailable", false]);
  });

  it("ne suit aucune redirection (la clé ne part vers aucun autre hôte) et respecte le délai", async () => {
    let init: RequestInit | undefined;
    await fetchProviderJson("https://x.test", { signal: signal() }, (async (_u: string, i: RequestInit) => ((init = i), new Response("{}"))) as unknown as typeof fetch);
    expect(init?.redirect).toBe("error");
    const hang = ((_u: string, i: RequestInit) => new Promise((_, reject) => i.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const t0 = Date.now();
    const err = await fetchProviderJson("https://x.test", { signal: AbortSignal.timeout(100) }, hang).catch((e) => e);
    expect(err).toBeInstanceOf(PlateProviderError);
    expect(err.code).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
