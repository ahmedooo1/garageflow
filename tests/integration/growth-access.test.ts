import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/auth/session";

/* Les actions serveur passent par la session : on la remplace pour tester les droits. */
const session = vi.hoisted(() => ({ current: null as null | { user: SessionUser } }));
vi.mock("@/server/auth/session", () => ({ getSession: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));

const { prisma } = await import("@/server/db");
const actions = await import("@/server/actions/growth");
const { createDraft } = await import("@/server/growth/outreach");
const { upsertSireneCandidate } = await import("@/server/growth/leads");
const { aiAvailability } = await import("@/server/growth/ai");
const { updateGrowthSettings } = await import("@/server/growth/settings");
const { cleanupGarage, createTestGarage } = await import("./helpers");

function user(platformAdmin: boolean, garageId: string, id: string): { user: SessionUser } {
  return { user: { id, garageId, email: "x@test.local", firstName: "X", lastName: "Y", role: "OWNER", platformAdmin, garageName: "G" } as SessionUser };
}

function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

const garages: string[] = [];
afterAll(async () => {
  await prisma.leadActivity.deleteMany();
  await prisma.outreachDraft.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.growthSettings.deleteMany();
  for (const id of garages) await cleanupGarage(id);
});

beforeEach(async () => {
  await prisma.leadActivity.deleteMany();
  await prisma.outreachDraft.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.growthJobRun.deleteMany();
});

describe("accès à la prospection", () => {
  it("un gérant de garage n'accède à aucune action de prospection", async () => {
    const g = await createTestGarage("GrowthRbac");
    garages.push(g.garageId);
    session.current = user(false, g.garageId, g.owner.userId);
    const calls = [
      actions.runJobAction({ ok: false }, form({ job: "score" })),
      actions.importCsvAction({ ok: false }, form({ csv: "nom;source_url\nA;https://a.test" })),
      actions.setStageAction({ ok: false }, form({ leadId: "x", stage: "QUALIFIED" })),
      actions.updateGrowthSettingsAction({ ok: false }, form({ paused: "on" })),
      actions.addSuppressionAction({ ok: false }, form({ kind: "EMAIL", value: "a@b.test" })),
    ];
    for (const result of await Promise.all(calls)) {
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/réservé à l'équipe GarageFlow/);
    }
    expect(await prisma.lead.count()).toBe(0);
    expect(await prisma.growthJobRun.count()).toBe(0);
  });

  it("sans session, les actions sont refusées", async () => {
    session.current = null;
    const result = await actions.runJobAction({ ok: false }, form({ job: "score" }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Authentification/);
  });

  it("l'équipe GarageFlow peut lancer une tâche", async () => {
    const g = await createTestGarage("GrowthAdminAccess");
    garages.push(g.garageId);
    await prisma.user.update({ where: { id: g.owner.userId }, data: { platformAdmin: true } });
    session.current = user(true, g.garageId, g.owner.userId);
    const result = await actions.runJobAction({ ok: false }, form({ job: "score", dryRun: "1" }));
    expect(result.ok).toBe(true);
  });

  it("le formulaire public de démo ignore les robots (champ piège)", async () => {
    session.current = null;
    const result = await actions.demoRequestAction({ ok: false }, form({ name: "Bot", garageName: "Bot", postalCode: "76000", email: "bot@bot.test", website: "http://spam" }));
    expect(result.ok).toBe(true);
    expect(await prisma.lead.count()).toBe(0);
  });
});

describe("rédaction assistée", () => {
  it("sans clé, le modèle de message déterministe est utilisé et la raison est tracée", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const g = await createTestGarage("GrowthAi");
    garages.push(g.garageId);
    await updateGrowthSettings({ aiEnabled: true }, g.owner.userId);
    expect(await aiAvailability()).toEqual({ available: false, reason: "ANTHROPIC_API_KEY absente" });

    await upsertSireneCandidate({
      siret: "66666666600011", siren: "666666666", name: "Garage Fictif Ia", address: "", postalCode: "76500", city: "Elbeuf", zone: "elbeuf",
      nafCode: "45.20A", companyCreatedOn: null, workforceRange: "01", establishmentsCount: 1, sourceUrl: "https://annuaire-entreprises.data.gouv.fr/etablissement/66666666600011", sourceFetchedAt: new Date(),
    });
    const lead = await prisma.lead.findFirstOrThrow();
    await prisma.lead.update({ where: { id: lead.id }, data: { email: "ia@garage-fictif.test", emailSourceUrl: "https://garage-fictif.test/" } });
    const draft = await createDraft(lead.id, "FIRST_CONTACT", { useAi: true });
    expect(draft.generator).toBe("template");
    const activity = await prisma.leadActivity.findFirst({ where: { leadId: lead.id, type: "draft" } });
    expect(activity?.message).toMatch(/ANTHROPIC_API_KEY absente/);
    expect(await prisma.aiUsage.count()).toBe(0);
  });

  it("au-delà du budget mensuel, aucun appel n'est tenté", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-non-utilisee";
    const g = await createTestGarage("GrowthBudget");
    garages.push(g.garageId);
    await updateGrowthSettings({ aiEnabled: true, aiMonthlyBudgetUsd: 1 }, g.owner.userId);
    await prisma.aiUsage.create({ data: { purpose: "outreach_draft", model: "claude-opus-5-5", costMicroUsd: 999_000 } });
    expect(await aiAvailability()).toEqual({ available: false, reason: "budget mensuel atteint" });
    await prisma.aiUsage.deleteMany();
    delete process.env.ANTHROPIC_API_KEY;
  });
});
