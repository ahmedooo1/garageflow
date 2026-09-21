import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSignature,
  History,
  LayoutGrid,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { formatPriceHt, PLANS, PLAN_ORDER, TRIAL_DAYS } from "@/lib/plans";
import { getSession } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "GarageFlow · Le logiciel d'atelier des garages indépendants",
  description:
    "Réception photo, diagnostic, validation des travaux par le client en un lien, réparation et restitution. GarageFlow suit chaque véhicule de l'entrée à la clé rendue.",
};

export default async function LandingPage() {
  const session = await getSession();
  if (session) redirect("/app/atelier");

  return (
    <>
      <Hero />
      <TrustBand />
      <Workflow />
      <Features />
      <CustomerPortal />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="shop-grid shop-glow relative overflow-hidden border-b border-steel-700">
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-10 lg:px-8 lg:pb-28 lg:pt-24">
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-accent">
            <Wrench className="h-3.5 w-3.5" />
            Conçu pour l&apos;atelier, pas pour le bureau
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            L&apos;atelier sous contrôle,
            <br />
            <span className="text-accent">du client à la clé rendue.</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-steel-300">
            GarageFlow suit chaque véhicule : réception en photos, diagnostic du technicien, validation des travaux par le client en un lien, réparation, restitution. Plus de devis perdus, plus de « je n&apos;avais pas dit oui pour ça ».
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/register" className="btn btn-primary btn-lg shadow-xl shadow-accent/25">
              Essayer {TRIAL_DAYS} jours gratuitement
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="#parcours" className="btn btn-lg border-steel-600 bg-steel-800 text-white hover:bg-steel-700">
              Voir le parcours complet
            </Link>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-steel-300">
            {["Sans carte bancaire", "Sur tablette et smartphone", "Vos données exportables"].map((item) => (
              <li key={item} className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-ok" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative lg:pl-4">
          <BoardMock />
        </div>
      </div>
      <div className="hazard-stripe" aria-hidden />
    </section>
  );
}

/** Réplique fidèle du tableau d'atelier, pour montrer le produit réel. */
function BoardMock() {
  const lanes = [
    {
      label: "Diagnostic",
      accent: "var(--color-info)",
      cards: [{ plate: "GH-123-KL", model: "Peugeot 308", customer: "Jean Martin", tech: "KB", time: "17:00", status: "Diagnostic en cours", tone: "var(--color-info)" }],
    },
    {
      label: "Attente client",
      accent: "var(--color-warn)",
      cards: [{ plate: "EZ-789-DE", model: "Volkswagen Golf", customer: "Sophie Leroux", tech: "JM", time: "12:00", status: "Attente client", tone: "var(--color-warn)" }],
    },
    {
      label: "En réparation",
      accent: "var(--color-accent)",
      cards: [
        { plate: "DK-321-FG", model: "Citroën Jumper", customer: "Marc Fontaine", tech: "KB", time: "Retard", tone: "var(--color-danger)", status: "En réparation", late: true },
        { plate: "GT-654-HJ", model: "Toyota Yaris", customer: "Nadia Haddad", tech: "JM", time: "18:00", status: "En réparation", tone: "var(--color-accent)" },
      ],
    },
    {
      label: "Prêt",
      accent: "var(--color-ok)",
      cards: [{ plate: "FR-147-LN", model: "Peugeot 3008", customer: "Bernard Petit", tech: "JM", time: "16:00", status: "Véhicule prêt", tone: "var(--color-ok)" }],
    },
  ];

  return (
    <div className="float-slow rounded-[18px] border border-steel-600 bg-steel-800/90 p-3 shadow-2xl shadow-black/50 sm:p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-steel-300">Garage Normandie Auto</p>
          <p className="text-lg font-extrabold">Atelier</p>
        </div>
        <span className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold">+ Réception</span>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-2">
        {[
          { v: "6", l: "en cours" },
          { v: "1", l: "en retard", tone: "bg-danger" },
          { v: "1", l: "attente client", tone: "bg-warn" },
          { v: "1", l: "prêts", tone: "bg-ok" },
        ].map((k) => (
          <div key={k.l} className={`rounded-lg px-2 py-1.5 ${k.tone ?? "bg-steel-700"}`}>
            <p className="text-base font-extrabold leading-none">{k.v}</p>
            <p className="truncate text-[9px] font-bold uppercase tracking-wide opacity-80">{k.l}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {lanes.map((lane) => (
          <div key={lane.label} className="rounded-xl bg-steel-900/70 p-1.5">
            <div className="mb-1.5 h-0.5 rounded-full" style={{ background: lane.accent }} aria-hidden />
            <p className="mb-1.5 truncate px-0.5 text-[9px] font-extrabold uppercase tracking-wider text-steel-300">{lane.label}</p>
            <div className="flex flex-col gap-1.5">
              {lane.cards.map((c) => (
                <div key={c.plate} className="mock-card p-1.5 pl-2" style={{ borderLeft: `3px solid ${c.tone}` }}>
                  <p className="font-mono text-[9px] font-bold tracking-wider text-ink">{c.plate}</p>
                  <p className="truncate text-[11px] font-extrabold leading-tight">{c.model}</p>
                  <p className="truncate text-[9px] text-muted">{c.customer}</p>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-steel-800 text-[6px] font-bold text-white">{c.tech}</span>
                    <span className={`text-[8px] font-bold ${c.late ? "text-danger" : "text-muted"}`}>{c.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bandeau de repères                                                          */
/* -------------------------------------------------------------------------- */

function TrustBand() {
  const items = [
    { value: "13", label: "statuts suivis, de l'arrivée à la clôture" },
    { value: "1 lien", label: "pour que le client accepte ou refuse" },
    { value: "0 papier", label: "photos et signatures horodatées" },
    { value: `${TRIAL_DAYS} jours`, label: "d'essai, sans carte bancaire" },
  ];
  return (
    <section className="border-b border-steel-700 bg-steel-800">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map((i) => (
          <div key={i.label} className="reveal">
            <p className="text-3xl font-extrabold tracking-tight text-accent">{i.value}</p>
            <p className="mt-1 text-sm leading-snug text-steel-300">{i.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Parcours                                                                    */
/* -------------------------------------------------------------------------- */

const STEPS = [
  { n: "01", icon: Camera, title: "Réception", text: "Client, véhicule, kilométrage, motif. Photos avant, arrière, côtés, intérieur, tableau de bord. Les dommages existants sont documentés dès l'entrée." },
  { n: "02", icon: Stethoscope, title: "Diagnostic", text: "Le technicien saisit ses constats avec un niveau d'urgence et des photos. Rien n'est généré automatiquement : c'est son métier, pas un algorithme." },
  { n: "03", icon: ClipboardCheck, title: "Contrôle", text: "Checklist de 17 points : pneus, freins, moteur, visibilité, éclairage. Chaque point est OK, à surveiller, recommandé ou urgent." },
  { n: "04", icon: FileSignature, title: "Proposition", text: "Chaque intervention chiffrée : pièces, main-d'œuvre, TVA, total TTC. Les montants sont calculés au centime, jamais en virgule flottante." },
  { n: "05", icon: Smartphone, title: "Validation client", text: "Un lien sécurisé, sans compte à créer. Le client accepte certaines réparations, en refuse d'autres. La décision est horodatée et verrouillée." },
  { n: "06", icon: Wrench, title: "Réparation", text: "L'atelier ne travaille que sur ce qui a été accepté. Chaque intervention réalisée est cochée au fur et à mesure." },
  { n: "07", icon: ShieldCheck, title: "Contrôle final", text: "Essai routier, niveaux, voyants, outils retirés, véhicule propre. Le véhicule ne passe « prêt » qu'une fois ce contrôle enregistré." },
  { n: "08", icon: History, title: "Restitution", text: "Travaux réalisés, travaux refusés, montant final, kilométrage de sortie. Tout reste dans l'historique du véhicule et du client." },
];

function Workflow() {
  return (
    <section id="parcours" className="scroll-mt-20 bg-steel-900 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-2xl reveal">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Le parcours</p>
          <h2 className="section-title mt-3">Huit étapes, aucune zone grise.</h2>
          <p className="mt-4 text-lg leading-relaxed text-steel-300">
            Chaque véhicule avance d&apos;une étape à l&apos;autre selon des règles vérifiées par le serveur. On ne peut pas marquer un véhicule prêt sans contrôle final, ni réparer ce que le client n&apos;a pas accepté.
          </p>
        </header>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-[18px] bg-steel-700 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="reveal group relative bg-steel-900 p-6 transition hover:bg-steel-800">
              <span className="absolute right-5 top-5 font-mono text-2xl font-extrabold text-steel-700 transition group-hover:text-accent/40">{s.n}</span>
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-steel-300">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Fonctionnalités                                                             */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  { icon: LayoutGrid, title: "Tableau d'atelier", text: "Huit couloirs, une carte par véhicule : plaque, client, technicien, heure promise. Les retards passent en rouge. Lisible à deux mètres, sur l'écran de l'atelier." },
  { icon: Camera, title: "Photos horodatées", text: "Prises depuis le téléphone, redimensionnées et servies par des liens signés qui expirent. L'état du véhicule à l'entrée n'est plus discutable." },
  { icon: Smartphone, title: "Validation en 2 clics", text: "Le client ouvre le lien, voit le diagnostic photo à l'appui, autorise ou refuse chaque ligne. Vous recevez sa réponse dans le dossier." },
  { icon: Clock, title: "Rien ne se perd", text: "Chaque action crée un événement daté : photo ajoutée, estimation envoyée, décision du client, véhicule restitué. La timeline fait foi." },
  { icon: ShieldCheck, title: "Cloisonnement strict", text: "Chaque garage ne voit que ses données. Rôles gérant, réception et technicien. Journal d'audit sur les actions sensibles." },
  { icon: History, title: "Historique véhicule", text: "À chaque passage, retrouvez ce qui a été accepté, ce qui a été refusé et à quel kilométrage. Le refus d'hier devient l'argument de demain." },
];

function Features() {
  return (
    <section id="fonctionnalites" className="scroll-mt-20 border-y border-line bg-canvas py-20 text-ink lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="max-w-2xl reveal">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Fonctionnalités</p>
          <h2 className="section-title mt-3">Pensé pour des mains sales.</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">
            Grandes zones tactiles, statuts très visibles, aucune fenêtre modale à refermer. Le technicien travaille sur tablette, la réception sur ordinateur, le client sur son téléphone.
          </p>
        </header>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="reveal card p-6 transition hover:-translate-y-1 hover:shadow-lg">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-steel-900 text-white">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Portail client                                                              */
/* -------------------------------------------------------------------------- */

function CustomerPortal() {
  return (
    <section id="portail" className="shop-grid scroll-mt-20 relative overflow-hidden bg-steel-900 py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
        <div className="reveal">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Portail client</p>
          <h2 className="section-title mt-3">
            Le client répond lui-même.
            <br />
            Par écrit. Horodaté.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-steel-300">
            Vous envoyez un lien par email ou SMS. Le client ouvre, lit le diagnostic, regarde les photos et tranche ligne par ligne. Aucun compte à créer, aucune application à installer.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { t: "Acceptation partielle", d: "Il valide les plaquettes, refuse la vidange. Vous savez exactement quoi faire." },
              { t: "Verrouillé après réponse", d: "Une proposition validée ne peut plus être modifiée en silence. Pour changer, vous créez une nouvelle version." },
              { t: "Lien à durée limitée", d: "Jeton à usage unique, expiration configurable, révocable à tout moment depuis le dossier." },
            ].map((i) => (
              <li key={i.t} className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
                <span>
                  <strong className="font-bold">{i.t}</strong>
                  <span className="block text-sm leading-relaxed text-steel-300">{i.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="reveal flex justify-center">
          <PhoneMock />
        </div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <div className="float-slow w-full max-w-[19rem] rounded-[2.2rem] border-[10px] border-steel-700 bg-canvas shadow-2xl shadow-black/60">
      <div className="rounded-t-[1.5rem] bg-steel-900 px-4 py-3">
        <p className="text-right text-[11px] font-bold leading-tight text-white">
          Garage Normandie Auto
          <span className="block text-[9px] font-normal text-steel-300">02 31 00 00 00</span>
        </p>
      </div>

      <div className="space-y-3 p-3 text-ink">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted">Proposition · D-2026-0002</p>
          <p className="text-base font-extrabold leading-tight">Bonjour Sophie Leroux</p>
          <p className="text-[11px] text-ink-2">Votre Volkswagen Golf · 112 480 km</p>
        </div>

        <div className="rounded-xl border-2 border-ok bg-ok-soft/50 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-bold leading-tight">Remplacement vanne EGR</p>
            <span className="badge shrink-0 bg-danger-soft text-[8px] text-danger">Urgent</span>
          </div>
          <p className="mt-1 text-base font-extrabold">510,00 €</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <span className="grid min-h-8 place-items-center rounded-lg bg-ok text-[10px] font-bold text-white">✓ Autoriser</span>
            <span className="grid min-h-8 place-items-center rounded-lg border border-line-strong bg-surface text-[10px] font-bold text-ink-2">Refuser</span>
          </div>
        </div>

        <div className="rounded-xl border-2 border-danger/50 bg-danger-soft/40 p-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[12px] font-bold leading-tight">Nettoyage admission</p>
            <span className="badge shrink-0 bg-accent-soft text-[8px] text-accent-ink">Recommandé</span>
          </div>
          <p className="mt-1 text-base font-extrabold">150,00 €</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <span className="grid min-h-8 place-items-center rounded-lg border border-line-strong bg-surface text-[10px] font-bold text-ink-2">Autoriser</span>
            <span className="grid min-h-8 place-items-center rounded-lg bg-danger-soft text-[10px] font-bold text-danger ring-1 ring-danger/40">✕ Refuser</span>
          </div>
        </div>

        <div className="rounded-xl bg-surface-2 p-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span>Total proposé</span>
            <span>660,00 € TTC</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[13px] font-extrabold">
            <span>Montant accepté</span>
            <span>510,00 € TTC</span>
          </div>
        </div>

        <span className="grid min-h-10 place-items-center rounded-xl bg-accent text-[12px] font-bold text-white">Confirmer ma décision</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tarifs                                                                      */
/* -------------------------------------------------------------------------- */

function Pricing() {
  return (
    <section id="tarifs" className="scroll-mt-20 border-y border-line bg-canvas py-20 text-ink lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-2xl text-center reveal">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Tarifs</p>
          <h2 className="section-title mt-3">Un prix par garage, pas par dossier.</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">
            {TRIAL_DAYS} jours d&apos;essai avec toutes les fonctionnalités, sans carte bancaire. Ensuite, un abonnement mensuel sans engagement.
          </p>
        </header>

        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {PLAN_ORDER.map((key, index) => {
            const plan = PLANS[key];
            const highlighted = index === 0;
            return (
              <article
                key={key}
                className={`reveal relative flex flex-col rounded-[16px] border-2 bg-surface p-7 ${highlighted ? "border-accent shadow-xl" : "border-line"}`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">Le plus choisi</span>
                )}
                <h3 className="text-xl font-extrabold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tracking-tight">{formatPriceHt(plan)}</span>
                  <span className="text-sm font-semibold text-muted">/ mois HT</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/register" className={`btn btn-lg mt-7 ${highlighted ? "btn-primary" : "btn-dark"}`}>
                  Démarrer l&apos;essai
                </Link>
              </article>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted">
          À la fin de l&apos;essai, vos données restent consultables et exportables. Seule la création de nouveaux dossiers est suspendue.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* FAQ                                                                         */
/* -------------------------------------------------------------------------- */

const FAQ = [
  { q: "Faut-il installer un logiciel ?", a: "Non. GarageFlow fonctionne dans le navigateur, sur ordinateur, tablette et smartphone. L'application peut être ajoutée à l'écran d'accueil d'une tablette d'atelier." },
  { q: "Mes clients doivent-ils créer un compte ?", a: "Jamais. Ils reçoivent un lien personnel, valable quelques jours, qui leur montre le diagnostic et les travaux proposés. Ils répondent en deux clics." },
  { q: "Combien de temps pour démarrer ?", a: "Le temps de créer votre garage et d'ajouter votre équipe, soit une quinzaine de minutes. Le premier véhicule peut être réceptionné dans la foulée." },
  { q: "Que deviennent mes données si j'arrête ?", a: "Elles restent consultables et vous pouvez les exporter au format JSON depuis les paramètres, à tout moment, y compris après la fin de l'essai." },
  { q: "Les photos sont-elles protégées ?", a: "Elles ne sont jamais accessibles par une adresse devinable : chaque affichage passe par un lien signé qui expire au bout de quinze minutes." },
  { q: "Y a-t-il de l'intelligence artificielle ?", a: "Non, et c'est volontaire. Le diagnostic est saisi par le technicien. Aucun constat, aucun prix n'est généré automatiquement." },
];

function Faq() {
  return (
    <section className="bg-steel-900 py-20 lg:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 className="section-title reveal text-center">Questions fréquentes</h2>
        <div className="mt-10 divide-y divide-steel-700 border-y border-steel-700">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-bold marker:hidden">
                {item.q}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-steel-600 text-accent transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 pr-11 leading-relaxed text-steel-300">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Appel final                                                                 */
/* -------------------------------------------------------------------------- */

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-accent py-16 text-white lg:py-20">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="section-title">Le prochain véhicule qui entre, suivez-le de bout en bout.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/90">
          Créez votre garage en deux minutes et réceptionnez votre premier véhicule aujourd&apos;hui.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/register" className="btn btn-lg bg-steel-900 text-white hover:bg-steel-800">
            Créer mon garage
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link href="/login" className="btn btn-lg border-white/40 bg-transparent text-white hover:bg-white/10">
            J&apos;ai déjà un compte
          </Link>
        </div>
      </div>
    </section>
  );
}
