/**
 * Essai à blanc du connecteur SIRENE, sans base de données ni écriture.
 *
 * Interroge l'API Recherche d'entreprises comme la tâche « discovery », puis
 * affiche ce qui serait enregistré : nombre de candidats, motifs d'exclusion,
 * champs attendus absents (changement de format de l'API) et un échantillon.
 * À lancer depuis n'importe quel poste qui a accès à Internet :
 *
 *   pnpm exec tsx scripts/sirene-dry-run.ts elbeuf [pages]
 *   pnpm exec tsx scripts/sirene-dry-run.ts --raw elbeuf   # + clés brutes du 1er résultat
 *
 * Rien n'est écrit, nulle part. Une requête toutes les 400 ms au plus.
 */
import { ZONE_KEYS, isZoneKey } from "@/lib/growth/zones";
import { buildSireneUrl, discoverZone, userAgent } from "@/server/growth/sirene";

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes("--raw");
  const [zone = "elbeuf", pagesArg = "1"] = args.filter((a) => a !== "--raw");
  if (!isZoneKey(zone)) {
    console.error(`Zone inconnue « ${zone} ». Zones : ${ZONE_KEYS.join(", ")}`);
    process.exit(2);
  }
  const maxPages = Math.min(Math.max(Number(pagesArg) || 1, 1), 4);

  if (raw) {
    const res = await fetch(buildSireneUrl(zone, 1), { headers: { Accept: "application/json", "User-Agent": userAgent() } });
    const body = (await res.json()) as { results?: Record<string, unknown>[] };
    const first = body.results?.[0] ?? {};
    const etab = (first.matching_etablissements as Record<string, unknown>[] | undefined)?.[0] ?? {};
    // Uniquement les noms de champs : aucune donnée de dirigeant n'est affichée.
    console.log(JSON.stringify({ status: res.status, topLevelKeys: Object.keys(body), resultKeys: Object.keys(first), etablissementKeys: Object.keys(etab) }, null, 2));
  }

  const found = await discoverZone(zone, { maxPages });
  console.log(
    JSON.stringify(
      {
        zone,
        requests: found.requests,
        pages: found.pages,
        totalResults: found.totalResults,
        candidates: found.candidates.length,
        skipped: found.skipped,
        skipReasons: found.reasons,
        missingFields: found.missingFields,
        sample: found.candidates.slice(0, 5).map((c) => ({ name: c.name, siret: c.siret, address: c.address, postalCode: c.postalCode, workforceRange: c.workforceRange, establishments: c.establishmentsCount, sourceUrl: c.sourceUrl })),
      },
      null,
      2,
    ),
  );
  if (found.missingFields.length) {
    console.error("\nChamps attendus absents : le format de l'API a peut-être changé. Ne pas lancer la découverte réelle avant vérification.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
