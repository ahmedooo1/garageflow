/**
 * Refuse les migrations qui casseraient un retour arrière de l'application.
 *
 * Au déploiement, la nouvelle version applique ses migrations puis, si elle ne
 * répond pas, l'ancienne image est relancée sur la même base. L'ancien code
 * doit donc fonctionner avec le nouveau schéma : on ajoute (table, colonne
 * facultative ou avec valeur par défaut, index), on ne retire ni ne renomme
 * rien dans la même livraison.
 *
 * Pour une suppression voulue, procéder en deux livraisons : d'abord le code
 * qui n'utilise plus la colonne, puis la migration qui la supprime, marquée
 * de la ligne « -- garageflow: destructive-validee » après relecture.
 *
 * Usage : node scripts/verifier-migrations.mjs (lancé par la CI).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DOSSIER = "prisma/migrations";
const MARQUEUR = "-- garageflow: destructive-validee";

const INTERDITS = [
  [/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA)\b/i, "suppression de table, colonne ou type"],
  [/\bRENAME\b/i, "renommage"],
  [/\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i, "changement de type de colonne"],
  [/\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i, "colonne rendue obligatoire"],
  [/\bADD\s+COLUMN\b(?![^;]*\bDEFAULT\b)[^;]*\bNOT\s+NULL\b/i, "colonne obligatoire sans valeur par défaut"],
  [/\bTRUNCATE\b/i, "vidage de table"],
  [/\bDELETE\s+FROM\b/i, "suppression de lignes"],
];

let erreurs = 0;
for (const nom of readdirSync(DOSSIER).sort()) {
  const fichier = join(DOSSIER, nom, "migration.sql");
  if (!statSync(join(DOSSIER, nom)).isDirectory()) continue;
  const sql = readFileSync(fichier, "utf8");
  if (sql.includes(MARQUEUR)) continue;
  // Les commentaires SQL ne comptent pas : seul le code exécuté est vérifié.
  const code = sql.replace(/--.*$/gm, "");
  for (const [motif, raison] of INTERDITS) {
    if (motif.test(code)) {
      console.error(`${fichier} : ${raison}. Incompatible avec un retour arrière de l'application.`);
      erreurs++;
    }
  }
}

if (erreurs > 0) {
  console.error(`\n${erreurs} problème(s). Voir l'en-tête de scripts/verifier-migrations.mjs.`);
  process.exit(1);
}
console.log("Migrations compatibles avec un retour arrière.");
