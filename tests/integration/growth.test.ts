import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { AppError } from "@/server/lib/errors";
import { submitDemoRequest } from "@/server/growth/inbound";
import { runJob } from "@/server/growth/jobs";
import { enrichLeadWebsite, eraseLead, importCsvLeads, rescoreLead, retentionDue, setLeadStage, syncConversions, upsertSireneCandidate } from "@/server/growth/leads";
import { growthMetrics } from "@/server/growth/metrics";
import {
  approveDraft,
  createDraft,
  markDraftSentManually,
  processUnsubscribe,
  sendApprovedDraft,
  unsubscribeToken,
  updateDraft,
} from "@/server/growth/outreach";
import { recordPageView } from "@/server/growth/audience";
import { updateGrowthSettings } from "@/server/growth/settings";
import { isSuppressed } from "@/server/growth/suppression";
import type { LeadCandidate } from "@/server/growth/sirene";
import { activateManually } from "@/server/services/billing";
import { registerGarage } from "@/server/services/auth";
import { cleanupGarage, createTestGarage, PASSWORD, type TestGarage } from "./helpers";

/* Données fictives, créées pour ces tests uniquement. */

const SENDER = {
  OUTREACH_SENDER_NAME: "Camille Testeur",
  OUTREACH_SENDER_COMPANY: "GarageFlow Test SAS",
  OUTREACH_SENDER_ADDRESS: "1 rue du Test, 76000 Rouen",
  OUTREACH_FROM: "Camille <camille@garageflow-test.example>",
};

async function wipeGrowth() {
  await prisma.$transaction([
    prisma.leadActivity.deleteMany(),
    prisma.outreachDraft.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.suppressionEntry.deleteMany(),
    prisma.growthJobRun.deleteMany(),
    prisma.growthSettings.deleteMany(),
    prisma.aiUsage.deleteMany(),
    prisma.pageView.deleteMany(),
  ]);
}

function candidate(over: Partial<LeadCandidate> = {}): LeadCandidate {
  return {
    siret: "11111111100011",
    siren: "111111111",
    name: "Garage Du Test",
    address: "1 Rue De L'exemple",
    postalCode: "76500",
    city: "Elbeuf",
    zone: "elbeuf",
    nafCode: "45.20A",
    companyCreatedOn: new Date("2012-03-01"),
    workforceRange: "02",
    establishmentsCount: 1,
    sourceUrl: "https://annuaire-entreprises.data.gouv.fr/etablissement/11111111100011",
    sourceFetchedAt: new Date(),
    ...over,
  };
}

function sireneResponse(sirets: string[]) {
  return {
    results: sirets.map((siret, i) => ({
      siren: siret.slice(0, 9),
      nom_complet: `GARAGE FICTIF ${i}`,
      date_creation: "2010-01-01",
      tranche_effectif_salarie: "01",
      nombre_etablissements_ouverts: 1,
      statut_diffusion: "O",
      matching_etablissements: [{ siret, code_postal: "76500", libelle_commune: "ELBEUF", activite_principale: "45.20A", etat_administratif: "A" }],
    })),
    total_pages: 1,
  };
}

const fakeFetch = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

let admin: TestGarage;
const garages: string[] = [];
const savedEnv = { ...process.env };

beforeEach(async () => {
  await wipeGrowth();
  Object.assign(process.env, SENDER);
  delete process.env.OUTREACH_SEND_ENABLED;
  delete process.env.GROWTH_KILL_SWITCH;
  process.env.GROWTH_DISCOVERY_ZONES = "elbeuf";
});

afterEach(() => {
  process.env = { ...savedEnv };
});

afterAll(async () => {
  await wipeGrowth();
  for (const id of garages) await cleanupGarage(id);
});

async function adminId() {
  if (!admin) {
    admin = await createTestGarage("GrowthAdmin");
    garages.push(admin.garageId);
    await prisma.user.update({ where: { id: admin.owner.userId }, data: { platformAdmin: true } });
  }
  return admin.owner.userId;
}

async function contactableLead() {
  await upsertSireneCandidate(candidate());
  const lead = await prisma.lead.findUniqueOrThrow({ where: { siret: "11111111100011" } });
  await prisma.lead.update({ where: { id: lead.id }, data: { email: "contact@garage-fictif.test", emailSourceUrl: "https://garage-fictif.test/contact" } });
  await rescoreLead(lead.id);
  return prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
}

describe("découverte et dédoublonnage", () => {
  it("crée un prospect qualifié depuis SIRENE, puis le reconnaît au passage suivant", async () => {
    expect(await upsertSireneCandidate(candidate())).toBe("created");
    expect(await upsertSireneCandidate(candidate())).toBe("unchanged");
    expect(await upsertSireneCandidate(candidate({ workforceRange: "03" }))).toBe("updated");
    const leads = await prisma.lead.findMany();
    expect(leads).toHaveLength(1);
    expect(leads[0].stage).toBe("QUALIFIED");
    expect(leads[0].sourceUrl).toMatch(/annuaire-entreprises/);
    expect(leads[0].workforceRange).toBe("03");
  });

  it("ne réécrit jamais une coordonnée déjà renseignée lors d'un import", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    const res = await importCsvLeads(
      [{ name: "Garage Du Test", address: "", postalCode: "76500", city: "Elbeuf", zone: "elbeuf", siret: "11111111100011", website: "", email: "autre@exemple.test", phone: "", sourceUrl: "https://autre.test/" }],
      id,
    );
    expect(res.updated).toBe(1);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).email).toBe("contact@garage-fictif.test");
  });
});

describe("tâches planifiées", () => {
  it("la simulation n'écrit rien ; l'exécution est idempotente sur la période", async () => {
    const fetchImpl = fakeFetch(sireneResponse(["44444444400011", "55555555500011"]));
    const dry = await runJob("discovery", { dryRun: true, trigger: "test", fetchImpl });
    expect(dry.status).toBe("SUCCEEDED");
    expect(await prisma.lead.count()).toBe(0);

    const first = await runJob("discovery", { trigger: "test", fetchImpl });
    expect(first.status).toBe("SUCCEEDED");
    expect(await prisma.lead.count()).toBe(2);
    const again = await runJob("discovery", { trigger: "test", fetchImpl });
    expect(again.id).toBe(first.id);
    expect(await prisma.growthJobRun.count({ where: { dryRun: false } })).toBe(1);
  });

  it("une erreur est enregistrée et peut être rejouée", async () => {
    const failing = (async () => new Response("indisponible", { status: 503 })) as typeof fetch;
    const failed = await runJob("discovery", { trigger: "test", fetchImpl: failing });
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toMatch(/HTTP 503/);
    const retried = await runJob("discovery", { trigger: "test", fetchImpl: fakeFetch(sireneResponse(["44444444400011"])) });
    expect(retried.id).toBe(failed.id);
    expect(retried.status).toBe("SUCCEEDED");
    expect(retried.attempts).toBe(2);
  });

  it("l'arrêt d'urgence suspend toutes les tâches", async () => {
    await updateGrowthSettings({ paused: true }, await adminId());
    const run = await runJob("score", { trigger: "test" });
    expect(run.status).toBe("SKIPPED");
    process.env.GROWTH_KILL_SWITCH = "1";
    await updateGrowthSettings({ paused: false }, await adminId());
    expect((await runJob("score", { trigger: "test" })).status).toBe("SKIPPED");
  });

  it("la préparation des brouillons ne contacte personne", async () => {
    await contactableLead();
    const run = await runJob("drafts", { trigger: "test" });
    expect(run.stats).toMatchObject({ prepared: 1 });
    const draft = await prisma.outreachDraft.findFirstOrThrow();
    expect(draft.status).toBe("DRAFT");
    expect(draft.generator).toBe("template");
    expect((await prisma.lead.findFirstOrThrow()).stage).toBe("READY_FOR_REVIEW");
  });
});

describe("messages : approbation humaine obligatoire", () => {
  it("le brouillon identifie l'expéditeur, cite la source et permet de se désinscrire", async () => {
    const lead = await contactableLead();
    const draft = await createDraft(lead.id, "FIRST_CONTACT");
    expect(draft.body).toContain("GarageFlow Test SAS");
    expect(draft.body).toContain("1 rue du Test, 76000 Rouen");
    expect(draft.body).toContain("base SIRENE");
    expect(draft.body).toContain(`/desinscription/${unsubscribeToken(lead.id)}`);
    expect(draft.body).toContain("utm_source=prospection");
    await expect(createDraft(lead.id, "DEMO_INVITE")).rejects.toThrow(/déjà en attente/);
  });

  it("rien ne part sans approbation, et modifier le texte annule l'approbation", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    const draft = await createDraft(lead.id, "FIRST_CONTACT");
    await expect(markDraftSentManually(draft.id, id)).rejects.toThrow(/approuvé/);
    await approveDraft(draft.id, id);
    await updateDraft(draft.id, { subject: draft.subject, body: draft.body.replace("Bonjour,", "Bonjour Madame,") }, id);
    expect((await prisma.outreachDraft.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("DRAFT");
    await expect(updateDraft(draft.id, { subject: draft.subject, body: "Bonjour, texte sans lien de désinscription. ".repeat(3) }, id)).rejects.toThrow(/désinscription/);
  });

  it("l'identité de l'expéditeur est exigée avant approbation", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    const draft = await createDraft(lead.id, "FIRST_CONTACT");
    delete process.env.OUTREACH_SENDER_ADDRESS;
    await expect(approveDraft(draft.id, id)).rejects.toThrow(/OUTREACH_SENDER_ADDRESS/);
  });

  it("l'envoi SMTP est désactivé par défaut ; l'envoi manuel fait avancer le suivi", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    const draft = await createDraft(lead.id, "FIRST_CONTACT");
    await approveDraft(draft.id, id);
    await expect(sendApprovedDraft(draft.id, id)).rejects.toThrow(/désactivé/);
    await markDraftSentManually(draft.id, id);
    await expect(markDraftSentManually(draft.id, id)).rejects.toBeInstanceOf(AppError);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.stage).toBe("CONTACTED");
    expect(after.nextFollowUpAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("l'envoi SMTP, quand il est activé, part une seule fois et respecte la limite quotidienne", async () => {
    process.env.OUTREACH_SEND_ENABLED = "true";
    process.env.OUTREACH_DAILY_LIMIT = "1";
    const id = await adminId();
    const lead = await contactableLead();
    const draft = await createDraft(lead.id, "FIRST_CONTACT");
    await approveDraft(draft.id, id);
    await sendApprovedDraft(draft.id, id); // MAIL_TRANSPORT=silent en test
    expect((await prisma.outreachDraft.findUniqueOrThrow({ where: { id: draft.id } })).sentVia).toBe("smtp");

    await prisma.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: new Date(Date.now() - 1000) } });
    const follow = await createDraft(lead.id, "FOLLOW_UP");
    expect(follow.subject).toMatch(/^Re: /);
    await approveDraft(follow.id, id);
    await expect(sendApprovedDraft(follow.id, id)).rejects.toThrow(/Limite de 1/);
  });

  it("une seule relance par prospect", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    await expect(createDraft(lead.id, "FOLLOW_UP")).rejects.toThrow(/rien à relancer/);
    const first = await createDraft(lead.id, "FIRST_CONTACT");
    await approveDraft(first.id, id);
    await markDraftSentManually(first.id, id);
    const follow = await createDraft(lead.id, "FOLLOW_UP");
    await approveDraft(follow.id, id);
    await markDraftSentManually(follow.id, id);
    await expect(createDraft(lead.id, "FOLLOW_UP")).rejects.toThrow(/seconde relance/);
  });
});

describe("opposition", () => {
  it("le lien de désinscription est définitif, même si le garage est retrouvé plus tard", async () => {
    const lead = await contactableLead();
    await createDraft(lead.id, "FIRST_CONTACT");
    expect(await processUnsubscribe(unsubscribeToken(lead.id))).toBe(true);
    expect(await processUnsubscribe(unsubscribeToken(lead.id))).toBe(true);
    expect(await processUnsubscribe("faux.jeton")).toBe(false);

    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.stage).toBe("DO_NOT_CONTACT");
    expect(await isSuppressed({ email: "CONTACT@garage-fictif.test" })).toBe(true);
    expect(await prisma.outreachDraft.count({ where: { leadId: lead.id, status: { not: "DISCARDED" } } })).toBe(0);
    await expect(createDraft(lead.id, "FIRST_CONTACT")).rejects.toThrow();

    await prisma.lead.delete({ where: { id: lead.id } });
    expect(await upsertSireneCandidate(candidate())).toBe("suppressed");
    expect(await prisma.lead.count()).toBe(0);
  });

  it("« ne pas contacter » depuis la console alimente aussi la liste d'opposition", async () => {
    const lead = await contactableLead();
    await setLeadStage(lead.id, "DO_NOT_CONTACT", await adminId(), "Demande orale");
    expect(await isSuppressed({ siret: "11111111100011" })).toBe(true);
  });
});

describe("site web, demandes de démo et inscriptions", () => {
  it("relève l'email publié sur le site, avec la page comme source", async () => {
    await upsertSireneCandidate(candidate());
    const lead = await prisma.lead.findFirstOrThrow();
    await prisma.lead.update({ where: { id: lead.id }, data: { website: "https://garage-fictif.test/" } });
    const site = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /admin", { status: 200, headers: { "content-type": "text/plain" } });
      return new Response('<a href="mailto:atelier@garage-fictif.test">mail</a> Prise de rendez-vous en ligne', { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    await enrichLeadWebsite(lead.id, { fetchImpl: site, resolve: async () => ["93.184.216.34"] });
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.email).toBe("atelier@garage-fictif.test");
    expect(after.emailSourceUrl).toBe("https://garage-fictif.test/");
    expect(after.confidence).toBe("HIGH");
  });

  it("une demande de démo crée ou complète un prospect", async () => {
    const input = { name: "Alex Fictif", garageName: "Garage Fictif Démo", postalCode: "76100", email: "alex@garage-demo.test", phone: "", message: "Deux ponts" };
    const { leadId } = await submitDemoRequest(input);
    const again = await submitDemoRequest(input);
    expect(again.leadId).toBe(leadId);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.source).toBe("INBOUND_DEMO");
    expect(lead.zone).toBe("rouen");
    expect(lead.demoRequestedAt).not.toBeNull();
    await expect(submitDemoRequest({ ...input, postalCode: "abc" })).rejects.toThrow();
  });

  it("une inscription rattache le prospect et garde la provenance de campagne", async () => {
    const lead = await contactableLead();
    const { garage } = await registerGarage({ garageName: "Garage Du Test", firstName: "A", lastName: "B", email: "contact@garage-fictif.test", password: PASSWORD, source: "Prospection!" });
    garages.push(garage.id);
    expect(garage.acquisitionSource).toBe("prospection");
    const linked = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(linked.garageId).toBe(garage.id);
    expect(linked.stage).toBe("TRIAL");

    await activateManually(garage.id, { plan: "ATELIER", months: 1 }, await adminId());
    await syncConversions();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("CONVERTED");

    const m = await growthMetrics();
    expect(m.sales.leadsWithTrial).toBe(1);
    expect(m.product.bySignupSource.find((s) => s.source === "prospection")?.count).toBeGreaterThanOrEqual(1);
  });
});

describe("audience", () => {
  it("compte par jour, page et provenance, et ignore les autres chemins", async () => {
    expect(await recordPageView("/", "direct")).toBe(true);
    expect(await recordPageView("/", "direct")).toBe(true);
    expect(await recordPageView("/app/atelier", "direct")).toBe(false);
    const rows = await prisma.pageView.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });
});

describe("corrections de la revue", () => {
  it("un garage importé puis trouvé dans SIRENE n'existe qu'une fois et reçoit son SIRET", async () => {
    const id = await adminId();
    await importCsvLeads(
      [{ name: "SARL Garage du Test", address: "", postalCode: "76500", city: "Elbeuf", zone: "elbeuf", siret: "", website: "", email: "", phone: "", sourceUrl: "https://pagesjaunes.example/garage-du-test" }],
      id,
    );
    expect(await upsertSireneCandidate(candidate())).toBe("updated");
    const leads = await prisma.lead.findMany();
    expect(leads).toHaveLength(1);
    expect(leads[0].siret).toBe("11111111100011");
    expect(leads[0].source).toBe("CSV_IMPORT");
    expect(leads[0].sourceUrl).toBe("https://pagesjaunes.example/garage-du-test");
  });

  it("la désinscription exclut aussi l'adresse réellement écrite, même si la fiche a changé depuis", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    const draft = await createDraft(lead.id, "FIRST_CONTACT");
    await approveDraft(draft.id, id);
    await markDraftSentManually(draft.id, id);
    await prisma.lead.update({ where: { id: lead.id }, data: { email: "nouvelle@garage-fictif.test" } });
    await processUnsubscribe(unsubscribeToken(lead.id));
    expect(await isSuppressed({ email: "contact@garage-fictif.test" })).toBe(true);
    expect(await isSuppressed({ email: "nouvelle@garage-fictif.test" })).toBe(true);
  });

  it("un client qui résilie ne repasse pas « en essai »", async () => {
    const lead = await contactableLead();
    await prisma.lead.update({ where: { id: lead.id }, data: { email: "resiliation@garage-fictif.test" } });
    const { garage } = await registerGarage({ garageName: "Garage Résiliation", firstName: "A", lastName: "B", email: "resiliation@garage-fictif.test", password: PASSWORD });
    garages.push(garage.id);
    await activateManually(garage.id, { plan: "ATELIER", months: 1 }, await adminId());
    await syncConversions();
    await prisma.garage.update({ where: { id: garage.id }, data: { subscriptionStatus: "CANCELED" } });
    await syncConversions();
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).stage).toBe("CONVERTED");
    expect((await growthMetrics()).product.canceled).toBeGreaterThanOrEqual(1);
  });

  it("l'effacement supprime la fiche et garde seulement l'opposition", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    await createDraft(lead.id, "FIRST_CONTACT");
    await eraseLead(lead.id, id);
    expect(await prisma.lead.count()).toBe(0);
    expect(await prisma.leadActivity.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await prisma.outreachDraft.count({ where: { leadId: lead.id } })).toBe(0);
    expect(await isSuppressed({ email: "contact@garage-fictif.test", siret: "11111111100011" })).toBe(true);
    expect(await upsertSireneCandidate(candidate())).toBe("suppressed");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "growth.lead_erased", entityId: lead.id } });
    expect(JSON.stringify(log)).not.toMatch(/garage-fictif|Garage Du Test/);
  });

  it("compte les prospects arrivés au terme de la conservation", async () => {
    await contactableLead();
    const in4Years = new Date(Date.now() + 4 * 365 * 24 * 60 * 60 * 1000);
    expect(await retentionDue()).toBe(0);
    expect(await retentionDue(in4Years)).toBe(1);
  });

  it("refuse l'approbation sans APP_URL publique en production, et l'envoi SMTP depuis une adresse no-reply", async () => {
    const id = await adminId();
    const lead = await contactableLead();
    const draft = await createDraft(lead.id, "FIRST_CONTACT");
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "production";
    env.APP_URL = "http://localhost:3000";
    await expect(approveDraft(draft.id, id)).rejects.toThrow(/APP_URL/);
    env.NODE_ENV = "test";
    await approveDraft(draft.id, id);
    process.env.OUTREACH_SEND_ENABLED = "true";
    process.env.OUTREACH_FROM = "GarageFlow <no-reply@garageflow-test.example>";
    await expect(sendApprovedDraft(draft.id, id)).rejects.toThrow(/OUTREACH_FROM/);
  });
});
