import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * Fonctionnement autonome, 24 h sur 24 : toutes les tâches planifiées tournent
 * pendant deux semaines simulées, envoi depuis GarageFlow activé, et aucun
 * message ne part vers un prospect sans approbation humaine. Seul le rapport
 * hebdomadaire interne est envoyé.
 */
const sent = vi.hoisted(() => [] as { to: string; subject: string }[]);
vi.mock("@/server/lib/mailer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/lib/mailer")>();
  const record = async (m: { to: string; subject: string }) => {
    sent.push({ to: m.to, subject: m.subject });
  };
  return {
    ...real,
    sendMail: record,
    sendMailBestEffort: async (m: { to: string; subject: string }) => {
      await record(m);
      return true;
    },
  };
});

const { prisma } = await import("@/server/db");
const { JOBS, runJob } = await import("@/server/growth/jobs");

const SIRET = "88888888800011";
const REPORT_TO = "rapport-interne@garageflow.test";
const LEAD_EMAIL = "atelier@garage-autonome.example";
const env = { ...process.env };

const sirenePage = {
  results: [
    {
      siren: SIRET.slice(0, 9),
      nom_complet: "GARAGE FICTIF AUTONOME",
      date_creation: "2012-03-04",
      tranche_effectif_salarie: "02",
      nombre_etablissements_ouverts: 1,
      statut_diffusion: "O",
      matching_etablissements: [
        { siret: SIRET, adresse: "5 RUE FICTIVE 76500 ELBEUF", code_postal: "76500", libelle_commune: "ELBEUF", activite_principale: "45.20A", etat_administratif: "A", tranche_effectif_salarie: "02" },
      ],
    },
  ],
  total_results: 1,
  page: 1,
  per_page: 25,
  total_pages: 1,
};
const sireneFetch = (async () => new Response(JSON.stringify(sirenePage), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

async function wipe() {
  await prisma.$transaction([prisma.leadActivity.deleteMany(), prisma.outreachDraft.deleteMany(), prisma.lead.deleteMany(), prisma.suppressionEntry.deleteMany(), prisma.growthJobRun.deleteMany(), prisma.growthSettings.deleteMany()]);
}

beforeAll(async () => {
  await wipe();
  Object.assign(process.env, {
    OUTREACH_SEND_ENABLED: "true",
    OUTREACH_FROM: "Camille <camille@garageflow.test>",
    OUTREACH_REPLY_TO: "camille@garageflow.test",
    OUTREACH_SENDER_NAME: "Camille Testeur",
    OUTREACH_SENDER_COMPANY: "GarageFlow Test SAS",
    OUTREACH_SENDER_ADDRESS: "1 rue du Test, 76000 Rouen",
    GROWTH_REPORT_TO: REPORT_TO,
    GROWTH_DISCOVERY_ZONES: "elbeuf",
  });
});

afterAll(async () => {
  process.env = env;
  await wipe();
});

describe("tâches planifiées en continu", () => {
  it("deux semaines de tâches, envoi activé : des brouillons à relire, aucun message parti vers un prospect", async () => {
    const start = Date.UTC(2026, 10, 2, 5, 0); // lundi
    const day = 24 * 60 * 60 * 1000;
    for (let d = 0; d < 14; d++) {
      const now = new Date(start + d * day);
      for (const job of JOBS) {
        const run = await runJob(job, { trigger: "cron", now, fetchImpl: sireneFetch });
        expect(run.status, `${job} jour ${d}`).not.toBe("FAILED");
      }
      if (d === 0) {
        // Email publié relevé (comme après la vérification du site) : le prospect devient contactable.
        await prisma.lead.update({ where: { siret: SIRET }, data: { email: LEAD_EMAIL, emailSourceUrl: "https://garage-autonome.example/", confidence: "HIGH" } });
      }
    }

    // Témoins : la découverte et la rédaction ont bien tourné, et la capture des envois fonctionne.
    const lead = await prisma.lead.findUniqueOrThrow({ where: { siret: SIRET } });
    const drafts = await prisma.outreachDraft.findMany({ where: { leadId: lead.id } });
    expect(drafts.length).toBeGreaterThan(0);
    expect(sent.some((m) => m.to === REPORT_TO)).toBe(true);

    // La garantie : rien n'est approuvé ni envoyé sans un humain.
    expect(drafts.every((d) => d.status === "DRAFT")).toBe(true);
    expect(drafts.every((d) => d.approvedAt === null && d.sentAt === null)).toBe(true);
    expect(lead.stage).toBe("READY_FOR_REVIEW");
    expect(sent.filter((m) => m.to !== REPORT_TO)).toEqual([]);
  });
});
