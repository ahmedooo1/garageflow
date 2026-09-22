/**
 * Garde-fou commun au seed de démonstration et à la capture des aperçus.
 *
 * Ces deux outils sont destructeurs ou indiscrets hors d'un poste de travail :
 *  - le seed supprime le garage de démonstration puis le recrée, et installe un
 *    compte dont le mot de passe est publié dans ce dépôt ;
 *  - la capture se connecte avec ce même compte.
 *
 * Lancés par erreur sur une base de production, ils détruiraient des données
 * réelles et ouvriraient un accès connu de tous. On refuse donc par défaut tout
 * ce qui ne ressemble pas à une instance locale.
 */

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

/** Dérogation explicite, pour un environnement de recette assumé. */
const DEROGATION = "GARAGEFLOW_AUTORISER_DONNEES_DEMO";
const VALEUR_DEROGATION = "je-sais-que-cela-detruit-des-donnees";

function hote(url) {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/, "").replace(/\]$/, "");
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {string} options.tache        Nom lisible de l'outil, pour le message.
 * @param {string} [options.urlBase]    URL de l'application visée.
 * @param {string} [options.urlBaseDeDonnees] URL de connexion PostgreSQL.
 */
export function exigerEnvironnementLocal({ tache, urlBase, urlBaseDeDonnees }) {
  const raisons = [];

  if (process.env.NODE_ENV === "production") {
    raisons.push('NODE_ENV vaut "production"');
  }

  if (urlBase !== undefined) {
    const h = hote(urlBase);
    if (h === null) raisons.push(`l'URL de l'application est illisible : ${urlBase}`);
    else if (!HOTES_LOCAUX.has(h)) raisons.push(`l'application visée est « ${h} », pas une instance locale`);
  }

  if (urlBaseDeDonnees !== undefined) {
    if (!urlBaseDeDonnees) {
      raisons.push("DATABASE_URL n'est pas définie");
    } else {
      const h = hote(urlBaseDeDonnees);
      if (h === null) raisons.push("DATABASE_URL est illisible");
      else if (!HOTES_LOCAUX.has(h)) raisons.push(`la base visée est « ${h} », pas une base locale`);
    }
  }

  if (raisons.length === 0) return;

  if (process.env[DEROGATION] === VALEUR_DEROGATION) {
    console.warn(`\n/!\\  ${tache} : garde-fou levé explicitement.`);
    for (const r of raisons) console.warn(`    - ${r}`);
    console.warn("");
    return;
  }

  const message = [
    "",
    `Refus de lancer « ${tache} » : cet environnement ne ressemble pas a un poste local.`,
    ...raisons.map((r) => `  - ${r}`),
    "",
    "Cet outil detruit des donnees et installe un compte dont le mot de passe est public.",
    `Pour passer outre en connaissance de cause : ${DEROGATION}=${VALEUR_DEROGATION}`,
    "",
  ].join("\n");
  throw new Error(message);
}
