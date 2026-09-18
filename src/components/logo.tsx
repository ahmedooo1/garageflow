import clsx from "clsx";

export function Logo({ light, compact }: { light?: boolean; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-extrabold tracking-tight", light ? "text-white" : "text-ink")}>
      <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent text-white" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
      </span>
      {!compact && (
        <span className="text-xl">
          Garage<span className="text-accent">Flow</span>
        </span>
      )}
    </span>
  );
}
