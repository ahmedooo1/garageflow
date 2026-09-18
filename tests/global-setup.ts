import { execSync } from "node:child_process";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

/**
 * Prépare la base de test : charge .env.test, applique les migrations
 * (non destructif) puis vide toutes les tables applicatives.
 */
export default async function globalSetup() {
  config({ path: ".env.test", override: true });
  const url = process.env.DATABASE_URL ?? "";
  if (!/garageflow_test/.test(url)) {
    throw new Error("Sécurité : DATABASE_URL de test doit pointer sur la base garageflow_test (.env.test)");
  }
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
