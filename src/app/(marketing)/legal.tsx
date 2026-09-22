import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <article className="pb-10 pt-10 sm:pt-14">
      <div className="mx-auto max-w-[84rem] px-5 sm:px-8">
        <p className="field-tag rule-b flex flex-wrap items-baseline justify-between gap-2 pb-3">
          <span>Document contractuel</span>
          <span>Mise à jour {updatedAt}</span>
        </p>

        <div className="mt-10 grid gap-10 md:grid-cols-12">
          <h1 className="display display-l md:col-span-7">{title}</h1>
          <p className="self-end text-sm leading-relaxed text-[var(--ink-soft)] md:col-span-4 md:col-start-9">
            <Link href="/" className="link-arrow text-sm">
              <span aria-hidden>←</span> Retour à l&apos;accueil
            </Link>
          </p>
        </div>

        <div className="mt-14 md:grid md:grid-cols-12">
          <div className="md:col-span-8">{children}</div>
          <aside className="rule-t mt-12 pt-5 md:col-span-3 md:col-start-10 md:mt-0">
            <p className="field-tag">Contact</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
              Une question sur ce document ? Écrivez à <span className="tech text-[var(--ink)]">contact@garageflow.fr</span>.
            </p>
          </aside>
        </div>
      </div>
    </article>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  const numbered = title.match(/^(\d+)\.\s*(.+)$/);
  const n = numbered?.[1];
  const label = numbered?.[2] ?? title;

  return (
    <section className="rule-t grid gap-x-6 gap-y-3 py-7 first:border-t-2 first:border-[var(--ink)] sm:grid-cols-[3rem_1fr]">
      <p className="tech pt-1 text-sm text-[var(--ink-soft)]">{n ? String(n).padStart(2, "0") : "-"}</p>
      <div>
        <h2 className="display display-m">{label}</h2>
        <div className="measure mt-3 space-y-3 leading-relaxed text-[var(--ink-soft)]">{children}</div>
      </div>
    </section>
  );
}
