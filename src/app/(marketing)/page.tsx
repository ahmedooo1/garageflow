import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Check, ClipboardCheck, LayoutGrid, PenLine, Receipt, Route, X } from "lucide-react";
import apercuAtelier from "./apercu-atelier.png";
import apercuClient from "./apercu-client.png";
import apercuControle from "./apercu-controle.png";
import apercuDossier from "./apercu-dossier.png";
import apercuStatuts from "./apercu-statuts.png";
import { CHECKLIST_SECTIONS, STATUS_LABELS } from "@/lib/labels";
import { formatPriceHt, PLANS, TRIAL_DAYS } from "@/lib/plans";
import { getSession } from "@/server/auth/session";
import { PRIMARY_CTA } from "./layout";

export const metadata: Metadata = {
  title: "GarageFlow · Logiciel d'atelier pour garages indépendants",
  description:
    "Réception photo, diagnostic du technicien, validation des travaux par le client en un lien, réparation et restitution. GarageFlow suit chaque véhicule de l'entrée à la clé rendue.",
};

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/app/atelier");

  return (
    <>
      <Ouverture />
      <Dossier />
      <Parcours />
      <Controle />
      <Validation />
      <Conditions />
      <Annexe />
      <Cloture />
    </>
  );
}

/* ========================================================================== */
/* Éléments communs                                                           */
/* ========================================================================== */

function Shell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-[84rem] px-5 sm:px-8 ${className}`}>{children}</div>;
}

/** En-tête de chapitre : numéro, pictogramme, titre, chapeau décalé à droite. */
function Chapter({ n, id, title, standfirst, icon: Icon }: { n: string; id: string; title: string; standfirst: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <header id={id} className="rule-heavy scroll-mt-16 pt-5">
      <div className="grid gap-7 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-7">
          <p className="field-tag flex items-center gap-2.5">
            <span className="mark">§ {n}</span>
            {/* Pictogramme de repérage, à la graisse du texte : il situe le
                chapitre d'un coup d'œil dans le sommaire vertical. */}
            <Icon className="h-3.5 w-3.5 text-[var(--ink-soft)]" aria-hidden />
          </p>
          <h2 className="display display-l mt-3">{title}</h2>
        </div>
        <p className="measure self-end text-[1.0625rem] leading-relaxed text-[var(--ink-soft)] md:col-span-4 md:col-start-9">{standfirst}</p>
      </div>
    </header>
  );
}

/** Plaque d'immatriculation française. */
function PlateFr({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`plate-fr ${className}`}>
      <span className="plate-fr__band">F</span>
      <span className="plate-fr__no">{value}</span>
    </span>
  );
}

/**
 * Copie d'écran du produit, encadrée et légendée.
 *
 * Sous 768 px l'image garde une largeur fixe et défile horizontalement :
 * réduite à la largeur d'un téléphone, le texte des écrans serait illisible.
 * Les captures sont régénérées par `npm run capture:apercu`.
 */
function Apercu({
  src,
  alt,
  legende,
  className = "",
  largeurMobile = "w-[52rem]",
  telephone = false,
}: {
  src: StaticImageData;
  alt: string;
  legende: React.ReactNode;
  className?: string;
  largeurMobile?: string;
  /** L'écran du client est lu sur un téléphone : on le montre à sa taille. */
  telephone?: boolean;
}) {
  const image = (
    <Image
      src={src}
      alt={alt}
      sizes={telephone ? "24rem" : "(min-width: 768px) 56rem, 52rem"}
      /* 68 plutôt que 75 : sur ces captures, 15 % de poids en moins pour une
         différence invisible à la taille d'affichage (vérifié à l'agrandissement). */
      quality={68}
      className={telephone ? "block w-full" : `block max-w-none md:w-full ${largeurMobile}`}
    />
  );
  return (
    <figure className={`min-w-0 ${className}`}>
      {telephone ? (
        // Cadre sobre : l'épaisseur d'un téléphone, sans encoche ni reflet.
        <div className="mx-auto w-full max-w-[22rem] rounded-[2rem] border-[10px] border-[#12151a] bg-[#12151a]">
          <div className="overflow-hidden rounded-[1.4rem]">{image}</div>
        </div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto border border-[var(--rule-strong)]">{image}</div>
      )}
      {!telephone && <p className="scroll-note field-tag field-tag--xs mt-3">Faites glisser la copie d&apos;écran →</p>}
      <figcaption className="field-tag rule-t mt-4 pt-3">{legende}</figcaption>
    </figure>
  );
}

/* ========================================================================== */
/* Ouverture                                                                  */
/* ========================================================================== */

const FICHE = [
  { k: "Destiné à", v: "Garages indépendants, 1 à 50 comptes" },
  { k: "Périmètre", v: "Réception → diagnostic → restitution" },
  { k: "Support", v: "Tablette d'atelier, ordinateur, téléphone" },
  { k: "Mise en route", v: "Environ 15 minutes" },
  { k: "Tarif", v: `À partir de ${formatPriceHt(PLANS.ATELIER)} HT par mois` },
  { k: "Essai", v: `${TRIAL_DAYS} jours, sans carte bancaire` },
];

const SOMMAIRE = [
  {
    n: "01",
    href: "#dossier",
    label: "Le dossier",
    note: "Ce que l'atelier a sous les yeux",
  },
  {
    n: "02",
    href: "#parcours",
    label: "Le parcours",
    note: "Huit étapes, treize statuts",
  },
  {
    n: "03",
    href: "#controle",
    label: "Le contrôle",
    note: "Dix-sept points, quatre états",
  },
  {
    n: "04",
    href: "#validation",
    label: "La validation",
    note: "La réponse écrite du client",
  },
  {
    n: "05",
    href: "#conditions",
    label: "Les conditions",
    note: "Comptes, prix, engagement",
  },
];

function Ouverture() {
  return (
    <section className="pb-20 pt-10 sm:pt-14">
      <Shell>
        <p className="field-tag rule-b flex flex-wrap items-baseline justify-between gap-2 pb-3">
          <span>Logiciel d&apos;atelier · Édition {new Date().getFullYear()}</span>
          <span>France · Sans intelligence artificielle</span>
        </p>

        <h1 className="display display-xl mt-10 max-w-[18ch]">
          L&apos;atelier sous contrôle, du client à <span className="mark-rule">la clé rendue</span>.
        </h1>

        <div className="mt-12 grid gap-12 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-6">
            <p className="measure text-xl leading-[1.5]">
              Un véhicule entre. Il est photographié, diagnostiqué, chiffré. Le client accepte ou refuse chaque ligne, par écrit. L&apos;atelier ne
              travaille que sur ce qui a été accepté.
            </p>
            <p className="measure mt-4 leading-relaxed text-[var(--ink-soft)]">
              Plus de devis perdus sur un coin d&apos;établi, plus de « je n&apos;avais pas dit oui pour ça ».
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link href="/register" className="action action--mark">
                {PRIMARY_CTA}
              </Link>
              <Link href="#parcours" className="link-arrow">
                Voir le parcours complet
                <span aria-hidden>↓</span>
              </Link>
            </div>
          </div>

          {/* Fiche technique, comme l'en-tête d'un ordre de réparation. */}
          <dl className="rule-t md:col-span-5 md:col-start-8">
            {FICHE.map((row) => (
              <div key={row.k} className="rule-b grid grid-cols-[7rem_1fr] gap-4 py-3 sm:grid-cols-[9rem_1fr]">
                <dt className="field-tag pt-0.5">{row.k}</dt>
                <dd className="text-sm leading-snug">{row.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Apercu
          className="mt-16"
          src={apercuDossier}
          largeurMobile="w-[64rem]"
          alt="Fiche d'un dossier d'intervention dans GarageFlow : plaque GH-123-KL, Peugeot 308, statut En réparation, client Jean Martin, 87 650 km, technicien Karim Benali, restitution prévue le 22/09 à 17:00. En dessous, les sept photos de réception, les trois constats du technicien avec leur niveau d'urgence, et la décision du client ligne par ligne pour un montant accepté de 285,00 € TTC."
          legende={<>Fig. 01 - Un dossier d&apos;intervention, tel qu&apos;il apparaît à l&apos;atelier. Copie d&apos;écran de l&apos;application, jeu de démonstration.</>}
        />

        {/* Sommaire du dossier */}
        <nav className="mt-20" aria-label="Sommaire">
          <p className="field-tag rule-b pb-2">Sommaire</p>
          <ul>
            {SOMMAIRE.map((s) => (
              <li key={s.n} className="rule-b">
                <Link href={s.href} className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-4 py-4 sm:grid-cols-[3.5rem_14rem_1fr]">
                  <span className="tech text-sm text-[var(--ink-soft)] group-hover:text-[var(--mark)]">{s.n}</span>
                  <span className="display text-xl group-hover:text-[var(--mark)]">{s.label}</span>
                  <span className="col-span-2 text-sm text-[var(--ink-soft)] sm:col-span-1">{s.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 01 · Le dossier - planche annotée                                          */
/* ========================================================================== */

/* Chaque note décrit un élément réellement visible sur la capture ci-contre.
   Le « repère » nomme ce qu'il faut y chercher : pas d'annotation posée sur
   l'image, qui se décalerait à la première recapture. */
const NOTES = [
  {
    n: "01",
    t: "Un couloir par étape",
    d: "Huit couloirs suivent l'ordre réel du travail, de la réception à la restitution. Un véhicule n'apparaît jamais à deux endroits.",
    r: "Couloirs 1 à 5",
  },
  {
    n: "02",
    t: "La plaque d'abord",
    d: "C'est ce qu'un compagnon cherche en entrant. Elle est en tête de carte, lisible à deux mètres.",
    r: "GT-654-HJ",
  },
  {
    n: "03",
    t: "Le retard saute aux yeux",
    d: "Passée l'heure promise, la carte prend un liseré rouge et le repère « Retard ». Le compteur en tête rassemble les dossiers concernés.",
    r: "2 en retard",
  },
  {
    n: "04",
    t: "Qui a la voiture",
    d: "Technicien et heure de restitution promise sur chaque carte. Le filtre en tête isole les dossiers d'un compagnon.",
    r: "Karim Benali · 3",
  },
];

function Dossier() {
  return (
    <section className="public-dark py-20 sm:py-28">
      <Shell>
        <Chapter
          n="01"
          icon={LayoutGrid}
          id="dossier"
          title="Ce que l'atelier a sous les yeux"
          standfirst="Un seul écran pour la journée. Il tient sur la tablette accrochée au mur et se lit depuis le pont."
        />

        <div className="mt-14 grid gap-12 md:grid-cols-12 md:gap-10">
          {/* Notes en marge */}
          <ol className="order-2 md:order-1 md:col-span-4">
            {NOTES.map((note) => (
              <li key={note.n} className="rule-b grid grid-cols-[2.5rem_1fr] gap-4 py-4 first:pt-0">
                <span className="callout mt-0.5">{note.n}</span>
                <div>
                  <p className="display display-m">{note.t}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-soft)]">{note.d}</p>
                  <p className="field-tag field-tag--xs mt-2">
                    Repère <span className="tech ml-1.5 normal-case tracking-normal text-[var(--ink)]">{note.r}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Apercu
            className="order-1 md:order-2 md:col-span-7 md:col-start-6"
            src={apercuAtelier}
            alt="Tableau d'atelier de GarageFlow : quatre compteurs en tête (6 véhicules en cours, 2 en retard, 1 en attente client, 1 prêt à restituer), un filtre par technicien, puis les couloirs À diagnostiquer, Diagnostic, Attente client, Attente pièces et À réparer. Chaque carte porte la plaque, le numéro de dossier, le véhicule, le client, le motif, le technicien et l'heure de restitution promise."
            legende={
              <>
                Fig. 02 - Le tableau d&apos;atelier. Copie d&apos;écran de l&apos;application, jeu de démonstration. Six véhicules en cours ; les cinq premiers couloirs sur huit
                sont visibles.
              </>
            }
          />
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 02 · Le parcours                                                           */
/* ========================================================================== */

const ETAPES = [
  {
    h: "08:05",
    n: "01",
    t: "Réception",
    d: "Client, véhicule, kilométrage, motif. Photos sous tous les angles : les rayures déjà là sont actées avant l’entrée.",
    inset: "plate" as const,
  },
  {
    h: "08:20",
    n: "02",
    t: "Diagnostic",
    d: "Le technicien saisit ses constats, avec un niveau d’urgence et des photos. Rien n’est généré automatiquement.",
  },
  {
    h: "09:10",
    n: "03",
    t: "Contrôle",
    d: "Dix-sept points imposés. Chacun reçoit un état, et si besoin un commentaire et une photo.",
  },
  {
    h: "10:35",
    n: "04",
    t: "Proposition",
    d: "Pièces, main-d’œuvre, TVA, total. Les montants sont calculés au centime, jamais en virgule flottante.",
    inset: "prix" as const,
  },
  {
    h: "10:50",
    n: "05",
    t: "Validation client",
    d: "Un lien personnel part au client. Il accepte ou refuse, ligne par ligne. Sa réponse est horodatée et verrouillée.",
  },
  {
    h: "13:15",
    n: "06",
    t: "Réparation",
    d: "L'atelier ne voit que les lignes acceptées. Chacune est cochée quand elle est faite.",
  },
  {
    h: "16:40",
    n: "07",
    t: "Contrôle final",
    d: "Essai routier, niveaux, voyants, outils retirés. Sans ce contrôle, le véhicule ne passe pas « prêt ».",
  },
  {
    h: "17:25",
    n: "08",
    t: "Restitution",
    d: "Travaux réalisés, refusés, montant final, kilométrage de sortie. Le refus d’aujourd’hui sert au prochain passage.",
  },
];

const STATUS_ORDER = Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[];

function Parcours() {
  return (
    <section className="py-20 sm:py-28">
      <Shell>
        <Chapter
          n="02"
          icon={Route}
          id="parcours"
          title="Une journée, huit étapes"
          standfirst="Le serveur vérifie chaque passage d'une étape à l'autre. On ne saute pas le contrôle final, on ne répare pas ce qui n'a pas été accepté."
        />

        <ol className="mt-14">
          {ETAPES.map((e) => (
            <li key={e.n} className="rule-b grid grid-cols-[3.5rem_1fr] gap-x-5 gap-y-2 py-7 first:border-t first:border-[var(--rule)] md:grid-cols-12 md:gap-8">
              <span className="tech pt-1 text-sm text-[var(--ink-soft)] md:col-span-1">{e.h}</span>
              <h3 className="display display-m md:col-span-4 md:col-start-2">
                <span className="mark tech mr-3 text-sm" aria-hidden>
                  {e.n}
                </span>
                {e.t}
              </h3>
              <div className="col-span-2 md:col-span-6 md:col-start-7">
                <p className="measure leading-relaxed text-[var(--ink-soft)]">{e.d}</p>
                {e.inset === "plate" && (
                  <p className="mt-4 flex flex-wrap items-center gap-3">
                    <PlateFr value="GH-123-KL" className="text-xs" />
                    <span className="tech text-xs text-[var(--ink-soft)]">87 650 km · entrée 08:05</span>
                  </p>
                )}
                {e.inset === "prix" && (
                  <dl className="rule-t mt-4 max-w-sm">
                    {[
                      ["Pièces HT", "62,50 €"],
                      ["Main-d'œuvre HT", "83,33 €"],
                      ["TVA 20 %", "29,17 €"],
                    ].map(([k, v]) => (
                      <div key={k} className="leader py-1.5">
                        <dt className="field-tag">{k}</dt>
                        <dd className="leader__fill" aria-hidden />
                        <dd className="tech text-sm">{v}</dd>
                      </div>
                    ))}
                    <div className="leader py-1.5">
                      <dt className="field-tag text-[var(--ink)]">Total TTC</dt>
                      <dd className="leader__fill" aria-hidden />
                      <dd className="tech text-sm font-semibold">175,00 €</dd>
                    </div>
                  </dl>
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* Échelle des statuts */}
        <div className="mt-16">
          <p className="field-tag rule-b flex items-baseline justify-between pb-2">
            <span>Échelle des statuts</span>
            <span>{STATUS_ORDER.length} positions</span>
          </p>
          <p className="scroll-note field-tag field-tag--xs mt-3">Faites glisser l’échelle →</p>
          <div className="scrollbar-thin overflow-x-auto pt-5">
            <ol
              className="grid min-w-[56rem] gap-px"
              style={{
                gridTemplateColumns: `repeat(${STATUS_ORDER.length}, minmax(0, 1fr))`,
              }}
            >
              {STATUS_ORDER.map((key, i) => (
                <li key={key} className="relative pl-2">
                  <span className={`absolute left-0 top-0 h-3 w-px ${i === 0 ? "bg-[var(--mark)]" : "bg-[var(--rule-strong)]"}`} aria-hidden />
                  <span className="tech block text-[0.6875rem] text-[var(--ink-soft)]">{String(i + 1).padStart(2, "0")}</span>
                  <span className="mt-1 block pr-2 text-[0.75rem] leading-tight">{STATUS_LABELS[key]}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <Apercu
          className="mt-16"
          src={apercuStatuts}
          legende={<>Fig. 03 - Les dossiers en cours, chacun à sa position dans l&apos;échelle ci-dessus. Copie d&apos;écran de l&apos;application, jeu de démonstration.</>}
          alt="Liste des dossiers d'intervention dans GarageFlow. Six lignes, chacune avec son numéro de dossier, sa plaque, son véhicule, son client, son technicien, la date promise et son statut : Véhicule prêt, Contrôle final, Réceptionné, Attente pièces, Attente client, En réparation."
        />
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 03 · Le contrôle - feuille d'inspection                                    */
/* ========================================================================== */

/** États attribués pour la reproduction de feuille : mêmes libellés que le produit. */
const ETATS: Record<string, string> = {
  TIRE_FL: "OK",
  TIRE_FR: "OK",
  TIRE_RL: "À surveiller",
  TIRE_RR: "À surveiller",
  BRAKE_PADS_FRONT: "Urgent",
  BRAKE_PADS_REAR: "OK",
  BRAKE_DISCS_FRONT: "OK",
  BRAKE_DISCS_REAR: "OK",
  ENGINE_OIL: "Recommandé",
  ENGINE_LEAKS: "OK",
  ENGINE_COOLING: "OK",
  ENGINE_BATTERY: "OK",
  VIS_WINDSHIELD: "OK",
  VIS_WIPERS: "À surveiller",
  LIGHT_HEADLIGHTS: "OK",
  LIGHT_INDICATORS: "OK",
  LIGHT_BRAKE: "OK",
};

function Controle() {
  return (
    <section className="py-20 sm:py-28">
      <Shell>
        <Chapter
          n="03"
          icon={ClipboardCheck}
          id="controle"
          title="La feuille de contrôle"
          standfirst="Dix-sept points imposés, toujours les mêmes. Ce qui n'a pas été regardé reste marqué « non contrôlé » : c'est une information, pas un oubli."
        />

        <div className="mt-14 grid gap-12 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-8">
            <div className="rule-heavy flex flex-wrap items-baseline justify-between gap-3 pt-3">
              <p className="display display-m">Contrôle véhicule</p>
              <p className="tech text-xs text-[var(--ink-soft)]">OR 2026-0001 · GH-123-KL · 87 650 km · 09:10</p>
            </div>

            <div className="mt-6 sm:columns-2 sm:gap-x-12">
              {CHECKLIST_SECTIONS.map((section) => (
                <div key={section.section} className="mb-8 break-inside-avoid">
                  <p className="field-tag rule-b pb-1.5">{section.section}</p>
                  <ul className="mt-2">
                    {section.items.map((item) => {
                      const etat = ETATS[item.key] ?? "Non contrôlé";
                      const alerte = etat === "Urgent" || etat === "Recommandé";
                      return (
                        <li key={item.key} className="leader py-1.5 text-sm">
                          <span>{item.label}</span>
                          <span className="leader__fill" aria-hidden />
                          <span className={`tech flex items-center gap-1.5 text-[0.75rem] uppercase tracking-[0.06em] ${alerte ? "mark font-semibold" : "text-[var(--ink-soft)]"}`}>
                            {/* Sur une feuille de dix-sept lignes, la couleur seule
                                ne suffit pas à retrouver ce qui demande une action. */}
                            {alerte && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                            {etat}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <aside className="rule-t pt-5 md:col-span-3 md:col-start-10">
            <p className="field-tag">Lecture</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              Cinq niveaux d&apos;urgence, du simple constat au critique. Ils suivent le point jusque dans la proposition envoyée au client, qui voit donc
              la même hiérarchie que l&apos;atelier.
            </p>
            <ul className="rule-t mt-5 pt-3">
              {["Information", "À surveiller", "Recommandé", "Urgent", "Critique"].map((u, i) => (
                <li key={u} className="tech flex items-baseline gap-3 py-1 text-xs">
                  <span className="text-[var(--ink-soft)]">{String(i + 1).padStart(2, "0")}</span>
                  <span className={i >= 3 ? "mark" : ""}>{u}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <Apercu
          className="mt-16"
          src={apercuControle}
          legende={
            <>Fig. 04 - La même feuille dans l&apos;application : un état par point, la mesure relevée, une photo si nécessaire. Copie d&apos;écran, jeu de démonstration.</>
          }
          alt="Feuille de contrôle véhicule dans GarageFlow. Colonne Pneus et colonne Freins. Pour chaque point, cinq états au choix : OK, À surveiller, Recommandé, Urgent, Non contrôlé. Les plaquettes avant sont marquées Urgent avec la mesure 2 mm, les pneus arrière À surveiller avec 3 mm, les plaquettes arrière OK avec 7 mm. Un bouton Photo accompagne chaque point renseigné."
        />
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 04 · La validation                                                         */
/* ========================================================================== */

/* Reprise fidèle de la décision réellement enregistrée sur le dossier
   D-2026-0001 du jeu de démonstration, visible sur la copie d'écran ci-contre.
   Ne pas inventer de montants ici : les deux doivent concorder. */
const LIGNES = [
  {
    t: "Remplacement plaquettes de frein avant",
    u: "Urgent",
    p: "175,00 €",
    d: "Accepté",
  },
  { t: "Vidange huile + filtre", u: "Recommandé", p: "110,00 €", d: "Accepté" },
  {
    t: "Balais d'essuie-glace avant",
    u: "À surveiller",
    p: "45,48 €",
    d: "Refusé",
  },
];

function Validation() {
  return (
    <section className="py-20 sm:py-28">
      <Shell>
        <Chapter
          n="04"
          icon={PenLine}
          id="validation"
          title="La réponse du client, par écrit"
          standfirst="C'est la pièce qui manque à la plupart des ateliers : une trace de l'accord, ligne par ligne, datée."
        />

        {/* Deux colonnes : à gauche ce que l'atelier conserve, à droite ce que
            le client a réellement eu sous les yeux. */}
        <div className="mt-14 grid gap-14 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-7">
            <p className="text-xl leading-[1.55]">
              Le client reçoit un lien. Il voit le diagnostic, les photos, le détail des prix. Il coche ce qu&apos;il autorise.
            </p>
            <blockquote className="rule-l mt-8 py-1 pl-5">
              <p className="display display-m">« Les essuie-glaces, je les ferai moi-même. »</p>
              <footer className="field-tag mt-3">Commentaire joint à la réponse, conservé dans le dossier</footer>
            </blockquote>
            <ul className="rule-t mt-8 pt-2">
              {[
                ["Aucun compte à créer", "Ni inscription, ni application à installer."],
                ["Acceptation partielle", "Il valide une ligne, refuse l'autre. L'atelier sait quoi faire."],
                ["Verrouillé après réponse", "Une proposition validée ne bouge plus. Pour changer, on crée une version."],
                ["Lien à durée limitée", "Jeton aléatoire, expiration configurable, révocable depuis le dossier."],
              ].map(([t, d]) => (
                <li key={t} className="rule-b py-3.5">
                  <p className="font-semibold">{t}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-[var(--ink-soft)]">{d}</p>
                </li>
              ))}
            </ul>

            {/* Pièce jointe : la réponse telle qu'elle est archivée */}
            <figure className="mt-14 max-w-xl">
              <div className="relative border border-[var(--rule-strong)] bg-white">
                <div className="rule-b flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
                  <span className="field-tag">Pièce jointe · Réponse client</span>
                  <span className="tech text-[0.7rem] text-[var(--ink-soft)]">OR 2026-0001 · v1</span>
                </div>

                <div className="px-5 pb-12 pt-4">
                  <p className="tech text-xs text-[var(--ink-soft)]">Jean Martin · Peugeot 308</p>

                  <ul className="mt-4">
                    {LIGNES.map((l) => (
                      <li key={l.t} className="rule-b grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-3.5 first:border-t first:border-[var(--rule)]">
                        <p className={`font-semibold ${l.d === "Refusé" ? "text-[var(--ink-soft)] line-through" : ""}`}>{l.t}</p>
                        <p className="tech text-sm">{l.p}</p>
                        <p className="field-tag">{l.u}</p>
                        {/* Décision : le pictogramme double le mot, il ne le remplace pas. */}
                        <p
                          className={`tech flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.1em] ${l.d === "Accepté" ? "mark font-semibold" : "text-[var(--ink-soft)]"}`}
                        >
                          {l.d === "Accepté" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                          {l.d}
                        </p>
                      </li>
                    ))}
                  </ul>

                  <div className="leader mt-5">
                    <span className="field-tag text-[var(--ink)]">Montant accepté</span>
                    <span className="leader__fill" aria-hidden />
                    <span className="tech text-lg font-semibold">285,00 € TTC</span>
                  </div>

                  <div className="rule-t mt-6 grid grid-cols-2 gap-6 pt-4">
                    <div>
                      <p className="field-tag">Signé</p>
                      <p className="mt-1 text-sm">Jean Martin</p>
                    </div>
                    <div>
                      <p className="field-tag">Version</p>
                      <p className="tech mt-1 text-sm">v1, verrouillée</p>
                    </div>
                  </div>
                </div>

                <span className="stamp absolute -bottom-4 right-6 bg-white">Accepté partiel</span>
              </div>
              <figcaption className="field-tag rule-t mt-9 pt-3">
                Fig. 06 - Reproduction de la pièce archivée dans le dossier. L&apos;horodatage et l&apos;adresse IP y sont également conservés.
              </figcaption>
            </figure>
          </div>

          <Apercu
            telephone
            className="md:col-span-4 md:col-start-9 md:self-start"
            src={apercuClient}
            legende={<>Fig. 05 - Le lien reçu par le client, sur son téléphone. Copie d&apos;écran de l&apos;application, jeu de démonstration.</>}
            alt="Écran de validation reçu par le client sur son téléphone. En-tête du garage avec téléphone et adresse, puis « Bonjour Jean Martin », la Peugeot 308 GH-123-KL, 87 650 km, le motif de la visite. Le diagnostic du technicien liste trois constats avec leur niveau d'urgence et une photo. En bas, la réponse enregistrée et le détail des lignes acceptées et refusée."
          />
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 05 · Les conditions                                                        */
/* ========================================================================== */

function Conditions() {
  const rows = [
    {
      plan: `Essai ${TRIAL_DAYS} jours`,
      seats: `${PLANS.ATELIER.seats}`,
      commit: "Sans carte bancaire",
      price: "0 €",
    },
    {
      plan: PLANS.ATELIER.name,
      seats: `${PLANS.ATELIER.seats}`,
      commit: "Sans engagement",
      price: formatPriceHt(PLANS.ATELIER),
    },
    {
      plan: PLANS.RESEAU.name,
      seats: `${PLANS.RESEAU.seats}`,
      commit: "Sans engagement",
      price: formatPriceHt(PLANS.RESEAU),
    },
  ];

  return (
    <section className="py-20 sm:py-28">
      <Shell>
        <Chapter
          n="05"
          icon={Receipt}
          id="conditions"
          title="Un prix par garage, pas par dossier"
          standfirst="Dossiers, photos et diagnostics illimités dans les deux cas. Ce qui change, c'est le nombre de comptes ouverts."
        />

        <div className="mt-14 grid gap-12 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-8">
            {/* Sous 640px, les lignes s'empilent en fiches ; les rôles ARIA
                explicites conservent la sémantique de tableau. */}
            <table className="ledger" role="table">
              <caption className="sr-only">Tarifs GarageFlow</caption>
              <thead role="rowgroup">
                <tr className="field-tag" role="row">
                  <th scope="col" role="columnheader">
                    Formule
                  </th>
                  <th scope="col" role="columnheader">
                    Comptes actifs
                  </th>
                  <th scope="col" role="columnheader">
                    Engagement
                  </th>
                  <th scope="col" role="columnheader">
                    Prix HT / mois
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {rows.map((r) => (
                  <tr key={r.plan} role="row">
                    <th scope="row" role="rowheader" className="display text-xl font-bold">
                      {r.plan}
                    </th>
                    <td role="cell" className="tech text-sm">
                      <span className="cell-tag field-tag field-tag--xs">Comptes</span>
                      {r.seats}
                    </td>
                    <td role="cell" className="text-sm text-[var(--ink-soft)]">
                      <span className="cell-tag field-tag field-tag--xs">Engagement</span>
                      {r.commit}
                    </td>
                    <td role="cell" className="tech whitespace-nowrap text-lg font-semibold">
                      <span className="cell-tag field-tag field-tag--xs">Prix HT / mois</span>
                      {r.price}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-9">
              <Link href="/register" className="action action--mark">
                {PRIMARY_CTA}
              </Link>
            </p>
          </div>

          <aside className="rule-t pt-5 md:col-span-3 md:col-start-10">
            <p className="field-tag">À la fin de l&apos;essai</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              Rien n&apos;est supprimé. Les dossiers restent consultables et exportables au format JSON. Seule la création de nouvelles données est
              suspendue tant qu&apos;aucun abonnement n&apos;est choisi.
            </p>
          </aside>
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* Annexe · Questions                                                         */
/* ========================================================================== */

const QUESTIONS = [
  { q: "Faut-il installer un logiciel ?", r: "Non. GarageFlow fonctionne dans le navigateur, sur ordinateur, tablette et smartphone. L'application peut être ajoutée à l'écran d'accueil d'une tablette d'atelier." },
  { q: "Mes clients doivent-ils créer un compte ?", r: "Jamais. Ils reçoivent un lien personnel, valable quelques jours, qui leur montre le diagnostic et les travaux proposés. Ils répondent en deux clics." },
  { q: "Combien de temps pour démarrer ?", r: "Le temps de créer votre garage et d'ajouter votre équipe, soit une quinzaine de minutes. Le premier véhicule peut être réceptionné dans la foulée." },
  { q: "Que deviennent mes données si j'arrête ?", r: "Elles restent consultables et vous pouvez les exporter au format JSON depuis les paramètres, à tout moment, y compris après la fin de l'essai." },
  { q: "Les photos sont-elles protégées ?", r: "Elles ne sont jamais accessibles par une adresse devinable : chaque affichage passe par un lien signé qui expire au bout de quinze minutes." },
  { q: "Y a-t-il de l'intelligence artificielle ?", r: "Non, et c'est volontaire. Le diagnostic est saisi par le technicien. Aucun constat, aucun prix n'est généré automatiquement." },
];

function Annexe() {
  return (
    <section className="py-20 sm:py-28">
      <Shell>
        <div className="rule-heavy pt-5">
          <p className="field-tag">
            <span className="mark">Annexe</span>
          </p>
          <h2 className="display display-l mt-3">Questions posées en atelier</h2>
        </div>

        <div className="mt-14 md:columns-2 md:gap-14">
          {QUESTIONS.map((item, i) => (
            <article key={item.q} className="mb-9 break-inside-avoid">
              <p className="tech text-xs text-[var(--ink-soft)]">Q.{String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-1.5 text-lg font-bold leading-snug">{item.q}</h3>
              <p className="mt-2 leading-relaxed text-[var(--ink-soft)]">{item.r}</p>
            </article>
          ))}
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* Clôture                                                                    */
/* ========================================================================== */

function Cloture() {
  return (
    <section className="pb-16 pt-12 sm:pb-20 sm:pt-16">
      <Shell>
        <div className="rule-heavy grid gap-10 pt-5 md:grid-cols-12 md:gap-10">
          <div className="md:col-span-7">
            <p className="field-tag">
              <span className="mark">Bon pour accord</span>
            </p>
            <p className="display display-l mt-4 max-w-[20ch]">Le prochain véhicule qui entre, suivez-le jusqu&apos;au bout.</p>
            <p className="measure mt-5 leading-relaxed text-[var(--ink-soft)]">
              Créez votre garage, ajoutez votre équipe, réceptionnez un véhicule aujourd&apos;hui. {TRIAL_DAYS} jours, sans carte bancaire.
            </p>
            <p className="mt-9">
              <Link href="/register" className="action action--mark">
                {PRIMARY_CTA}
              </Link>
            </p>
          </div>

          <div className="self-end md:col-span-4 md:col-start-9">
            <div className="grid grid-cols-2 gap-6">
              <div className="rule-b pb-1">
                <span className="field-tag">Date</span>
              </div>
              <div className="rule-b pb-1">
                <span className="field-tag">Signature</span>
              </div>
            </div>
            <p className="tech mt-4 text-xs text-[var(--ink-soft)]">Déjà client ? <Link href="/login" className="underline">Connexion</Link></p>
          </div>
        </div>
      </Shell>
    </section>
  );
}
