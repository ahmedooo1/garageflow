import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { runJob, weeklyReportText } from "@/server/growth/jobs";
import { logReply, setLeadStage } from "@/server/growth/leads";
import { growthMetrics } from "@/server/growth/metrics";
import { approveDraft, markDraftSentManually } from "@/server/growth/outreach";
import { createGuardedFetch } from "@/server/growth/website";
import { registerGarage } from "@/server/services/auth";
import { activateManually } from "@/server/services/billing";
import { createCustomer } from "@/server/services/customers";
import { createVehicle } from "@/server/services/vehicles";
import { createWorkOrder } from "@/server/services/workorders";
import { cleanupGarage, createTestGarage, PASSWORD, uniquePlate } from "./helpers";

/**
 * Le parcours complet, de bout en bout, avec le code de production :
 * découverte SIRENE (réponse au format documenté, entreprise fictive) ->
 * vérification du site (vraie pile HTTP locale) -> qualification -> brouillon
 * français -> approbation -> envoi manuel -> réponse -> démo -> inscription
 * attribuée -> activation -> abonnement -> indicateurs et rapport.
 */

const SIRET = "77777777700011";
let site: Server;
let port = 0;
const garages: string[] = [];
const env = { ...process.env };

beforeAll(async () => {
  await prisma.$transaction([prisma.leadActivity.deleteMany(), prisma.outreachDraft.deleteMany(), prisma.lead.deleteMany(), prisma.suppressionEntry.deleteMany(), prisma.growthJobRun.deleteMany(), prisma.growthSettings.deleteMany()]);
  site = createServer((req, res) => {
    if (req.url === "/robots.txt") return res.writeHead(404).end();
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end('<h1>Garage Fictif du Parcours</h1><p>Prenez rendez-vous en ligne</p><a href="mailto:atelier@garage-parcours.example">Écrire</a>');
  });
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
  port = (site.address() as AddressInfo).port;
  Object.assign(process.env, {
    OUTREACH_SENDER_NAME: "Camille Testeur",
    OUTREACH_SENDER_COMPANY: "GarageFlow Test SAS",
    OUTREACH_SENDER_ADDRESS: "1 rue du Test, 76000 Rouen",
    GROWTH_DISCOVERY_ZONES: "elbeuf",
  });
});

afterAll(async () => {
  process.env = env;
  await new Promise<void>((r) => site.close(() => r()));
  await prisma.$transaction([prisma.leadActivity.deleteMany(), prisma.outreachDraft.deleteMany(), prisma.lead.deleteMany(), prisma.growthJobRun.deleteMany()]);
  for (const id of garages) await cleanupGarage(id);
});

const sirenePage = {
  results: [
    {
      siren: SIRET.slice(0, 9),
      nom_complet: "GARAGE FICTIF DU PARCOURS",
      date_creation: "2011-05-02",
      tranche_effectif_salarie: "02",
      nombre_etablissements_ouverts: 1,
      statut_diffusion: "O",
      matching_etablissements: [
        { siret: SIRET, adresse: "3 RUE FICTIVE 76500 ELBEUF", code_postal: "76500", libelle_commune: "ELBEUF", activite_principale: "45.20A", etat_administratif: "A", tranche_effectif_salarie: "02" },
      ],
    },
  ],
  total_results: 1,
  total_pages: 1,
};

describe("parcours commercial complet", () => {
  it("de la découverte au client payant, chaque étape laisse une trace vérifiable", async () => {
    const admin = await createTestGarage("Parcours");
    garages.push(admin.garageId);
    await prisma.user.update({ where: { id: admin.owner.userId }, data: { platformAdmin: true } });
    const adminId = admin.owner.userId;

    // 1. Découverte : une simulation n'écrit rien, l'exécution crée la fiche sourcée.
    const sireneFetch = (async () => new Response(JSON.stringify(sirenePage), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const dry = await runJob("discovery", { dryRun: true, trigger: "test", fetchImpl: sireneFetch });
    expect(dry.stats).toMatchObject({ zones: { elbeuf: { found: 1, created: 1, missingFields: [], sample: [{ siret: SIRET }] } } });
    expect(await prisma.lead.count()).toBe(0);
    await runJob("discovery", { trigger: "test", fetchImpl: sireneFetch });
    let lead = await prisma.lead.findUniqueOrThrow({ where: { siret: SIRET } });
    expect(lead).toMatchObject({ name: "Garage Fictif Du Parcours", zone: "elbeuf", source: "SIRENE", stage: "QUALIFIED" });
    expect(lead.sourceUrl).toBe(`https://annuaire-entreprises.data.gouv.fr/etablissement/${SIRET}`);

    // 2. L'admin renseigne le site trouvé ; la vérification passe par la vraie pile HTTP.
    await prisma.lead.update({ where: { id: lead.id }, data: { website: `http://garage-parcours.example:${port}/` } });
    const { enrichLeadWebsite } = await import("@/server/growth/leads");
    await enrichLeadWebsite(lead.id, {
      fetchImpl: createGuardedFetch({ lookup: (_h, cb) => cb(null, [{ address: "127.0.0.1", family: 4 }]), isAllowed: (a) => a === "127.0.0.1" }),
      resolve: async () => ["93.184.216.34"],
      policy: { allowedPorts: [String(port)] },
    });
    lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(lead.email).toBe("atelier@garage-parcours.example");
    expect(lead.emailSourceUrl).toBe(`http://garage-parcours.example:${port}/`);
    expect(lead.confidence).toBe("HIGH");
    expect(lead.hypothesis).toMatch(/^Hypothèse à vérifier/);

    // 3. Brouillon français préparé par la tâche, sans aucun envoi.
    await runJob("drafts", { trigger: "test" });
    const draft = await prisma.outreachDraft.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(draft.status).toBe("DRAFT");
    expect(draft.body).toMatch(/^Bonjour,/);
    expect(draft.body).toContain("GarageFlow Test SAS");
    expect(draft.body).toContain("/desinscription/");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("READY_FOR_REVIEW");

    // 4. Approbation humaine puis envoi depuis la messagerie de l'admin.
    await approveDraft(draft.id, adminId);
    await markDraftSentManually(draft.id, adminId);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("CONTACTED");

    // 5. Réponse consignée, démo planifiée.
    await logReply(lead.id, { summary: "Intéressé, veut voir l'outil mardi", objection: "Peur de la saisie en plus" }, adminId);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("REPLIED");
    await setLeadStage(lead.id, "DEMO_BOOKED", adminId, "Mardi 10 h, à l'atelier");

    // 6. Inscription depuis le lien de l'email : attribuée au prospect et à la campagne.
    const { garage, user } = await registerGarage({ garageName: "Garage Fictif du Parcours", firstName: "Dom", lastName: "Fictif", email: "atelier@garage-parcours.example", password: PASSWORD, source: "prospection" });
    garages.push(garage.id);
    lead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(lead).toMatchObject({ stage: "TRIAL", garageId: garage.id });
    expect(garage.acquisitionSource).toBe("prospection");

    // 7. Activation : un premier dossier dans le produit.
    const ctx = { garageId: garage.id, userId: user.id, role: "OWNER" as const };
    const customer = await createCustomer(ctx, { firstName: "Jean", lastName: "Client", phone: "0600000000", email: "", address: "", notes: "" });
    const vehicle = await createVehicle(ctx, { customerId: customer.id, plate: uniquePlate(), make: "Renault", model: "Clio", fuel: "PETROL", mileage: 1000, vin: "", color: "", notes: "" });
    await createWorkOrder(ctx, { customerId: customer.id, vehicleId: vehicle.id, mileageIn: 1000, reason: "Révision", symptoms: "" });

    // 8. Abonnement payant, synchronisé par la qualification du lendemain.
    await activateManually(garage.id, { plan: "ATELIER", months: 1 }, adminId);
    await runJob("score", { trigger: "test", now: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("CONVERTED");

    // 9. Indicateurs et rapport calculés depuis la base.
    const m = await growthMetrics();
    expect(m.sales.stageCounts.CONVERTED).toBe(1);
    expect(m.sales.sent30).toBe(1);
    expect(m.sales.replyRate.num).toBe(1);
    expect(m.sales.leadsWithTrial).toBe(1);
    expect(m.product.bySignupSource.find((s) => s.source === "prospection")?.count).toBeGreaterThanOrEqual(1);
    expect(m.product.active).toBeGreaterThanOrEqual(1);
    const report = await weeklyReportText();
    expect(report).toMatch(/Client : 1/);
    expect(report).toMatch(/Messages envoyés \(30 j\) : 1/);

    // Historique complet et lisible sur la fiche.
    const types = (await prisma.leadActivity.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } })).map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["discovered", "website", "draft", "sent", "reply", "stage", "signup"]));
  });
});
