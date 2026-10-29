import Link from "next/link";
import { logout } from "@/lib/actions";

/** Sticky top bar: back link on inner pages, search and logout everywhere. */
export function Header({ title, back }: { title: string; back?: { href: string; label: string } }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        {back ? (
          <Link href={back.href} className="text-accent" aria-label={`Volver a ${back.label}`}>
            ‹ {back.label}
          </Link>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        <Link href="/search" className="text-muted" aria-label="Buscar">
          Buscar
        </Link>
        <form action={logout}>
          <button className="text-muted" type="submit">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}

export function Main({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4 pb-16">{children}</main>;
}
