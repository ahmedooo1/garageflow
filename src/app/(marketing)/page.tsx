import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Check, X } from "lucide-react";
import apercuAtelier from "./apercu-atelier.png";
import apercuClient from "./apercu-client.png";
import apercuControle from "./apercu-controle.png";
import apercuDossier from "./apercu-dossier.png";
import apercuStatuts from "./apercu-statuts.png";
import { CHECKLIST_ITEMS, CHECKLIST_SECTIONS, STATUS_LABELS } from "@/lib/labels";
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
      <Chiffres />
      <Promesse />
      <Atelier />
      <Parcours />
      <Controle />
      <Validation />
      <Tarifs />
      <Questions />
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

/** Repère de section : numéro orange, intitulé en capitales mono. */
function Kicker({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <p className="field-tag flex items-center gap-3">
      <span className="mark font-semibold">{n}</span>
      <span className="h-px w-8 bg-[var(--rule-strong)]" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function CtaPrincipal({ className = "" }: { className?: string }) {
  return (
    <Link href="/register" className={`action action--mark action--xl ${className}`}>
      {PRIMARY_CTA}
      <span className="action__arrow" aria-hidden>
        →
      </span>
    </Link>
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

/* 68 plutôt que 75 : sur ces captures, 15 % de poids en moins pour une
   différence invisible à la taille d'affichage (vérifié à l'agrandissement).
   La valeur doit rester déclarée dans images.qualities de next.config.ts. */
const QUALITE = 68;

/** Capture posée sur son bloc orange décalé. */
function Plan({
  src,
  alt,
  sizes,
  preload = false,
  flip = false,
  className = "",
  imageClassName = "block w-full",
}: {
  src: StaticImageData;
  alt: string;
  sizes: string;
  preload?: boolean;
  flip?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <div className={`stage-shot ${flip ? "stage-shot--flip" : ""} ${className}`}>
      <div className="stage-shot__frame">
        <Image src={src} alt={alt} sizes={sizes} quality={QUALITE} preload={preload} loading={preload ? "eager" : undefined} className={imageClassName} />
      </div>
    </div>
  );
}

function Telephone({ className = "", sizes = "20rem" }: { className?: string; sizes?: string }) {
  return (
    <div className={`phone ${className}`}>
      <div>
        <Image
          src={apercuClient}
          sizes={sizes}
          quality={QUALITE}
          className="block w-full"
          alt="Écran de validation reçu par le client sur son téléphone. En-tête du garage, puis « Bonjour Jean Martin », la Peugeot 308 GH-123-KL, 87 650 km, le motif de la visite. Le diagnostic du technicien liste trois constats avec leur niveau d'urgence et une photo. En bas, la réponse enregistrée : deux lignes acceptées, une refusée, 285,00 € TTC acceptés."
        />
      </div>
    </div>
  );
}

/* Bord ondulé et incliné entre deux sections : la vague prend la couleur de
   la section voisine, un filet d'accent suit sa crête. « haut » se place en
   tête de section, « bas » en pied (vague retournée). */
const VAGUE = "C1320,62 1200,-2 1080,34 C960,76 840,12 720,52 C600,94 480,30 360,70 C240,110 120,52 0,94";

function Vague({ couleur, accent = "#d2510c", position = "haut" }: { couleur: string; accent?: string; position?: "haut" | "bas" }) {
  return (
    <svg
      className={`block h-14 w-full sm:h-24 lg:h-28 ${position === "bas" ? "-scale-100" : ""}`}
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`M1440,20 ${VAGUE}`} fill="none" stroke={accent} strokeWidth={5} vectorEffect="non-scaling-stroke" transform="translate(0 14)" />
      <path d={`M0,0 H1440 V20 ${VAGUE} Z`} fill={couleur} />
    </svg>
  );
}

function Legende({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`field-tag field-tag--xs ${className}`}>{children}</p>;
}

/* ========================================================================== */
/* Ouverture                                                                  */
/* ========================================================================== */

const STATUS_ORDER = Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[];

function Ouverture() {
  return (
    <section className="public-night relative overflow-hidden">
      <Shell className="pt-12 sm:pt-20">
        <p className="field-tag flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="mark font-semibold">Logiciel d&apos;atelier</span>
          <span>Garages indépendants</span>
          <span className="hidden sm:inline">Édité en France</span>
        </p>

        <h1 className="display-hero mt-7 sm:mt-9">
          L&apos;atelier <br className="hidden sm:block" />
          <span className="mark">sous contrôle.</span>
        </h1>

        <div className="mt-10 grid grid-cols-1 gap-14 pb-24 md:mt-14 md:grid-cols-12 md:gap-8 md:pb-32">
          <div className="md:col-span-5 xl:col-span-4">
            <p className="text-xl leading-[1.45] sm:text-[1.375rem]">
              Réception photo, diagnostic, devis ligne par ligne. Le client répond par écrit depuis son téléphone. L&apos;atelier ne répare que ce qui a été
              accepté.
            </p>

            <div className="mt-9 flex flex-col items-start gap-5">
              <CtaPrincipal />
              <Link href="#parcours" className="link-arrow">
                Voir une journée d&apos;atelier
                <span aria-hidden>↓</span>
              </Link>
            </div>

            <dl className="rule-t mt-11 grid grid-cols-3 gap-4 pt-4">
              {[
                [`${TRIAL_DAYS} j`, "d'essai, sans carte"],
                [`${PLANS.ATELIER.priceHt} €`, "HT par mois"],
                ["15 min", "pour démarrer"],
              ].map(([v, k]) => (
                <div key={k}>
                  <dt className="sr-only">{k}</dt>
                  <dd className="display text-2xl">{v}</dd>
                  <dd className="field-tag field-tag--xs mt-1.5 normal-case tracking-normal">{k}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Scène : le tableau d'atelier déborde à droite, le téléphone du
              client passe devant. L'image est rognée par la section, jamais
              par un défilement horizontal de la page. */}
          <div className="relative min-h-[22rem] sm:min-h-[30rem] md:col-span-7 md:col-start-6 xl:col-span-8 xl:col-start-5">
            <Plan
              preload
              className="w-[44rem] sm:w-[58rem] lg:w-[68rem]"
              src={apercuAtelier}
              sizes="(min-width: 1024px) 68rem, (min-width: 640px) 58rem, 44rem"
              alt="Tableau d'atelier de GarageFlow : six véhicules en cours, deux en retard, un en attente client, un prêt à restituer. Couloirs À diagnostiquer, Diagnostic, Attente client, Attente pièces et À réparer, une carte par véhicule avec sa plaque, son client, son motif, son technicien et l'heure promise."
            />
            <Telephone
              sizes="(min-width: 640px) 15rem, 10rem"
              className="absolute -bottom-24 right-4 w-[8.5rem] sm:-bottom-16 sm:w-[11rem] md:left-[14rem] md:right-auto md:w-[14rem] lg:left-[16rem] xl:left-[30rem]"
            />
            <span className="stamp absolute left-6 top-[-1.25rem] hidden bg-[var(--paper)] sm:inline-block">
              Accord client écrit
            </span>
          </div>
        </div>
      </Shell>

      <Vague couleur="#f4f3f0" position="bas" />
    </section>
  );
}

/* ========================================================================== */
/* Chiffres - uniquement ce que le produit fait réellement                    */
/* ========================================================================== */

function Chiffres() {
  const chiffres = [
    { n: "08", t: "étapes", d: "De la réception à la clé rendue, dans l'ordre réel du travail." },
    { n: String(CHECKLIST_ITEMS.length), t: "points de contrôle", d: "Toujours les mêmes, pour chaque véhicule, sur tablette." },
    { n: String(STATUS_ORDER.length), t: "statuts vérifiés", d: "Le serveur refuse les sauts d'étape. Pas de réparation sans accord." },
    { n: "1", t: "lien pour le client", d: "Il valide le devis depuis son téléphone, sans compte ni application." },
  ];

  return (
    <section className="py-20 sm:py-28" aria-labelledby="chiffres-titre">
      <Shell>
        <h2 id="chiffres-titre" className="sr-only">
          GarageFlow en chiffres
        </h2>
        <ul className="grid grid-cols-1 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
          {chiffres.map((c, i) => (
            <li key={c.t} className={`border-[var(--rule)] sm:pr-8 lg:pl-8 ${i > 0 ? "lg:border-l" : "lg:pl-0"} ${i % 2 === 1 ? "sm:border-l sm:pl-8" : ""}`}>
              <p className={`figure-xxl text-[clamp(5rem,2rem+8vw,9.5rem)] ${i === 3 ? "mark" : "figure-outline"}`}>{c.n}</p>
              <p className="display display-m mt-5">{c.t}</p>
              <p className="mt-2 max-w-[30ch] text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">{c.d}</p>
            </li>
          ))}
        </ul>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* Promesse - la phrase que l'atelier n'entendra plus                         */
/* ========================================================================== */

function Promesse() {
  return (
    <section className="rule-t py-20 sm:py-28">
      <Shell>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-8">
          <p className="field-tag md:col-span-3 md:pt-4">Au comptoir, avant</p>
          <div className="md:col-span-9">
            <p className="display-shout">
              « <span className="strike">Je n&apos;avais pas dit oui pour ça.</span> »
            </p>
            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-12">
              <p className="text-xl leading-[1.5]">
                Avec GarageFlow, chaque ligne du devis porte la réponse du client : acceptée ou refusée, datée, verrouillée.
              </p>
              <p className="leading-relaxed text-[var(--ink-soft)]">
                Plus de devis perdu sur un coin d&apos;établi, plus d&apos;accord donné au téléphone dont personne ne se souvient. La discussion au comptoir
                s&apos;appuie sur une pièce écrite, photos à l&apos;appui.
              </p>
            </div>
          </div>
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 01 · L'atelier - planche annotée                                           */
/* ========================================================================== */

/* Chaque note décrit un élément réellement visible sur la capture. */
const NOTES = [
  { n: "01", t: "Un couloir par étape", d: "Les couloirs suivent l'ordre réel du travail. Un véhicule n'apparaît jamais à deux endroits." },
  { n: "02", t: "La plaque d'abord", d: "C'est ce qu'un compagnon cherche en entrant. En tête de carte, lisible à deux mètres." },
  { n: "03", t: "Le retard saute aux yeux", d: "Passée l'heure promise, la carte prend un liseré rouge. Le compteur rassemble les dossiers concernés." },
  { n: "04", t: "Qui a la voiture", d: "Technicien et heure promise sur chaque carte. Un filtre isole les dossiers d'un compagnon." },
];

function Atelier() {
  return (
    <section id="atelier" className="public-dark scroll-mt-16 overflow-hidden py-20 sm:py-32">
      <Shell>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="md:col-span-7">
            <Kicker n="01">Le tableau d&apos;atelier</Kicker>
            <h2 className="display-shout mt-6">Toute la journée sur un seul écran.</h2>
          </div>
          <p className="self-end text-lg leading-relaxed text-[var(--ink-soft)] md:col-span-4 md:col-start-9">
            Il tient sur la tablette accrochée au mur et se lit depuis le pont. Chacun sait quelle voiture attend quoi, sans passer par le bureau.
          </p>
        </div>

        {/* Pleine largeur, débordant à gauche : sur mobile, l'image est rognée
            plutôt que réduite au point d'être illisible. */}
        <Plan
          flip
          className="mt-16 w-[46rem] sm:w-[60rem] md:w-auto"
          src={apercuAtelier}
          sizes="(min-width: 768px) 84rem, 60rem"
          alt="Tableau d'atelier de GarageFlow : quatre compteurs en tête (6 véhicules en cours, 2 en retard, 1 en attente client, 1 prêt à restituer), un filtre par technicien, puis les couloirs À diagnostiquer, Diagnostic, Attente client, Attente pièces et À réparer."
        />

        <Legende className="mt-8">Tableau d&apos;atelier · copie d&apos;écran de l&apos;application, jeu de démonstration</Legende>

        <ol className="mt-16 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {NOTES.map((note) => (
            <li key={note.n} className="rule-t pt-5">
              <span className="callout">{note.n}</span>
              <p className="display display-m mt-4">{note.t}</p>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">{note.d}</p>
            </li>
          ))}
        </ol>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 02 · Le parcours - pointeuse                                               */
/* ========================================================================== */

const ETAPES = [
  { h: "08:05", t: "Réception", d: "Client, véhicule, kilométrage, motif. Photos sous tous les angles : les rayures déjà là sont actées." },
  { h: "08:20", t: "Diagnostic", d: "Le technicien saisit ses constats, avec un niveau d'urgence et des photos." },
  { h: "09:10", t: "Contrôle", d: "Dix-sept points imposés. Chacun reçoit un état, un commentaire, une photo si besoin." },
  { h: "10:35", t: "Proposition", d: "Pièces, main-d'œuvre, TVA. Les montants sont calculés au centime près." },
  { h: "10:50", t: "Validation", d: "Un lien part au client. Il accepte ou refuse chaque ligne. Sa réponse est horodatée." },
  { h: "13:15", t: "Réparation", d: "L'atelier ne voit que les lignes acceptées et coche chacune une fois faite." },
  { h: "16:40", t: "Contrôle final", d: "Essai routier, niveaux, voyants. Sans lui, le véhicule ne passe pas « prêt »." },
  { h: "17:25", t: "Restitution", d: "Travaux faits, refusés, montant final. Le refus d'aujourd'hui sert au prochain passage." },
];

function Parcours() {
  return (
    <section id="parcours" className="scroll-mt-16 py-20 sm:py-32">
      <Shell>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="md:col-span-12">
            <Kicker n="02">Le parcours</Kicker>
            <h2 className="display-shout mt-6">
              08:05, la voiture entre. <br className="hidden lg:block" />
              <span className="mark">17:25, la clé est rendue.</span>
            </h2>
          </div>
        </div>

        {/* Pointeuse : l'heure en grand, l'étape, puis le détail. Deux rangées
            de quatre sur grand écran, une colonne continue sur téléphone. */}
        <ol className="mt-16 grid grid-cols-1 border-t-2 border-[var(--ink)] sm:grid-cols-2 lg:grid-cols-4">
          {ETAPES.map((e, i) => (
            <li
              key={e.h}
              className={`group rule-b py-7 transition-colors hover:bg-[var(--paper-2)] sm:px-6 ${i % 2 === 1 ? "sm:border-l sm:border-l-[var(--rule)]" : ""} ${i % 4 !== 0 ? "lg:border-l lg:border-l-[var(--rule)]" : "lg:border-l-0"} ${i % 4 === 0 ? "sm:pl-0" : ""}`}
            >
              <p className="flex items-baseline justify-between gap-4">
                <span className="tech text-3xl font-semibold tracking-tight group-hover:text-[var(--mark)] sm:text-4xl">{e.h}</span>
                <span className="tech text-xs text-[var(--ink-soft)]">{String(i + 1).padStart(2, "0")}/08</span>
              </p>
              <h3 className="display display-m mt-5">{e.t}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">{e.d}</p>
              {i === 0 && (
                <p className="mt-4">
                  <PlateFr value="GH-123-KL" className="text-xs" />
                </p>
              )}
            </li>
          ))}
        </ol>

        <div className="mt-20 grid grid-cols-1 items-end gap-10 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-4">
            <p className="display display-l">Chaque véhicule a sa place dans l&apos;échelle.</p>
            <p className="mt-4 leading-relaxed text-[var(--ink-soft)]">
              {STATUS_ORDER.length} statuts, de « Réceptionné » à « Restitué ». La liste des dossiers montre en un coup d&apos;œil où en est chaque voiture.
            </p>
          </div>
          <div className="min-w-0 md:col-span-8">
            <div className="scrollbar-thin overflow-x-auto">
              <Plan
                className="w-[48rem] md:w-auto"
                src={apercuStatuts}
                sizes="(min-width: 768px) 56rem, 48rem"
                alt="Liste des dossiers d'intervention dans GarageFlow. Six lignes, chacune avec son numéro de dossier, sa plaque, son véhicule, son client, son technicien, la date promise et son statut : Véhicule prêt, Contrôle final, Réceptionné, Attente pièces, Attente client, En réparation."
              />
            </div>
            <Legende className="mt-5">Liste des dossiers · copie d&apos;écran de l&apos;application, jeu de démonstration</Legende>
          </div>
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 03 · Le contrôle - feuille d'inspection                                    */
/* ========================================================================== */

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
    <section id="controle" className="public-dark scroll-mt-16 overflow-hidden py-20 sm:py-32">
      <Shell>
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <Kicker n="03">Le contrôle</Kicker>
            <h2 className="display-shout mt-6">
              {CHECKLIST_ITEMS.length} points. <span className="mark">Aucun oubli.</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-[var(--ink-soft)]">
              Toujours les mêmes, pour chaque véhicule. Ce qui n&apos;a pas été regardé reste marqué « non contrôlé » : c&apos;est une information, pas un
              oubli.
            </p>

          </div>

          {/* Deux écrans superposés : le dossier complet en fond, la feuille
              de contrôle devant, décalée vers le bas. */}
          <div className="relative lg:col-span-7">
            <div className="scrollbar-thin overflow-x-auto lg:overflow-visible">
              <Plan
                className="w-[46rem] lg:w-[125%]"
                src={apercuDossier}
                sizes="(min-width: 1024px) 64rem, 46rem"
                alt="Fiche d'un dossier d'intervention dans GarageFlow : plaque GH-123-KL, Peugeot 308, statut En réparation, client Jean Martin, 87 650 km, technicien Karim Benali, restitution prévue le 22/09 à 17:00. En dessous, les photos de réception, les constats du technicien et la décision du client ligne par ligne."
              />
            </div>
            <div className="mt-10 lg:-mt-40 lg:ml-[-4rem] lg:mr-10">
              <div className="scrollbar-thin overflow-x-auto lg:overflow-visible">
                <Plan
                  flip
                  className="w-[44rem] lg:w-auto"
                  src={apercuControle}
                  sizes="(min-width: 1024px) 44rem, 44rem"
                  alt="Feuille de contrôle véhicule dans GarageFlow. Pour chaque point, cinq états au choix : OK, À surveiller, Recommandé, Urgent, Non contrôlé. Les plaquettes avant sont marquées Urgent avec la mesure 2 mm, les pneus arrière À surveiller avec 3 mm. Un bouton Photo accompagne chaque point renseigné."
                />
              </div>
              <Legende className="mt-6">Dossier et feuille de contrôle · copies d&apos;écran de l&apos;application, jeu de démonstration</Legende>
            </div>
          </div>
        </div>

        {/* Feuille de contrôle recomposée, mêmes libellés que le produit. */}
        <div className="mt-24 border-t-2 border-[var(--ink)] pt-3 lg:mt-32">
          <p className="tech flex flex-wrap justify-between gap-2 text-xs text-[var(--ink-soft)]">
            <span>Feuille de contrôle · OR 2026-0001 · GH-123-KL</span>
            <span>Mêmes libellés que dans l&apos;application</span>
          </p>
          <div className="mt-5 sm:columns-2 sm:gap-x-10 lg:columns-4">
            {CHECKLIST_SECTIONS.map((section) => (
              <div key={section.section} className="mb-6 break-inside-avoid">
                <p className="field-tag rule-b pb-1.5">{section.section}</p>
                <ul className="mt-1.5">
                  {section.items.map((item) => {
                    const etat = ETATS[item.key] ?? "Non contrôlé";
                    const alerte = etat === "Urgent" || etat === "Recommandé";
                    return (
                      <li key={item.key} className="leader py-1 text-[0.8125rem]">
                        <span>{item.label}</span>
                        <span className="leader__fill" aria-hidden />
                        <span className={`tech flex items-center gap-1 text-[0.6875rem] uppercase tracking-[0.06em] ${alerte ? "mark font-semibold" : "text-[var(--ink-soft)]"}`}>
                          {/* La couleur seule ne suffit pas : le pictogramme double l'alerte. */}
                          {alerte && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />}
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
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 04 · La validation - bloc orange                                           */
/* ========================================================================== */

/* Reprise fidèle de la décision enregistrée sur le dossier D-2026-0001 du jeu
   de démonstration, visible sur l'écran du téléphone. Les deux doivent concorder. */
const LIGNES = [
  { t: "Remplacement plaquettes de frein avant", u: "Urgent", p: "175,00 €", d: "Accepté" },
  { t: "Vidange huile + filtre", u: "Recommandé", p: "110,00 €", d: "Accepté" },
  { t: "Balais d'essuie-glace avant", u: "À surveiller", p: "45,48 €", d: "Refusé" },
];

function Validation() {
  return (
    <section id="validation" className="public-signal scroll-mt-16 overflow-hidden">
      <Vague couleur="#161c24" accent="#0e1216" />
      <Shell className="py-20 sm:py-32">
        <div className="grid grid-cols-1 gap-16 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-7">
            <Kicker n="04">La validation client</Kicker>
            <h2 className="display-shout mt-6">Le client dit oui. Par écrit. Ligne par ligne.</h2>
            <p className="mt-8 max-w-[46ch] text-xl leading-[1.5]">
              Il reçoit un lien sur son téléphone. Il voit le diagnostic, les photos, le détail des prix, et coche ce qu&apos;il autorise.
            </p>

            <blockquote className="mt-10 border-l-2 border-[var(--ink)] pl-5">
              <p className="display display-m">« Les essuie-glaces, je les ferai moi-même. »</p>
              <footer className="field-tag mt-3">Commentaire joint à la réponse, conservé dans le dossier</footer>
            </blockquote>

            {/* La pièce archivée : ce que l'atelier garde en cas de litige. */}
            <div className="relative mt-12 max-w-xl bg-[#f4f3f0] text-[#14181d]">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#d7d4cc] px-5 py-3">
                <span className="tech text-[0.7rem] uppercase tracking-[0.13em] text-[#4b525b]">Réponse client archivée</span>
                <span className="tech text-[0.7rem] text-[#4b525b]">D-2026-0001 · v1 verrouillée</span>
              </div>
              <ul className="px-5">
                {LIGNES.map((l) => (
                  <li key={l.t} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-[#d7d4cc] py-3">
                    <p className={`font-semibold ${l.d === "Refusé" ? "text-[#4b525b] line-through" : ""}`}>{l.t}</p>
                    <p className="tech text-sm">{l.p}</p>
                    <p className="tech text-[0.7rem] uppercase tracking-[0.1em] text-[#4b525b]">{l.u}</p>
                    <p className={`tech flex items-center gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] ${l.d === "Accepté" ? "text-[#b3440a]" : "text-[#4b525b]"}`}>
                      {l.d === "Accepté" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                      {l.d}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between gap-4 px-5 pb-10 pt-4">
                <span className="tech text-[0.7rem] uppercase tracking-[0.13em]">Montant accepté</span>
                <span className="tech text-xl font-semibold">285,00 € TTC</span>
              </div>
              <span className="stamp absolute -bottom-4 right-6 border-[#b3440a] bg-[#f4f3f0] text-[#b3440a]">Accepté partiel</span>
            </div>

            <ul className="mt-16 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
              {[
                ["Aucun compte à créer", "Ni inscription, ni application à installer."],
                ["Acceptation partielle", "Il valide une ligne, refuse l'autre. L'atelier sait quoi faire."],
                ["Verrouillé après réponse", "Pour changer une proposition validée, on en crée une nouvelle version."],
                ["Lien à durée limitée", "Jeton aléatoire, expiration réglable, révocable depuis le dossier."],
              ].map(([t, d]) => (
                <li key={t} className="border-t-2 border-[var(--ink)] pt-3">
                  <p className="font-bold">{t}</p>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">{d}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-4 md:col-start-9">
            <Telephone className="mx-auto w-full max-w-[21rem] md:sticky md:top-24" sizes="21rem" />
          </div>
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* 05 · Les tarifs                                                            */
/* ========================================================================== */

function Tarifs() {
  const formules = [
    { plan: PLANS.ATELIER, pour: "Un garage indépendant et son équipe." },
    { plan: PLANS.RESEAU, pour: "Les structures à forte rotation, plusieurs ateliers." },
  ];

  return (
    <section id="tarifs" className="public-night scroll-mt-16 py-20 sm:py-32">
      <Shell>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="md:col-span-7">
            <Kicker n="05">Les tarifs</Kicker>
            <h2 className="display-shout mt-6">Un prix par garage. Pas par dossier.</h2>
          </div>
          <p className="self-end text-lg leading-relaxed text-[var(--ink-soft)] md:col-span-4 md:col-start-9">
            Dossiers, photos et diagnostics illimités dans les deux formules. Seul le nombre de comptes change. Sans engagement.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 border-t-2 border-[var(--ink)] md:grid-cols-2">
          {formules.map(({ plan, pour }, i) => (
            <article key={plan.key} className={`py-10 ${i === 1 ? "rule-t md:border-l md:border-t-0 md:border-l-[var(--rule)] md:pl-10" : "md:pr-10"}`}>
              <p className="flex items-baseline justify-between gap-4">
                <span className="display text-3xl">{plan.name}</span>
                <span className="field-tag">Jusqu&apos;à {plan.seats} comptes</span>
              </p>
              <p className="mt-2 text-[var(--ink-soft)]">{pour}</p>
              <p className="mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <span className={`figure-xxl text-[clamp(4rem,1.5rem+4.6vw,6.75rem)] ${i === 0 ? "mark" : ""}`}>{plan.priceHt}&nbsp;€</span>
                <span className="field-tag whitespace-nowrap">HT / mois</span>
              </p>
              <ul className="mt-10">
                {plan.features.map((f) => (
                  <li key={f} className="rule-b flex items-baseline gap-3 py-2.5 text-[0.9375rem]">
                    <Check className="mark h-4 w-4 shrink-0 translate-y-0.5" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="wave-line mt-4 h-3" aria-hidden />
        <div className="mt-10 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <p className="max-w-[48ch] text-lg leading-relaxed">
            <span className="font-bold">{TRIAL_DAYS} jours d&apos;essai, sans carte bancaire.</span>{" "}
            <span className="text-[var(--ink-soft)]">
              À la fin de l&apos;essai, rien n&apos;est supprimé : vos dossiers restent consultables et exportables. Prix affichés {formatPriceHt(PLANS.ATELIER)} et{" "}
              {formatPriceHt(PLANS.RESEAU)} HT par mois.
            </span>
          </p>
          <CtaPrincipal className="shrink-0" />
        </div>
      </Shell>
    </section>
  );
}

/* ========================================================================== */
/* Questions                                                                  */
/* ========================================================================== */

const QUESTIONS = [
  { q: "Faut-il installer un logiciel ?", r: "Non. GarageFlow fonctionne dans le navigateur, sur ordinateur, tablette et smartphone. L'application peut être ajoutée à l'écran d'accueil d'une tablette d'atelier." },
  { q: "Mes clients doivent-ils créer un compte ?", r: "Jamais. Ils reçoivent un lien personnel, valable quelques jours, qui leur montre le diagnostic et les travaux proposés. Ils répondent en deux clics." },
  { q: "Combien de temps pour démarrer ?", r: "Le temps de créer votre garage et d'ajouter votre équipe, soit une quinzaine de minutes. Le premier véhicule peut être réceptionné dans la foulée." },
  { q: "Que deviennent mes données si j'arrête ?", r: "Elles restent consultables et vous pouvez les exporter au format JSON depuis les paramètres, à tout moment, y compris après la fin de l'essai." },
  { q: "Les photos sont-elles protégées ?", r: "Elles ne sont jamais accessibles par une adresse devinable : chaque affichage passe par un lien signé qui expire au bout de quinze minutes." },
];

function Questions() {
  return (
    <section className="py-20 sm:py-32">
      <Shell>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-8">
          <div className="md:col-span-4">
            <div className="md:sticky md:top-24">
              <Kicker n="06">Questions</Kicker>
              <h2 className="display-shout mt-6 text-[clamp(2.1rem,1rem+3vw,3.75rem)]">Posées en atelier.</h2>
            </div>
          </div>
          <div className="faq border-t-2 border-[var(--ink)] md:col-span-8">
            {QUESTIONS.map((item, i) => (
              <details key={item.q} className="rule-b group" open={i === 0}>
                <summary className="flex items-center gap-5 py-6">
                  <span className="tech w-8 shrink-0 text-sm text-[var(--ink-soft)]">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="display flex-1 text-xl sm:text-2xl">{item.q}</h3>
                  <span className="faq__sign" aria-hidden />
                </summary>
                <p className="max-w-[60ch] pb-7 pl-[3.25rem] leading-relaxed text-[var(--ink-soft)]">{item.r}</p>
              </details>
            ))}
          </div>
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
    <section className="public-night overflow-hidden">
      <Vague couleur="#f4f3f0" />
      <Shell className="py-24 sm:py-36">
        <p className="field-tag">
          <span className="mark font-semibold">Bon pour accord</span>
        </p>
        <p className="display-hero mt-8 max-w-[14ch]">
          Le prochain véhicule, <span className="mark">suivez-le jusqu&apos;au bout.</span>
        </p>
        <div className="mt-14 flex flex-col items-start gap-8 md:flex-row md:items-center md:gap-12">
          <CtaPrincipal />
          <p className="max-w-[40ch] leading-relaxed text-[var(--ink-soft)]">
            Créez votre garage, ajoutez votre équipe, réceptionnez un véhicule aujourd&apos;hui. Déjà client ?{" "}
            <Link href="/login" className="text-[var(--ink)] underline underline-offset-4 hover:text-[var(--mark)]">
              Connexion
            </Link>
          </p>
        </div>
      </Shell>
    </section>
  );
}
