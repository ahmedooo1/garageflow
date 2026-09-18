import { Search } from "lucide-react";

export function SearchForm({ q, placeholder, extra }: { q?: string; placeholder: string; extra?: React.ReactNode }) {
  return (
    <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input type="search" name="q" defaultValue={q ?? ""} placeholder={placeholder} className="input pl-10" autoComplete="off" enterKeyHint="search" />
      </div>
      {extra}
      <button type="submit" className="btn btn-dark">
        Rechercher
      </button>
    </form>
  );
}
