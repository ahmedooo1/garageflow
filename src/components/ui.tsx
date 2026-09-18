import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line sm:px-5">
          {title && <h2 className="text-base font-bold text-ink">{title}</h2>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink mb-1">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
  required,
  className,
}: {
  label: string;
  name?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="field-label">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-sm font-medium text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "danger", children, className }: { tone?: "danger" | "ok" | "info" | "warn"; children: ReactNode; className?: string }) {
  const tones = {
    danger: "bg-danger-soft text-danger border-danger/30",
    ok: "bg-ok-soft text-ok border-ok/30",
    info: "bg-info-soft text-info border-info/30",
    warn: "bg-warn-soft text-warn border-warn/30",
  };
  return (
    <div role="alert" className={clsx("rounded-[10px] border px-4 py-3 text-sm font-medium", tones[tone], className)}>
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center">
      <p className="font-bold text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Plate({ plate, className }: { plate: string; className?: string }) {
  const p = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = p.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  return <span className={clsx("plate", className)}>{m ? `${m[1]}-${m[2]}-${m[3]}` : plate.toUpperCase()}</span>;
}

export function KV({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="kv grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label}>
          <dt>{it.label}</dt>
          <dd>{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pill({ tone, children, className, size }: { tone: "slate" | "blue" | "amber" | "orange" | "green" | "red" | "purple"; children: ReactNode; className?: string; size?: "lg" }) {
  const tones = {
    slate: "bg-steel-300/30 text-steel-800",
    blue: "bg-info-soft text-info",
    amber: "bg-warn-soft text-warn",
    orange: "bg-accent-soft text-accent-ink",
    green: "bg-ok-soft text-ok",
    red: "bg-danger-soft text-danger",
    purple: "bg-violet-soft text-violet",
  };
  return <span className={clsx("badge", size === "lg" && "badge-lg", tones[tone], className)}>{children}</span>;
}
