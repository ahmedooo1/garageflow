import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

/**
 * Seuil entre le site et le produit : chrome documentaire (papier, filets),
 * contrôles de formulaire identiques à ceux de l'application.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session) redirect("/app/atelier");

  return (
    <div className="flex min-h-dvh flex-col bg-[#f4f3f0]">
      <header className="border-b border-[#d7d4cc]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-5">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="GarageFlow, accueil">
            <span className="h-2.5 w-2.5 bg-accent" aria-hidden />
            <span className="text-[0.95rem] font-extrabold uppercase tracking-[0.06em] text-ink">Garageflow</span>
          </Link>
          <Link href="/" className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted hover:text-ink">
            ← Retour au site
          </Link>
        </div>
      </header>

      <div className="flex flex-1 items-start justify-center px-5 py-12 sm:py-16">
        <div className="w-full max-w-md border border-[#d7d4cc] bg-white p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
}
