import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/growth/cron/route";
import { prisma } from "@/server/db";

const SECRET = "c".repeat(48);
const call = (query: string, auth?: string) =>
  POST(new NextRequest(`http://localhost:3000/api/growth/cron${query}`, { method: "POST", headers: auth ? { authorization: auth } : {} }));

beforeEach(async () => {
  await prisma.growthJobRun.deleteMany();
  process.env.GROWTH_CRON_SECRET = SECRET;
});
afterAll(async () => {
  delete process.env.GROWTH_CRON_SECRET;
  await prisma.growthJobRun.deleteMany();
});

describe("déclencheur des tâches planifiées", () => {
  it("n'existe pas sans secret suffisamment long", async () => {
    delete process.env.GROWTH_CRON_SECRET;
    expect((await call("?job=score", `Bearer ${SECRET}`)).status).toBe(404);
    process.env.GROWTH_CRON_SECRET = "court";
    expect((await call("?job=score", "Bearer court")).status).toBe(404);
  });

  it("refuse un jeton absent ou faux, sans rien exécuter", async () => {
    expect((await call("?job=score")).status).toBe(401);
    expect((await call("?job=score", `Bearer ${SECRET}x`)).status).toBe(401);
    expect((await call("?job=score", SECRET)).status).toBe(401);
    expect(await prisma.growthJobRun.count()).toBe(0);
  });

  it("refuse une tâche inconnue et exécute une tâche connue une seule fois par période", async () => {
    expect((await call("?job=rm-rf", `Bearer ${SECRET}`)).status).toBe(400);
    const first = await (await call("?job=score", `Bearer ${SECRET}`)).json();
    const second = await (await call("?job=score", `Bearer ${SECRET}`)).json();
    expect(first.status).toBe("SUCCEEDED");
    expect(second.id).toBe(first.id);
    const dry = await (await call("?job=score&dryRun=1", `Bearer ${SECRET}`)).json();
    expect(dry.dryRun).toBe(true);
  });
});
