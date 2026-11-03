import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/server/lib/crypto";
import { isJobName, runJob } from "@/server/growth/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Déclencheur des tâches planifiées, appelé par le cron du serveur :
 *   curl -fsS -X POST -H "Authorization: Bearer $GROWTH_CRON_SECRET" \
 *     "https://garageflow.aaweb.fr/api/growth/cron?job=score"
 *
 * Désactivé tant que GROWTH_CRON_SECRET (32 caractères minimum) n'est pas défini.
 * `dryRun=1` simule sans rien écrire. Rejouer la même tâche dans la même
 * période renvoie l'exécution existante.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.GROWTH_CRON_SECRET ?? "";
  if (secret.length < 32) return NextResponse.json({ error: "Tâches planifiées désactivées" }, { status: 404 });
  const auth = request.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const job = request.nextUrl.searchParams.get("job") ?? "";
  if (!isJobName(job)) return NextResponse.json({ error: "Tâche inconnue" }, { status: 400 });
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  const run = await runJob(job, { dryRun, trigger: "cron" });
  const status = run.status === "FAILED" ? 500 : 200;
  return NextResponse.json({ id: run.id, job: run.job, status: run.status, attempts: run.attempts, dryRun: run.dryRun, stats: run.stats, error: run.error }, { status });
}
