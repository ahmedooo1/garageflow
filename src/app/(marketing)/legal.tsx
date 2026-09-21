import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <article className="bg-canvas py-14 text-ink lg:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm font-semibold text-muted hover:text-ink">
          ← Retour à l&apos;accueil
        </Link>
        <h1 className="section-title mt-4">{title}</h1>
        <p className="mt-2 text-sm text-muted">Dernière mise à jour : {updatedAt}</p>
        <div className="mt-10 space-y-8">{children}</div>
        <p className="mt-12 rounded-[12px] border border-line bg-surface-2 p-4 text-sm text-ink-2">
          Une question sur ce document ? Écrivez à <span className="font-semibold">contact@garageflow.fr</span>.
        </p>
      </div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-extrabold">{title}</h2>
      <div className="mt-2 space-y-3 leading-relaxed text-ink-2">{children}</div>
    </section>
  );
}
