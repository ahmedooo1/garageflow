import Link from "next/link";
import { Logo } from "@/components/logo";

const NAV = [
  { href: "/#parcours", label: "Le parcours" },
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#portail", label: "Portail client" },
  { href: "/#tarifs", label: "Tarifs" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-steel-900 text-white">
      <header className="sticky top-0 z-50 border-b border-steel-700/70 bg-steel-900/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="GarageFlow, accueil">
            <Logo light />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Sections du site">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-steel-300 transition hover:bg-steel-800 hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/login" className="btn btn-ghost btn-sm px-2 text-steel-300 hover:bg-steel-800 hover:text-white sm:px-3.5">
              Connexion
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm px-3 sm:px-3.5">
              Essai<span className="hidden sm:inline">&nbsp;gratuit</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-steel-700 bg-steel-900">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <Logo light />
              <p className="mt-3 text-sm leading-relaxed text-steel-300">
                Le logiciel d&apos;atelier des garages indépendants : réception, diagnostic, validation client et restitution, sans papier.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3">
              <FooterGroup title="Produit" links={NAV} />
              <FooterGroup
                title="Compte"
                links={[
                  { href: "/register", label: "Créer un garage" },
                  { href: "/login", label: "Connexion" },
                  { href: "/forgot-password", label: "Mot de passe oublié" },
                ]}
              />
              <FooterGroup
                title="Légal"
                links={[
                  { href: "/cgu", label: "Conditions d'utilisation" },
                  { href: "/confidentialite", label: "Confidentialité" },
                ]}
              />
            </div>
          </div>
          <p className="mt-10 border-t border-steel-700 pt-6 text-xs text-steel-300">
            © {new Date().getFullYear()} GarageFlow. Hébergement en Union européenne. Aucune donnée n&apos;est revendue.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterGroup({ title, links }: { title: string; links: readonly { href: string; label: string }[] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-white">{title}</p>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-steel-300 transition hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
