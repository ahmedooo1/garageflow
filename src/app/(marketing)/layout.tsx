import Link from "next/link";
import { publicFontVars } from "@/lib/fonts";

const SECTIONS = [
  { href: "/#dossier", label: "Dossier" },
  { href: "/#parcours", label: "Parcours" },
  { href: "/#controle", label: "Contrôle" },
  { href: "/#validation", label: "Validation" },
  { href: "/#conditions", label: "Conditions" },
];

/** Marque typographique : lisible seule, sans pictogramme. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="h-2.5 w-2.5 shrink-0 bg-[var(--mark)]" aria-hidden />
      <span className="display text-[0.95rem] uppercase tracking-[0.06em] sm:text-base">Garageflow</span>
    </span>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`public flex min-h-dvh flex-col ${publicFontVars}`}>
      <header className="rule-b sticky top-0 z-50 bg-[var(--paper)]">
        <div className="mx-auto flex h-16 max-w-[84rem] items-center gap-4 px-5 sm:px-8">
          <Link href="/" aria-label="GarageFlow, accueil">
            <Wordmark />
          </Link>

          <nav className="ml-8 hidden flex-1 items-center gap-7 lg:flex" aria-label="Sections">
            {SECTIONS.map((s, i) => (
              <Link key={s.href} href={s.href} className="field-tag transition-colors hover:text-[var(--ink)]">
                <span className="mark">{String(i + 1).padStart(2, "0")}</span> {s.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-4 sm:gap-6">
            <Link href="/login" className="field-tag transition-colors hover:text-[var(--ink)]">
              Connexion
            </Link>
            <Link href="/register" className="link-arrow text-sm">
              Essai<span className="hidden sm:inline">&nbsp;14 jours</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="rule-heavy mt-24">
        <div className="mx-auto max-w-[84rem] px-5 py-14 sm:px-8">
          <div className="grid gap-12 md:grid-cols-[1.4fr_2fr]">
            <div>
              <Wordmark />
              <p className="measure-tight mt-4 text-sm leading-relaxed text-[var(--ink-soft)]">
                Logiciel d&apos;atelier pour garages indépendants. Réception, diagnostic, validation client, restitution. Édité en France.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <FooterColumn
                tag="Sections"
                links={SECTIONS}
              />
              <FooterColumn
                tag="Compte"
                links={[
                  { href: "/register", label: "Créer un garage" },
                  { href: "/login", label: "Connexion" },
                  { href: "/forgot-password", label: "Mot de passe oublié" },
                ]}
              />
              <FooterColumn
                tag="Légal"
                links={[
                  { href: "/cgu", label: "Conditions d'utilisation" },
                  { href: "/confidentialite", label: "Confidentialité" },
                ]}
              />
            </div>
          </div>

          <p className="rule-t tech mt-12 pt-5 text-[0.7rem] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            © {new Date().getFullYear()} GarageFlow · Hébergement Union européenne · Aucune donnée revendue · Réf. GF-{new Date().getFullYear()}-FR
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ tag, links }: { tag: string; links: readonly { href: string; label: string }[] }) {
  return (
    <div>
      <p className="field-tag rule-b pb-2">{tag}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
